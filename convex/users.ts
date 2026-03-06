import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import {
  ensureViewerUsername,
  requireViewer,
  userHasAuthProvider,
} from "./lib/auth";
import { generateFunnyUsername, sanitizeUsername } from "./lib/lobby";

export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireViewer(ctx);
    const username = user.name
      ? sanitizeUsername(user.name)
      : generateFunnyUsername(user._id);
    const hasPasswordAccount = await userHasAuthProvider(
      ctx,
      user._id,
      "password",
    );

    return {
      userId: user._id,
      email: user.email ?? null,
      isAnonymous: !!user.isAnonymous,
      authType:
        hasPasswordAccount && !user.isAnonymous
          ? "email-password"
          : "anonymous",
      canCreateLobby: hasPasswordAccount && !user.isAnonymous,
      username,
    };
  },
});

export const updateUsername = mutation({
  args: {
    username: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireViewer(ctx);
    const username = sanitizeUsername(args.username);

    if (username.length < 2) {
      throw new Error("Usernames must be at least 2 characters long.");
    }

    await ctx.db.patch(user._id, { name: username });

    const players = await ctx.db
      .query("lobbyPlayers")
      .withIndex("userId", (query) => query.eq("userId", user._id))
      .collect();

    await Promise.all(
      players.map((player) =>
        ctx.db.patch(player._id, { displayName: username }),
      ),
    );

    const updatedUser = await ensureViewerUsername(ctx, {
      ...user,
      name: username,
    });

    return {
      userId: updatedUser._id,
      username: updatedUser.name,
      email: updatedUser.email ?? null,
      isAnonymous: !!updatedUser.isAnonymous,
    };
  },
});
