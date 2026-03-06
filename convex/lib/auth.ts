import { getAuthUserId } from "@convex-dev/auth/server";

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { generateFunnyUsername, sanitizeUsername } from "./lobby";

type AuthContext =
  | Pick<QueryCtx, "auth" | "db">
  | Pick<MutationCtx, "auth" | "db">;
type MutationAuthContext = Pick<MutationCtx, "auth" | "db">;

export async function requireViewer(ctx: AuthContext) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new Error("You must be signed in to do that.");
  }

  const user = await ctx.db.get(userId);
  if (user === null) {
    throw new Error("Your user profile could not be found.");
  }

  return user;
}

export async function ensureViewerUsername(
  ctx: MutationAuthContext,
  user: Doc<"users">,
) {
  const existingUsername = user.name ? sanitizeUsername(user.name) : "";
  if (existingUsername.length > 0) {
    if (existingUsername !== user.name) {
      await ctx.db.patch(user._id, { name: existingUsername });
      return { ...user, name: existingUsername };
    }

    return user;
  }

  const generatedUsername = generateFunnyUsername(user._id);
  await ctx.db.patch(user._id, { name: generatedUsername });
  return { ...user, name: generatedUsername };
}

export async function userHasAuthProvider(
  ctx: AuthContext,
  userId: Id<"users">,
  provider: string,
) {
  const account = await ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (query) =>
      query.eq("userId", userId).eq("provider", provider),
    )
    .unique();

  return account !== null;
}
