import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
  ensureViewerUsername,
  requireViewer,
  userHasAuthProvider,
} from "./lib/auth";
import {
  aiPersonalityTypeValidator,
  deriveJoinCode,
  generateFunnyUsername,
  lobbyGameValidator,
  normalizeJoinCode,
  PLACEHOLDER_GAMES,
  sanitizeSummary,
  sanitizeUsername,
} from "./lib/lobby";

const leaderboardEntryValidator = v.object({
  playerId: v.optional(v.id("lobbyPlayers")),
  displayName: v.string(),
  rank: v.number(),
  score: v.number(),
  note: v.optional(v.string()),
});

type DbContext = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;

export const listAvailableGames = query({
  args: {},
  handler: async () => PLACEHOLDER_GAMES,
});

export const getLobbyByCode = query({
  args: {
    joinCode: v.string(),
  },
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const lobby = await getLobbyByJoinCodeOrThrow(ctx, args.joinCode);
    const activePlayers = await ctx.db
      .query("lobbyPlayers")
      .withIndex("lobbyIdAndIsActive", (query) =>
        query.eq("lobbyId", lobby._id).eq("isActive", true),
      )
      .collect();
    const viewerPlayer = await findViewerPlayer(ctx, lobby._id, viewer._id);

    return {
      lobbyId: lobby._id,
      joinCode: lobby.joinCode,
      selectedGame: lobby.selectedGame,
      state: lobby.state,
      activePlayerCount: activePlayers.length,
      isViewerJoined: viewerPlayer?.isActive ?? false,
      isViewerHost: lobby.hostUserId === viewer._id,
    };
  },
});

export const getLobby = query({
  args: {
    lobbyId: v.id("lobbies"),
  },
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const membership = await requireLobbyMembership(
      ctx,
      args.lobbyId,
      viewer._id,
    );
    return await buildLobbySnapshot(ctx, membership.lobby, viewer._id);
  },
});

export const listViewerLobbies = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const limit = clampLimit(args.limit);

    const createdLobbies = await ctx.db
      .query("lobbies")
      .withIndex("hostUserId", (query) => query.eq("hostUserId", viewer._id))
      .order("desc")
      .take(limit);

    const memberships = await ctx.db
      .query("lobbyPlayers")
      .withIndex("userId", (query) => query.eq("userId", viewer._id))
      .collect();

    const playedLobbyIds = [
      ...new Set(memberships.map((membership) => membership.lobbyId)),
    ];
    const playedLobbies = await Promise.all(
      playedLobbyIds.map((lobbyId) => ctx.db.get(lobbyId)),
    );

    const created = await Promise.all(
      createdLobbies.map((lobby) => buildLobbySummary(ctx, lobby)),
    );

    const played = (
      await Promise.all(
        playedLobbies
          .filter((lobby): lobby is Doc<"lobbies"> => lobby !== null)
          .filter((lobby) => lobby.hostUserId !== viewer._id)
          .sort(sortLobbiesByActivity)
          .slice(0, limit)
          .map((lobby) => buildLobbySummary(ctx, lobby)),
      )
    ).filter(Boolean);

    return { created, played };
  },
});

export const createLobby = mutation({
  args: {
    selectedGame: v.optional(lobbyGameValidator),
  },
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const canCreateLobby =
      !viewer.isAnonymous &&
      (await userHasAuthProvider(ctx, viewer._id, "password"));

    if (!canCreateLobby) {
      throw new Error("Only email/password accounts can create lobbies.");
    }

    const viewerWithUsername = await ensureViewerUsername(ctx, viewer);
    const now = Date.now();
    const lobbyId = await ctx.db.insert("lobbies", {
      joinCode: "PENDING",
      hostUserId: viewer._id,
      selectedGame: args.selectedGame ?? PLACEHOLDER_GAMES[0],
      state: "Creation",
      currentRound: 0,
      lastActivityAt: now,
    });
    const joinCode = await assignJoinCode(ctx, lobbyId);
    const playerId = await ctx.db.insert("lobbyPlayers", {
      lobbyId,
      userId: viewer._id,
      kind: "human",
      displayName: viewerWithUsername.name ?? generateFunnyUsername(viewer._id),
      isHost: true,
      isActive: true,
      joinedAt: now,
      joinedDuringState: "Creation",
    });

    return {
      lobbyId,
      playerId,
      joinCode,
      selectedGame: args.selectedGame ?? PLACEHOLDER_GAMES[0],
      state: "Creation" as const,
    };
  },
});

