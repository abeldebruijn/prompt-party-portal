import { v } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";

export const getViewerEmailChangeContext = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (user === null) {
      throw new Error("Your user profile could not be found.");
    }

    const passwordAccount = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (query) =>
        query.eq("userId", user._id).eq("provider", "password"),
      )
      .unique();

    return {
      isAnonymous: !!user.isAnonymous,
      passwordAccountId: passwordAccount?.providerAccountId ?? null,
    };
  },
});

export const commitEmailChange = internalMutation({
  args: {
    newEmail: v.string(),
    previousEmail: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (user === null) {
      throw new Error("Your user profile could not be found.");
    }

    const passwordAccount = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (query) =>
        query.eq("userId", args.userId).eq("provider", "password"),
      )
      .unique();

    if (
      passwordAccount === null ||
      passwordAccount.providerAccountId !== args.previousEmail
    ) {
      throw new Error("Your password account could not be found.");
    }

    const existingAccount = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (query) =>
        query.eq("provider", "password").eq("providerAccountId", args.newEmail),
      )
      .unique();

    if (existingAccount !== null && existingAccount.userId !== args.userId) {
      throw new Error("That email already has an account.");
    }

    await ctx.db.patch(passwordAccount._id, {
      providerAccountId: args.newEmail,
    });
    await ctx.db.patch(args.userId, {
      email: args.newEmail,
    });

    return {
      email: args.newEmail,
      userId: args.userId,
    };
  },
});
