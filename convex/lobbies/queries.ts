import { v } from "convex/values";

import type { Doc } from "../_generated/dataModel";
import { query } from "../_generated/server";
import { requireViewer } from "../lib/auth";
import { PLACEHOLDER_GAMES } from "../lib/lobby";

import {
  buildLobbySnapshot,
  buildLobbySummary,
  clampLimit,
  findViewerPlayer,
  getLobbyByJoinCodeOrThrow,
  requireLobbyMembership,
  sortLobbiesByActivity,
} from "./helpers";

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
    const showAll = args.limit === 0;
    const limit = clampLimit(args.limit);

    const createdLobbyQuery = ctx.db
      .query("lobbies")
      .withIndex("hostUserId", (query) => query.eq("hostUserId", viewer._id))
      .order("desc");
    const createdLobbies = showAll
      ? await createdLobbyQuery.collect()
      : await createdLobbyQuery.take(limit);

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
          .slice(0, showAll ? playedLobbies.length : limit)
          .map((lobby) => buildLobbySummary(ctx, lobby)),
      )
    ).filter(Boolean);

    return { created, played };
  },
});