export const joinLobbyByCode = mutation({
  args: {
    joinCode: v.string(),
  },
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const viewerWithUsername = await ensureViewerUsername(ctx, viewer);
    const lobby = await getLobbyByJoinCodeOrThrow(ctx, args.joinCode);

    if (lobby.state === "Completion") {
      throw new Error(
        "This lobby has already wrapped up. Ask the host to reset it first.",
      );
    }

    const existingPlayer = await findViewerPlayer(ctx, lobby._id, viewer._id);
    if (existingPlayer?.isActive) {
      return {
        lobbyId: lobby._id,
        playerId: existingPlayer._id,
        joinCode: lobby.joinCode,
        alreadyJoined: true,
        state: lobby.state,
      };
    }

    if (existingPlayer && !existingPlayer.isActive) {
      throw new Error("You were previously removed from this lobby.");
    }

    const now = Date.now();
    const playerId = await ctx.db.insert("lobbyPlayers", {
      lobbyId: lobby._id,
      userId: viewer._id,
      kind: "human",
      displayName: viewerWithUsername.name ?? generateFunnyUsername(viewer._id),
      isHost: false,
      isActive: true,
      joinedAt: now,
      joinedDuringState: lobby.state,
    });

    await ctx.db.patch(lobby._id, { lastActivityAt: now });

    return {
      lobbyId: lobby._id,
      playerId,
      joinCode: lobby.joinCode,
      alreadyJoined: false,
      state: lobby.state,
    };
  },
});

export const selectGame = mutation({
  args: {
    lobbyId: v.id("lobbies"),
    game: lobbyGameValidator,
  },
  handler: async (ctx, args) => {
    const { lobby } = await requireLobbyHost(ctx, args.lobbyId);

    if (lobby.state !== "Creation") {
      throw new Error(
        "The host can only choose a game while the lobby is being set up.",
      );
    }

    await ctx.db.patch(lobby._id, {
      selectedGame: args.game,
      lastActivityAt: Date.now(),
    });

    return {
      lobbyId: lobby._id,
      selectedGame: args.game,
    };
  },
});

export const voteForGame = mutation({
  args: {
    lobbyId: v.id("lobbies"),
    game: lobbyGameValidator,
  },
  handler: async (ctx, args) => {
    const membership = await requireLobbyMembershipForViewer(ctx, args.lobbyId);

    if (membership.lobby.state !== "Creation") {
      throw new Error("Game votes are only advisory during lobby setup.");
    }

    if (membership.player.isHost) {
      throw new Error(
        "Hosts choose the active game directly instead of voting.",
      );
    }

    const existingVote = await ctx.db
      .query("lobbyGameVotes")
      .withIndex("lobbyIdAndPlayerId", (query) =>
        query.eq("lobbyId", args.lobbyId).eq("playerId", membership.player._id),
      )
      .unique();
    const now = Date.now();

    if (existingVote) {
      await ctx.db.patch(existingVote._id, { game: args.game, updatedAt: now });
      return { voteId: existingVote._id, game: args.game };
    }

    const voteId = await ctx.db.insert("lobbyGameVotes", {
      lobbyId: args.lobbyId,
      playerId: membership.player._id,
      game: args.game,
      updatedAt: now,
    });

    return { voteId, game: args.game };
  },
});

