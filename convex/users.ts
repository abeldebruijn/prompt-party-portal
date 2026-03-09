import { getAuthUserId, retrieveAccount } from "@convex-dev/auth/server";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { action, mutation, query } from "./_generated/server";
import {
  ensureViewerUsername,
  requireViewer,
  userHasAuthProvider,
} from "./lib/auth";
import { generateFunnyUsername, sanitizeUsername } from "./lib/lobby";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type EmailChangeContext = {
  isAnonymous: boolean;
  passwordAccountId: string | null;
};

const getViewerEmailChangeContextRef = makeFunctionReference<
  "query",
  { userId: Id<"users"> },
  EmailChangeContext
>("userEmailChange:getViewerEmailChangeContext");

const commitEmailChangeRef = makeFunctionReference<
  "mutation",
  {
    newEmail: string;
    previousEmail: string;
    userId: Id<"users">;
  },
  { email: string; userId: Id<"users"> }
>("userEmailChange:commitEmailChange");

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

export const changeEmail = action({
  args: {
    currentPassword: v.string(),
    newEmail: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("You must be signed in to do that.");
    }

    const currentPassword = args.currentPassword.trim();
    const newEmail = args.newEmail.trim();

    if (!currentPassword) {
      throw new Error(
        "Enter your current password to confirm the email change.",
      );
    }

    if (!EMAIL_PATTERN.test(newEmail)) {
      throw new Error("Enter a valid email address.");
    }

    const context = await ctx.runQuery(getViewerEmailChangeContextRef, {
      userId,
    });

    if (context.isAnonymous || context.passwordAccountId === null) {
      throw new Error(
        "Upgrade to an email/password account before changing email.",
      );
    }

    if (newEmail === context.passwordAccountId) {
      throw new Error("That is already your current email address.");
    }

    await retrieveAccount(ctx, {
      provider: "password",
      account: {
        id: context.passwordAccountId,
        secret: currentPassword,
      },
    });

    return await ctx.runMutation(commitEmailChangeRef, {
      userId,
      newEmail,
      previousEmail: context.passwordAccountId,
    });
  },
});
