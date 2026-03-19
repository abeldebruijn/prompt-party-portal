import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireViewer } from "../lib/auth";
import {
  DEFAULT_FEED_IT_FORWARD_ROUND_DURATION_SECONDS,
  DEFAULT_FEED_IT_FORWARD_SETUP_PROMPTS,
  FEED_IT_FORWARD_GAME_NAME,
  MAX_FEED_IT_FORWARD_ROUND_DURATION_SECONDS,
  MAX_FEED_IT_FORWARD_SETUP_PROMPTS,
  MIN_FEED_IT_FORWARD_ROUND_DURATION_SECONDS,
  sanitizeFeedItForwardPrompt,
} from "../lib/lobby";
import {
  findViewerPlayer,
  getLobbyOrThrow,
  sortPlayers,
} from "../lobbies/helpers";

type DbContext = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;

export function clampSetupPromptCount(value?: number) {
  if (!Number.isInteger(value) || value === undefined || Number.isNaN(value)) {
    return DEFAULT_FEED_IT_FORWARD_SETUP_PROMPTS;
  }

  return Math.max(1, Math.min(MAX_FEED_IT_FORWARD_SETUP_PROMPTS, value));
}

export function clampRoundDurationSeconds(value?: number) {
  if (!Number.isInteger(value) || value === undefined || Number.isNaN(value)) {
    return DEFAULT_FEED_IT_FORWARD_ROUND_DURATION_SECONDS;
  }

  return Math.max(
    MIN_FEED_IT_FORWARD_ROUND_DURATION_SECONDS,
    Math.min(MAX_FEED_IT_FORWARD_ROUND_DURATION_SECONDS, value),
  );
}

export function deriveTotalRoundCount(
  playerCount: number,
  setupPromptCount: number,
) {
  return Math.max(playerCount - 1, 0) * setupPromptCount;
}

export async function requireFeedItForwardHost(
  ctx: MutationCtx,
  lobbyId: Id<"lobbies">,
) {
  const viewer = await requireViewer(ctx);
  const lobby = await getLobbyOrThrow(ctx, lobbyId);

  if (lobby.hostUserId !== viewer._id) {
    throw new Error("Only the lobby host can do that.");
  }

  if (lobby.selectedGame !== FEED_IT_FORWARD_GAME_NAME) {
    throw new Error("This lobby is not using Feed It Forward.");
  }

  return { lobby, viewer };
}

export async function requireFeedItForwardMembership(
  ctx: DbContext,
  lobbyId: Id<"lobbies">,
) {
  const viewer = await requireViewer(ctx as QueryCtx);
  const lobby = await getLobbyOrThrow(ctx, lobbyId);
  const player = await findViewerPlayer(ctx, lobbyId, viewer._id);

  if (player === null || !player.isActive) {
    throw new Error("You must be an active player in this lobby.");
  }

  if (lobby.selectedGame !== FEED_IT_FORWARD_GAME_NAME) {
    throw new Error("This lobby is not using Feed It Forward.");
  }

  return { lobby, player, viewer };
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
  const players = await ctx.db
    .query("lobbyPlayers")
    .withIndex("lobbyIdAndIsActive", (query) =>
      query.eq("lobbyId", lobbyId).eq("isActive", true),
    )
    .collect();

  return players.sort(sortPlayers);
}

export async function getActiveSession(ctx: DbContext, lobbyId: Id<"lobbies">) {
  const sessions = await ctx.db
    .query("feedItForwardSessions")
    .withIndex("lobbyId", (query) => query.eq("lobbyId", lobbyId))
    .order("desc")
    .collect();

  return (
    sessions.find((session) => session.status !== "Completed") ??
    sessions[0] ??
    null
  );
}

export async function getCurrentRound(
  ctx: DbContext,
  sessionId: Id<"feedItForwardSessions">,
  roundNumber: number,
) {
  if (roundNumber < 1) {
    return null;
  }

  return await ctx.db
    .query("feedItForwardRounds")
    .withIndex("sessionIdAndRoundNumber", (query) =>
      query.eq("sessionId", sessionId).eq("roundNumber", roundNumber),
    )
    .unique();
}

export async function getChain(
  ctx: DbContext,
  sessionId: Id<"feedItForwardSessions">,
  ownerPlayerId: Id<"lobbyPlayers">,
  slotIndex: number,
) {
  return await ctx.db
    .query("feedItForwardChains")
    .withIndex("sessionIdAndOwnerPlayerIdAndSlotIndex", (query) =>
      query
        .eq("sessionId", sessionId)
        .eq("ownerPlayerId", ownerPlayerId)
        .eq("slotIndex", slotIndex),
    )
    .unique();
}

export async function listRoundSubmissions(
  ctx: DbContext,
  roundId: Id<"feedItForwardRounds">,
) {
  return await ctx.db
    .query("feedItForwardSubmissions")
    .withIndex("roundId", (query) => query.eq("roundId", roundId))
    .collect();
}

export async function listSessionChains(
  ctx: DbContext,
  sessionId: Id<"feedItForwardSessions">,
) {
  return await ctx.db
    .query("feedItForwardChains")
    .withIndex("sessionId", (query) => query.eq("sessionId", sessionId))
    .collect();
}

export async function listSetupSlots(ctx: DbContext, lobbyId: Id<"lobbies">) {
  return await ctx.db
    .query("feedItForwardSetupSlots")
    .withIndex("lobbyId", (query) => query.eq("lobbyId", lobbyId))
    .collect();
}