export const addAiPlayer = mutation({
  args: {
    lobbyId: v.id("lobbies"),
    displayName: v.optional(v.string()),
    personalityType: aiPersonalityTypeValidator,
    customPrompt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { lobby } = await requireLobbyHost(ctx, args.lobbyId);

    if (lobby.state !== "Creation") {
      throw new Error(
        "AI players can only be added before the session starts.",
      );
    }

    const activePlayers = await ctx.db
      .query("lobbyPlayers")
      .withIndex("lobbyIdAndIsActive", (query) =>
        query.eq("lobbyId", lobby._id).eq("isActive", true),
      )
      .collect();
    const proposedName = args.displayName
      ? sanitizeUsername(args.displayName)
      : generateFunnyUsername(
          `${lobby._id}:${args.personalityType}:${activePlayers.length}`,
        );

    if (proposedName.length < 2) {
      throw new Error(
        "AI players need a visible name with at least 2 characters.",
      );
    }

    const now = Date.now();
    const playerId = await ctx.db.insert("lobbyPlayers", {
      lobbyId: lobby._id,
      kind: "ai",
      displayName: proposedName,
      isHost: false,
      isActive: true,
      joinedAt: now,
      joinedDuringState: lobby.state,
      aiPersonalityType: args.personalityType,
      aiCustomPrompt:
        args.personalityType === "custom" && args.customPrompt
          ? sanitizeSummary(args.customPrompt)
          : undefined,
    });

    await ctx.db.patch(lobby._id, { lastActivityAt: now });

    return {
      lobbyId: lobby._id,
      playerId,
      displayName: proposedName,
      personalityType: args.personalityType,
    };
  },
});

export const kickPlayer = mutation({
  args: {
    lobbyId: v.id("lobbies"),
    playerId: v.id("lobbyPlayers"),
  },
  handler: async (ctx, args) => {
    const { lobby, viewer } = await requireLobbyHost(ctx, args.lobbyId);
    const player = await ctx.db.get(args.playerId);

    if (player === null || player.lobbyId !== args.lobbyId) {
      throw new Error("That player is not part of this lobby.");
    }

    if (player.isHost) {
      throw new Error("Hosts cannot remove themselves from their own lobby.");
    }

    if (!player.isActive) {
      throw new Error("That player has already been removed.");
    }

    const vote = await ctx.db
      .query("lobbyGameVotes")
      .withIndex("lobbyIdAndPlayerId", (query) =>
        query.eq("lobbyId", args.lobbyId).eq("playerId", player._id),
      )
      .unique();
    const now = Date.now();

    await ctx.db.patch(player._id, {
      isActive: false,
      kickedAt: now,
      kickedByUserId: viewer._id,
    });

    if (vote) {
      await ctx.db.delete(vote._id);
    }

    await ctx.db.patch(lobby._id, { lastActivityAt: now });

    return {
      lobbyId: lobby._id,
      removedPlayerId: player._id,
    };
  },
});

export const startRound = mutation({
  args: {
    lobbyId: v.id("lobbies"),
  },
  handler: async (ctx, args) => {
    const { lobby } = await requireLobbyHost(ctx, args.lobbyId);

    if (lobby.state !== "Creation") {
      throw new Error("Only lobbies in setup mode can start a round.");
    }

    const activePlayers = await ctx.db
      .query("lobbyPlayers")
      .withIndex("lobbyIdAndIsActive", (query) =>
        query.eq("lobbyId", lobby._id).eq("isActive", true),
      )
      .collect();

    if (activePlayers.length < 2) {
      throw new Error(
        "At least two active players are required to start a round.",
      );
    }

    const now = Date.now();
    const nextRound = lobby.currentRound + 1;

    await ctx.db.patch(lobby._id, {
      state: "Playing",
      currentRound: nextRound,
      startedAt: lobby.startedAt ?? now,
      lastActivityAt: now,
    });

    return {
      lobbyId: lobby._id,
      state: "Playing" as const,
      currentRound: nextRound,
    };
  },
});

