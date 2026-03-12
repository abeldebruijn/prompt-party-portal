import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireViewer } from "../lib/auth";
import {
  DEFAULT_TEXT_GAME_ROUND_COUNT,
  IMAGE_GAME_NAME,
  MAX_TEXT_GAME_ROUND_COUNT,
  sanitizeImageGamePrompt,
} from "../lib/lobby";
import {
  findViewerPlayer,
  getLobbyOrThrow,
  sortPlayers,
} from "../lobbies/helpers";
import { PRESENT_DURATION_MS } from "../game/constants";
import { shuffleArray } from "../game/random";

type DbContext = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;

export function clampRoundCount(roundCount?: number) {
  if (
    roundCount === undefined ||
    !Number.isInteger(roundCount) ||
    Number.isNaN(roundCount)
  ) {
    return DEFAULT_TEXT_GAME_ROUND_COUNT;
  }

  return Math.max(1, Math.min(MAX_TEXT_GAME_ROUND_COUNT, roundCount));
}

export async function requireImageGameHost(
  ctx: MutationCtx,
  lobbyId: Id<"lobbies">,
) {
  const viewer = await requireViewer(ctx);
  const lobby = await getLobbyOrThrow(ctx, lobbyId);

  if (lobby.hostUserId !== viewer._id) {
    throw new Error("Only the lobby host can do that.");
  }

  if (lobby.selectedGame !== IMAGE_GAME_NAME) {
    throw new Error("This lobby is not using the image game.");
  }

  return { lobby, viewer };
}

export async function requireImageGameMembership(
  ctx: QueryCtx | MutationCtx,
  lobbyId: Id<"lobbies">,
) {
  const viewer = await requireViewer(ctx);
  const lobby = await getLobbyOrThrow(ctx, lobbyId);

  if (lobby.selectedGame !== IMAGE_GAME_NAME) {
    throw new Error("This lobby is not using the image game.");
  }

  const player = await findViewerPlayer(ctx, lobbyId, viewer._id);

  if (player === null || !player.isActive) {
    throw new Error("You must be an active player in this lobby.");
  }

  return { lobby, viewer, player };
}

export async function getActiveSession(ctx: DbContext, lobbyId: Id<"lobbies">) {
  const sessions = await ctx.db
    .query("imageGameSessions")
    .withIndex("lobbyId", (query) => query.eq("lobbyId", lobbyId))
    .order("desc")
    .collect();

  return (
    sessions.find((session) => session.status === "InProgress") ??
    sessions[0] ??
    null
  );
}

export async function getCurrentRound(
  ctx: DbContext,
  sessionId: Id<"imageGameSessions">,
  roundNumber: number,
) {
  return await ctx.db
    .query("imageGameRounds")
    .withIndex("sessionIdAndRoundNumber", (query) =>
      query.eq("sessionId", sessionId).eq("roundNumber", roundNumber),
    )
    .unique();
}

export async function listRoundSubmissions(
  ctx: DbContext,
  roundId: Id<"imageGameRounds">,
) {
  return await ctx.db
    .query("imageGameSubmissions")
    .withIndex("roundId", (query) => query.eq("roundId", roundId))
    .collect();
}

export async function listActiveHumanPlayers(
  ctx: DbContext,
  lobbyId: Id<"lobbies">,
) {
  const players = await ctx.db
    .query("lobbyPlayers")
    .withIndex("lobbyIdAndIsActive", (query) =>
      query.eq("lobbyId", lobbyId).eq("isActive", true),
    )
    .collect();

  return players.filter((player) => player.kind === "human").sort(sortPlayers);
}

export async function listAllActivePlayers(
  ctx: DbContext,
  lobbyId: Id<"lobbies">,
) {
  return (
    await ctx.db
      .query("lobbyPlayers")
      .withIndex("lobbyIdAndIsActive", (query) =>
        query.eq("lobbyId", lobbyId).eq("isActive", true),
      )
      .collect()
  ).sort(sortPlayers);
}

export function renderPrompt(template: string, person: string) {
  return template.replaceAll("{person}", person);
}

