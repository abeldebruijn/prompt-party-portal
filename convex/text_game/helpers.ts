import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireViewer } from "../lib/auth";
import {
  DEFAULT_TEXT_GAME_ROUND_COUNT,
  MAX_TEXT_GAME_ROUND_COUNT,
  sanitizeTextGameAnswer,
  TEXT_GAME_NAME,
} from "../lib/lobby";
import {
  findViewerPlayer,
  getLobbyOrThrow,
  sortPlayers,
} from "../lobbies/helpers";
import { PRESENT_DURATION_MS } from "./constants";

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

export function validateStarCount(stars: number) {
  return Number.isInteger(stars) && stars >= 0 && stars <= 5;
}

export function createShuffleSeed(seed: string) {
  let hash = 2166136261;

  for (const character of seed) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function shuffleArray<T>(items: T[], seedSource: string) {
  const shuffled = [...items];
  let seed = createShuffleSeed(seedSource);

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    seed = Math.imul(seed ^ index, 16777619) >>> 0;
    const swapIndex = seed % (index + 1);
    const current = shuffled[index];
    shuffled[index] = shuffled[swapIndex];
    shuffled[swapIndex] = current;
  }

  return shuffled;
}

export function renderPrompt(template: string, person: string) {
  return template.replaceAll("{person}", person);
}

export async function requireTextGameHost(
  ctx: MutationCtx,
  lobbyId: Id<"lobbies">,
) {
  const viewer = await requireViewer(ctx);
  const lobby = await getLobbyOrThrow(ctx, lobbyId);

  if (lobby.hostUserId !== viewer._id) {
    throw new Error("Only the lobby host can do that.");
  }

  if (lobby.selectedGame !== TEXT_GAME_NAME) {
    throw new Error("This lobby is not using the text game.");
  }

  return { lobby, viewer };
}

export async function requireTextGameMembership(
  ctx: QueryCtx | MutationCtx,
  lobbyId: Id<"lobbies">,
) {
  const viewer = await requireViewer(ctx);
  const lobby = await getLobbyOrThrow(ctx, lobbyId);

  if (lobby.selectedGame !== TEXT_GAME_NAME) {
    throw new Error("This lobby is not using the text game.");
  }

  const player = await findViewerPlayer(ctx, lobbyId, viewer._id);

  if (player === null || !player.isActive) {
    throw new Error("You must be an active player in this lobby.");
  }

  return { lobby, viewer, player };
}

export async function getActiveSession(ctx: DbContext, lobbyId: Id<"lobbies">) {
  const sessions = await ctx.db
    .query("textGameSessions")
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
  sessionId: Id<"textGameSessions">,
  roundNumber: number,
) {
  return await ctx.db
    .query("textGameRounds")
    .withIndex("sessionIdAndRoundNumber", (query) =>
      query.eq("sessionId", sessionId).eq("roundNumber", roundNumber),
    )
    .unique();
}

export async function listRoundSubmissions(
  ctx: DbContext,
  roundId: Id<"textGameRounds">,
) {
  return await ctx.db
    .query("textGameSubmissions")
    .withIndex("roundId", (query) => query.eq("roundId", roundId))
    .collect();
}

export async function listLatestRoundPokes(
  ctx: DbContext,
  lobbyId: Id<"lobbies">,
  roundId: Id<"textGameRounds">,
  playerDisplayNames: Map<Id<"lobbyPlayers">, string>,
) {
  const pokes = await ctx.db
    .query("playerPokes")
    .withIndex("lobbyIdAndTextRoundId", (query) =>
      query.eq("lobbyId", lobbyId).eq("textRoundId", roundId),
    )
    .collect();
  const latestPokeByTargetId = new Map<
    Id<"lobbyPlayers">,
    {
      createdAt: number;
      pokedByDisplayName: string;
      pokedByPlayerId: Id<"lobbyPlayers">;
    }
  >();

  for (const poke of pokes) {
    const existing = latestPokeByTargetId.get(poke.targetPlayerId);

    if (existing && existing.createdAt >= poke.createdAt) {
      continue;
    }

    latestPokeByTargetId.set(poke.targetPlayerId, {
      createdAt: poke.createdAt,
      pokedByDisplayName:
        playerDisplayNames.get(poke.pokedByPlayerId) ?? "Another player",
      pokedByPlayerId: poke.pokedByPlayerId,
    });
  }

  return latestPokeByTargetId;
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

export async function createRound(
  ctx: MutationCtx,
  session: Doc<"textGameSessions">,
  lobbyId: Id<"lobbies">,
  roundNumber: number,
  now: number,
) {
  const eligiblePlayers = await listActiveHumanPlayers(ctx, lobbyId);

  if (eligiblePlayers.length < 2) {
    throw new Error(
      "At least two active human players are required for the text game.",
    );
  }

  const promptId = session.promptIds[roundNumber - 1];

  if (!promptId) {
    throw new Error("The requested text-game prompt could not be found.");
  }

  const prompt = await ctx.db.get(promptId);

  if (prompt === null || !prompt.isActive) {
    throw new Error("The requested text-game prompt could not be found.");
  }

  const targetPlayer =
    eligiblePlayers[(roundNumber - 1) % eligiblePlayers.length];

  const roundId = await ctx.db.insert("textGameRounds", {
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
  sessionId: Id<"textGameSessions">,
) {
  const rounds = await ctx.db
    .query("textGameRounds")
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
  round: Doc<"textGameRounds">,
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
    answer: winner.answer,
    totalScore: winner.totalScore ?? 0,
    correctnessStars: winner.correctnessStars ?? 0,
    creativityStars: winner.creativityStars ?? 0,
    authorDisplayName: authors[index]?.displayName ?? "Unknown player",
  }));
}

export function sanitizeAnswerInput(answer: string) {
  const sanitized = sanitizeTextGameAnswer(answer);

  if (sanitized.length < 1) {
    throw new Error("Submissions need at least one visible character.");
  }

  return sanitized;
}

export async function moveRoundToPresent(
  ctx: MutationCtx,
  round: Doc<"textGameRounds">,
  now: number,
) {
  await ctx.db.patch(round._id, {
    stage: "Present",
    stageStartedAt: now,
    presentEndsAt: now + PRESENT_DURATION_MS,
  });
}