export const completeLobby = mutation({
  args: {
    lobbyId: v.id("lobbies"),
    leaderboard: v.array(leaderboardEntryValidator),
    summary: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { lobby, viewer } = await requireLobbyHost(ctx, args.lobbyId);

    if (lobby.state !== "Playing") {
      throw new Error("Only an active lobby can move to completion.");
    }

    if (args.leaderboard.length === 0) {
      throw new Error(
        "Completion results need at least one leaderboard entry.",
      );
    }

    await validateLeaderboardPlayers(ctx, args.lobbyId, args.leaderboard);

    const now = Date.now();
    const completionId = await ctx.db.insert("lobbyCompletions", {
      lobbyId: lobby._id,
      completedByUserId: viewer._id,
      selectedGame: lobby.selectedGame,
      completedAt: now,
      summary: args.summary ? sanitizeSummary(args.summary) : undefined,
      leaderboard: args.leaderboard.map((entry) => ({
        playerId: entry.playerId,
        displayName: sanitizeUsername(entry.displayName),
        rank: entry.rank,
        score: entry.score,
        note: entry.note ? sanitizeSummary(entry.note) : undefined,
      })),
    });

    await ctx.db.patch(lobby._id, {
      state: "Completion",
      completedAt: now,
      lastActivityAt: now,
    });

    return {
      lobbyId: lobby._id,
      completionId,
      state: "Completion" as const,
    };
  },
});

export const resetLobby = mutation({
  args: {
    lobbyId: v.id("lobbies"),
  },
  handler: async (ctx, args) => {
    const { lobby } = await requireLobbyHost(ctx, args.lobbyId);

    if (lobby.state !== "Completion") {
      throw new Error("Only a completed lobby can be reset.");
    }

    const votes = await ctx.db
      .query("lobbyGameVotes")
      .withIndex("lobbyId", (query) => query.eq("lobbyId", lobby._id))
      .collect();

    await Promise.all(votes.map((vote) => ctx.db.delete(vote._id)));

    await ctx.db.patch(lobby._id, {
      state: "Creation",
      currentRound: 0,
      startedAt: undefined,
      completedAt: undefined,
      lastActivityAt: Date.now(),
    });

    return {
      lobbyId: lobby._id,
      state: "Creation" as const,
    };
  },
});

async function assignJoinCode(ctx: MutationCtx, lobbyId: Id<"lobbies">) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
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

async function getLobbyByJoinCodeOrThrow(ctx: DbContext, joinCode: string) {
  const normalizedJoinCode = normalizeJoinCode(joinCode);
  if (normalizedJoinCode.length !== 6) {
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

async function requireLobbyHost(ctx: MutationCtx, lobbyId: Id<"lobbies">) {
  const viewer = await requireViewer(ctx);
  const lobby = await getLobbyOrThrow(ctx, lobbyId);

  if (lobby.hostUserId !== viewer._id) {
    throw new Error("Only the lobby host can do that.");
  }

  return { lobby, viewer };
}

async function requireLobbyMembershipForViewer(
  ctx: MutationCtx,
  lobbyId: Id<"lobbies">,
) {
  const viewer = await requireViewer(ctx);
  return await requireLobbyMembership(ctx, lobbyId, viewer._id);
}

async function requireLobbyMembership(
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

async function findViewerPlayer(
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

async function getLobbyOrThrow(ctx: DbContext, lobbyId: Id<"lobbies">) {
  const lobby = await ctx.db.get(lobbyId);
  if (lobby === null) {
    throw new Error("That lobby could not be found.");
  }

  return lobby;
}

async function buildLobbySnapshot(
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

async function buildLobbySummary(ctx: QueryCtx, lobby: Doc<"lobbies">) {
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

async function validateLeaderboardPlayers(
  ctx: MutationCtx,
  lobbyId: Id<"lobbies">,
  leaderboard: Array<{ playerId?: Id<"lobbyPlayers"> }>,
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

function clampLimit(limit?: number) {
  if (limit === undefined || Number.isNaN(limit)) {
    return 5;
  }

  return Math.max(1, Math.min(20, Math.floor(limit)));
}

function sortLobbiesByActivity(left: Doc<"lobbies">, right: Doc<"lobbies">) {
  return right.lastActivityAt - left.lastActivityAt;
}

function sortPlayers(left: Doc<"lobbyPlayers">, right: Doc<"lobbyPlayers">) {
  if (left.isHost !== right.isHost) {
    return left.isHost ? -1 : 1;
  }

  return left.joinedAt - right.joinedAt;
}
