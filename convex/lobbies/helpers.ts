import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireViewer } from "../lib/auth";
import {
  deriveJoinCode,
  normalizeJoinCode,
  PLACEHOLDER_GAMES,
} from "../lib/lobby";

import {
  DEFAULT_VIEWER_LOBBY_LIMIT,
  JOIN_CODE_LENGTH,
  MAX_JOIN_CODE_ATTEMPTS,
  MAX_VIEWER_LOBBY_LIMIT,
  MIN_VIEWER_LOBBY_LIMIT,
} from "./constants";
import type { DbContext, LeaderboardPlayerReference } from "./types";

export async function assignJoinCode(ctx: MutationCtx, lobbyId: Id<"lobbies">) {
  for (let attempt = 0; attempt < MAX_JOIN_CODE_ATTEMPTS; attempt += 1) {
    const joinCode = deriveJoinCode(lobbyId, attempt);
    const existingLobby = await ctx.db
      .query("lobbies")
      .withIndex("joinCode", (query) => query.eq("joinCode", joinCode))
      .unique();

    if (existingLobby === null || existingLobby._id === lobbyId) {
      await ctx.db.patch(lobbyId, { joinCode });
      return joinCode;
    }
  }

  throw new Error("Could not generate a unique join code. Please try again.");
}

export async function getLobbyByJoinCodeOrThrow(
  ctx: DbContext,
  joinCode: string,
) {
  const normalizedJoinCode = normalizeJoinCode(joinCode);
  if (normalizedJoinCode.length !== JOIN_CODE_LENGTH) {
    throw new Error("Join codes must be 6 characters long.");
  }

  const lobby = await ctx.db
    .query("lobbies")
    .withIndex("joinCode", (query) => query.eq("joinCode", normalizedJoinCode))
    .unique();

  if (lobby === null) {
    throw new Error("That join code does not match an active lobby.");
  }

  return lobby;
}

export async function requireLobbyHost(
  ctx: MutationCtx,
  lobbyId: Id<"lobbies">,
) {
  const viewer = await requireViewer(ctx);
  const lobby = await getLobbyOrThrow(ctx, lobbyId);

  if (lobby.hostUserId !== viewer._id) {
    throw new Error("Only the lobby host can do that.");
  }

  return { lobby, viewer };
}

export async function requireLobbyMembershipForViewer(
  ctx: MutationCtx,
  lobbyId: Id<"lobbies">,
) {
  const viewer = await requireViewer(ctx);
  return await requireLobbyMembership(ctx, lobbyId, viewer._id);
}

export async function requireLobbyMembership(
  ctx: DbContext,
  lobbyId: Id<"lobbies">,
  userId: Id<"users">,
) {
  const lobby = await getLobbyOrThrow(ctx, lobbyId);
  const player = await findViewerPlayer(ctx, lobbyId, userId);

  if (player === null || !player.isActive) {
    throw new Error("You must be an active player in this lobby.");
  }

  return { lobby, player };
}

export async function findViewerPlayer(
  ctx: DbContext,
  lobbyId: Id<"lobbies">,
  userId: Id<"users">,
) {
  return await ctx.db
    .query("lobbyPlayers")
    .withIndex("lobbyIdAndUserId", (query) =>
      query.eq("lobbyId", lobbyId).eq("userId", userId),
    )
    .unique();
}

export async function getLobbyOrThrow(ctx: DbContext, lobbyId: Id<"lobbies">) {
  const lobby = await ctx.db.get(lobbyId);
  if (lobby === null) {
    throw new Error("That lobby could not be found.");
  }

  return lobby;
}

export async function buildLobbySnapshot(
  ctx: QueryCtx,
  lobby: Doc<"lobbies">,
  viewerId: Id<"users">,
) {
  const [players, votes, completion, viewerPlayer] = await Promise.all([
    ctx.db
      .query("lobbyPlayers")
      .withIndex("lobbyId", (query) => query.eq("lobbyId", lobby._id))
      .collect(),
    ctx.db
      .query("lobbyGameVotes")
      .withIndex("lobbyId", (query) => query.eq("lobbyId", lobby._id))
      .collect(),
    lobby.state === "Completion"
      ? ctx.db
          .query("lobbyCompletions")
          .withIndex("lobbyId", (query) => query.eq("lobbyId", lobby._id))
          .order("desc")
          .first()
      : Promise.resolve(null),
    findViewerPlayer(ctx, lobby._id, viewerId),
  ]);

  const activePlayers = players
    .filter((player) => player.isActive)
    .sort(sortPlayers);
  const voteSummary = PLACEHOLDER_GAMES.map((game) => ({
    game,
    count: votes.filter((vote) => vote.game === game).length,
  }));

  return {
    lobby: {
      ...lobby,
      activePlayerCount: activePlayers.length,
    },
    players: activePlayers,
    viewer: viewerPlayer
      ? {
          playerId: viewerPlayer._id,
          isHost: viewerPlayer.isHost,
        }
      : null,
    votes,
    voteSummary,
    completion,
  };
}

export async function buildLobbySummary(ctx: QueryCtx, lobby: Doc<"lobbies">) {
  const activePlayers = await ctx.db
    .query("lobbyPlayers")
    .withIndex("lobbyIdAndIsActive", (query) =>
      query.eq("lobbyId", lobby._id).eq("isActive", true),
    )
    .collect();

  return {
    lobbyId: lobby._id,
    joinCode: lobby.joinCode,
    selectedGame: lobby.selectedGame,
    state: lobby.state,
    activePlayerCount: activePlayers.length,
    lastActivityAt: lobby.lastActivityAt,
    currentRound: lobby.currentRound,
  };
}

export async function validateLeaderboardPlayers(
  ctx: MutationCtx,
  lobbyId: Id<"lobbies">,
  leaderboard: Array<LeaderboardPlayerReference>,
) {
  const playerIds = leaderboard.flatMap((entry) =>
    entry.playerId ? [entry.playerId] : [],
  );
  const players = await Promise.all(
    playerIds.map((playerId) => ctx.db.get(playerId)),
  );

  for (const player of players) {
    if (player === null || player.lobbyId !== lobbyId) {
      throw new Error(
        "Leaderboard entries must reference players from the same lobby.",
      );
    }
  }
}

export function clampLimit(limit?: number) {
  if (limit === undefined || Number.isNaN(limit)) {
    return DEFAULT_VIEWER_LOBBY_LIMIT;
  }

  return Math.max(
    MIN_VIEWER_LOBBY_LIMIT,
    Math.min(MAX_VIEWER_LOBBY_LIMIT, Math.floor(limit)),
  );
}

export function sortLobbiesByActivity(
  left: Doc<"lobbies">,
  right: Doc<"lobbies">,
) {
  return right.lastActivityAt - left.lastActivityAt;
}

export function sortPlayers(
  left: Doc<"lobbyPlayers">,
  right: Doc<"lobbyPlayers">,
) {
  if (left.isHost !== right.isHost) {
    return left.isHost ? -1 : 1;
  }

  return left.joinedAt - right.joinedAt;
}
