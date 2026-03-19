import { v } from "convex/values";

import { mutation } from "../_generated/server";
import {
  ensureViewerUsername,
  requireViewer,
  userHasAuthProvider,
} from "../lib/auth";
import {
  aiPersonalityTypeValidator,
  DEFAULT_LOBBY_GAME,
  DEFAULT_TEXT_GAME_ROUND_COUNT,
  DEPRECATED_IMAGE_GENERATION_GAME_NAME,
  generateFunnyUsername,
  lobbyGameValidator,
  sanitizeSummary,
  sanitizeUsername,
} from "../lib/lobby";

import {
  assignJoinCode,
  findViewerPlayer,
  getLobbyByJoinCodeOrThrow,
  requireLobbyHost,
  requireLobbyMembershipForViewer,
  validateLeaderboardPlayers,
} from "./helpers";
import { leaderboardEntryValidator } from "./types";

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
      selectedGame: args.selectedGame ?? DEFAULT_LOBBY_GAME,
      state: "Creation",
      textGameRoundCount: DEFAULT_TEXT_GAME_ROUND_COUNT,
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
      selectedGame: args.selectedGame ?? DEFAULT_LOBBY_GAME,
      state: "Creation" as const,
    };
  },
});

export const remapDeprecatedGameMode = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const [lobbies, votes, completions] = await Promise.all([
      ctx.db.query("lobbies").collect(),
      ctx.db.query("lobbyGameVotes").collect(),
      ctx.db.query("lobbyCompletions").collect(),
    ]);

    const staleLobbies = lobbies.filter(
      (lobby) =>
        (lobby.selectedGame as string) ===
        DEPRECATED_IMAGE_GENERATION_GAME_NAME,
    );
    const staleVotes = votes.filter(
      (vote) => (vote.game as string) === DEPRECATED_IMAGE_GENERATION_GAME_NAME,
    );
    const staleCompletions = completions.filter(
      (completion) =>
        (completion.selectedGame as string) ===
        DEPRECATED_IMAGE_GENERATION_GAME_NAME,
    );

    await Promise.all([
      ...staleLobbies.map((lobby) =>
        ctx.db.patch(lobby._id, {
          selectedGame: DEFAULT_LOBBY_GAME,
          lastActivityAt: now,
        }),
      ),
      ...staleVotes.map((vote) =>
        ctx.db.patch(vote._id, {
          game: DEFAULT_LOBBY_GAME,
          updatedAt: now,
        }),
      ),
      ...staleCompletions.map((completion) =>
        ctx.db.patch(completion._id, {
          selectedGame: DEFAULT_LOBBY_GAME,
        }),
      ),
    ]);

    return {
      remappedLobbies: staleLobbies.length,
      remappedVotes: staleVotes.length,
      remappedCompletions: staleCompletions.length,
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

export const pokePlayer = mutation({
  args: {
    lobbyId: v.id("lobbies"),
    playerId: v.id("lobbyPlayers"),
  },
  handler: async (ctx, args) => {
    const membership = await requireLobbyMembershipForViewer(ctx, args.lobbyId);

    if (membership.lobby.state !== "Playing") {
      throw new Error(
        "Players can only be poked while a round is in progress.",
      );
    }

    if (membership.lobby.selectedGame === "Pick text that suits a situation") {
      throw new Error("Text-game pokes should use the text-game play screen.");
    }

    if (membership.player._id === args.playerId) {
      throw new Error("You cannot poke yourself.");
    }

    const targetPlayer = await ctx.db.get(args.playerId);

    if (
      targetPlayer === null ||
      targetPlayer.lobbyId !== args.lobbyId ||
      !targetPlayer.isActive
    ) {
      throw new Error("That player is not currently pending in this round.");
    }

    if (targetPlayer.kind !== "human") {
      throw new Error("Only pending human players can be poked.");
    }

    const now = Date.now();
    const pokeId = await ctx.db.insert("playerPokes", {
      lobbyId: args.lobbyId,
      targetPlayerId: targetPlayer._id,
      pokedByPlayerId: membership.player._id,
      lobbyRoundNumber: membership.lobby.currentRound,
      createdAt: now,
    });

    await ctx.db.patch(membership.lobby._id, { lastActivityAt: now });

    return {
      lobbyId: args.lobbyId,
      pokeId,
      playerId: targetPlayer._id,
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
    const sessions = await ctx.db
      .query("textGameSessions")
      .withIndex("lobbyId", (query) => query.eq("lobbyId", lobby._id))
      .collect();
    const rounds = await ctx.db
      .query("textGameRounds")
      .withIndex("lobbyId", (query) => query.eq("lobbyId", lobby._id))
      .collect();
    const submissions = (
      await Promise.all(
        rounds.map((round) =>
          ctx.db
            .query("textGameSubmissions")
            .withIndex("roundId", (query) => query.eq("roundId", round._id))
            .collect(),
        ),
      )
    ).flat();

    const imageSessions = await ctx.db
      .query("imageGameSessions")
      .withIndex("lobbyId", (query) => query.eq("lobbyId", lobby._id))
      .collect();
    const imageRounds = await ctx.db
      .query("imageGameRounds")
      .withIndex("lobbyId", (query) => query.eq("lobbyId", lobby._id))
      .collect();
    const imageSubmissions = (
      await Promise.all(
        imageRounds.map((round) =>
          ctx.db
            .query("imageGameSubmissions")
            .withIndex("roundId", (query) => query.eq("roundId", round._id))
            .collect(),
        ),
      )
    ).flat();

    await Promise.all(votes.map((vote) => ctx.db.delete(vote._id)));
    const pokes = await ctx.db
      .query("playerPokes")
      .withIndex("lobbyId", (query) => query.eq("lobbyId", lobby._id))
      .collect();

    await Promise.all(pokes.map((poke) => ctx.db.delete(poke._id)));
    await Promise.all(
      submissions.map((submission) => ctx.db.delete(submission._id)),
    );
    await Promise.all(rounds.map((round) => ctx.db.delete(round._id)));
    await Promise.all(sessions.map((session) => ctx.db.delete(session._id)));

    await Promise.all(
      imageSubmissions.map((submission) =>
        ctx.storage.delete(submission.imageStorageId),
      ),
    );
    await Promise.all(
      imageSubmissions.map((submission) => ctx.db.delete(submission._id)),
    );
    await Promise.all(imageRounds.map((round) => ctx.db.delete(round._id)));
    await Promise.all(
      imageSessions.map((session) => ctx.db.delete(session._id)),
    );

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