export function sanitizePromptInput(prompt: string) {
  const sanitized = sanitizeFeedItForwardPrompt(prompt);

  if (sanitized.length < 1) {
    throw new Error("Prompts need at least one visible character.");
  }

  return sanitized;
}

export function deriveSetupSourceKey(
  playerId: Id<"lobbyPlayers">,
  slotIndex: number,
) {
  return `setup:${playerId}:${slotIndex}`;
}

export function deriveSubmissionSourceKey(
  roundId: Id<"feedItForwardRounds">,
  playerId: Id<"lobbyPlayers">,
) {
  return `submission:${roundId}:${playerId}`;
}

export function deriveRoundAssignment(
  playerOrderIds: Id<"lobbyPlayers">[],
  roundNumber: number,
  viewerPlayerId: Id<"lobbyPlayers">,
) {
  const playerIndex = playerOrderIds.indexOf(viewerPlayerId);

  if (playerIndex === -1) {
    return null;
  }

  const playerCount = playerOrderIds.length;
  const roundsPerSlot = Math.max(playerCount - 1, 0);

  if (roundsPerSlot === 0) {
    return null;
  }

  const zeroBasedRound = roundNumber - 1;
  const slotIndex = Math.floor(zeroBasedRound / roundsPerSlot);
  const hopNumber = (zeroBasedRound % roundsPerSlot) + 1;
  const ownerIndex = (playerIndex + hopNumber) % playerCount;
  const ownerPlayerId = playerOrderIds[ownerIndex];

  return {
    slotIndex,
    hopNumber,
    ownerPlayerId,
  };
}

export function mapVectorScore(score: number) {
  return Math.round(((score + 1) / 2) * 5);
}

export async function computeLeaderboard(
  ctx: DbContext,
  sessionId: Id<"feedItForwardSessions">,
  playerOrderIds: Id<"lobbyPlayers">[],
) {
  const submissions = await ctx.db
    .query("feedItForwardSubmissions")
    .withIndex("sessionId", (query) => query.eq("sessionId", sessionId))
    .collect();
  const players = await Promise.all(
    playerOrderIds.map((playerId) => ctx.db.get(playerId)),
  );
  const scoreMap = new Map<string, number>();
  const nameMap = new Map<string, string>();

  for (const player of players) {
    if (player !== null) {
      scoreMap.set(player._id, 0);
      nameMap.set(player._id, player.displayName);
    }
  }

  for (const submission of submissions) {
    scoreMap.set(
      submission.authorPlayerId,
      (scoreMap.get(submission.authorPlayerId) ?? 0) +
        (submission.totalScore ?? 0),
    );
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

export async function listLatestRoundPokes(
  ctx: DbContext,
  lobbyId: Id<"lobbies">,
  lobbyRoundNumber: number,
  playerDisplayNames: Map<Id<"lobbyPlayers">, string>,
) {
  const pokes = await ctx.db
    .query("playerPokes")
    .withIndex("lobbyIdAndLobbyRoundNumber", (query) =>
      query.eq("lobbyId", lobbyId).eq("lobbyRoundNumber", lobbyRoundNumber),
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

export async function listChainSteps(
  ctx: DbContext,
  sessionId: Id<"feedItForwardSessions">,
  ownerPlayerId: Id<"lobbyPlayers">,
  slotIndex: number,
) {
  const steps = await ctx.db
    .query("feedItForwardChainSteps")
    .withIndex("sessionIdAndOwnerPlayerIdAndSlotIndex", (query) =>
      query
        .eq("sessionId", sessionId)
        .eq("ownerPlayerId", ownerPlayerId)
        .eq("slotIndex", slotIndex),
    )
    .collect();

  return steps.sort((left, right) => left.stepNumber - right.stepNumber);
}

export function deriveSessionSummary(totalRounds: number) {
  return `Feed It Forward wrapped after ${totalRounds} rounds of image-passing nonsense.`;
}

export async function getSetupSlot(
  ctx: DbContext,
  lobbyId: Id<"lobbies">,
  playerId: Id<"lobbyPlayers">,
  slotIndex: number,
) {
  return await ctx.db
    .query("feedItForwardSetupSlots")
    .withIndex("lobbyIdAndPlayerIdAndSlotIndex", (query) =>
      query
        .eq("lobbyId", lobbyId)
        .eq("playerId", playerId)
        .eq("slotIndex", slotIndex),
    )
    .unique();
}

export async function ensureSetupSlot(
  ctx: MutationCtx,
  lobbyId: Id<"lobbies">,
  playerId: Id<"lobbyPlayers">,
  slotIndex: number,
  isAutoFilled: boolean,
) {
  const existing = await getSetupSlot(ctx, lobbyId, playerId, slotIndex);

  if (existing !== null) {
    return existing;
  }

  const now = Date.now();
  const slotId = await ctx.db.insert("feedItForwardSetupSlots", {
    lobbyId,
    playerId,
    slotIndex,
    sourceKey: deriveSetupSourceKey(playerId, slotIndex),
    status: "Empty",
    isAutoFilled,
    updatedAt: now,
  });
  const slot = await ctx.db.get(slotId);

  if (slot === null) {
    throw new Error("The setup slot could not be created.");
  }

  return slot;
}