export async function createRound(
  ctx: MutationCtx,
  session: Doc<"imageGameSessions">,
  lobbyId: Id<"lobbies">,
  roundNumber: number,
  now: number,
) {
  const eligiblePlayers = await listActiveHumanPlayers(ctx, lobbyId);

  if (eligiblePlayers.length < 2) {
    throw new Error(
      "At least two active human players are required for the image game.",
    );
  }

  const promptId = session.promptIds[roundNumber - 1];

  if (!promptId) {
    throw new Error("The requested image-game prompt could not be found.");
  }

  const prompt = await ctx.db.get(promptId);

  if (prompt === null || !prompt.isActive) {
    throw new Error("The requested image-game prompt could not be found.");
  }

  const targetPlayer =
    eligiblePlayers[(roundNumber - 1) % eligiblePlayers.length];

  const roundId = await ctx.db.insert("imageGameRounds", {
    sessionId: session._id,
    lobbyId,
    roundNumber,
    promptId,
    promptText: renderPrompt(prompt.template, targetPlayer.displayName),
    targetPlayerId: targetPlayer._id,
    eligiblePlayerIds: eligiblePlayers.map((player) => player._id),
    stage: "Generate",
    stageStartedAt: now,
  });

  return {
    roundId,
    prompt,
    targetPlayer,
    eligiblePlayers,
  };
}

export async function computeLeaderboard(
  ctx: DbContext,
  sessionId: Id<"imageGameSessions">,
) {
  const rounds = await ctx.db
    .query("imageGameRounds")
    .withIndex("sessionId", (query) => query.eq("sessionId", sessionId))
    .collect();
  const submissionsByRound = await Promise.all(
    rounds.map((round) => listRoundSubmissions(ctx, round._id)),
  );
  const playerIds = [
    ...new Set(rounds.flatMap((round) => round.eligiblePlayerIds.map(String))),
  ] as string[];
  const players = await Promise.all(
    playerIds.map((playerId) => ctx.db.get(playerId as Id<"lobbyPlayers">)),
  );
  const scoreMap = new Map<string, number>();
  const nameMap = new Map<string, string>();

  for (const player of players) {
    if (player !== null) {
      scoreMap.set(player._id, 0);
      nameMap.set(player._id, player.displayName);
    }
  }

  for (const submissions of submissionsByRound) {
    for (const submission of submissions) {
      const score = submission.totalScore ?? 0;
      scoreMap.set(
        submission.authorPlayerId,
        (scoreMap.get(submission.authorPlayerId) ?? 0) + score,
      );
    }
  }

  return [...scoreMap.entries()]
    .map(([playerId, score]) => ({
      playerId: playerId as Id<"lobbyPlayers">,
      displayName: nameMap.get(playerId) ?? "Unknown player",
      score,
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.displayName.localeCompare(right.displayName),
    )
    .map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));
}

export async function buildWinningSubmissions(
  ctx: DbContext,
  round: Doc<"imageGameRounds">,
) {
  const submissions = await listRoundSubmissions(ctx, round._id);
  const scoredSubmissions = submissions.filter(
    (submission) => submission.totalScore !== undefined,
  );

  if (scoredSubmissions.length === 0) {
    return [];
  }

  const topScore = Math.max(
    ...scoredSubmissions.map((submission) => submission.totalScore ?? 0),
  );
  const winners = scoredSubmissions.filter(
    (submission) => submission.totalScore === topScore,
  );
  const authors = await Promise.all(
    winners.map((winner) => ctx.db.get(winner.authorPlayerId)),
  );

  return winners.map((winner, index) => ({
    submissionId: winner._id,
    prompt: winner.prompt,
    imageStorageId: winner.imageStorageId,
    imageMediaType: winner.imageMediaType,
    totalScore: winner.totalScore ?? 0,
    correctnessStars: winner.correctnessStars ?? 0,
    creativityStars: winner.creativityStars ?? 0,
    authorDisplayName: authors[index]?.displayName ?? "Unknown player",
  }));
}

export function sanitizePromptInput(prompt: string) {
  const sanitized = sanitizeImageGamePrompt(prompt);

  if (sanitized.length < 1) {
    throw new Error("Submissions need at least one visible character.");
  }

  return sanitized;
}

export async function moveRoundToPresent(
  ctx: MutationCtx,
  round: Doc<"imageGameRounds">,
  now: number,
) {
  await ctx.db.patch(round._id, {
    stage: "Present",
    stageStartedAt: now,
    presentEndsAt: now + PRESENT_DURATION_MS,
  });
}

export async function selectPromptIds(
  ctx: MutationCtx,
  lobbyId: Id<"lobbies">,
  roundCount: number,
) {
  const prompts = await ctx.db
    .query("textGamePrompts")
    .withIndex("isActive", (query) => query.eq("isActive", true))
    .collect();

  if (prompts.length < roundCount) {
    throw new Error("Not enough active image-game prompts are stored yet.");
  }

  const now = Date.now();
  return shuffleArray(
    prompts.sort((left, right) => left.order - right.order),
    `${lobbyId}:${now}:image-game-prompts`,
  )
    .slice(0, roundCount)
    .map((prompt) => prompt._id);
}

