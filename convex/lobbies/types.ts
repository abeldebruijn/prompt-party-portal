import { v } from "convex/values";

import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const leaderboardEntryValidator = v.object({
  playerId: v.optional(v.id("lobbyPlayers")),
  displayName: v.string(),
  rank: v.number(),
  score: v.number(),
  note: v.optional(v.string()),
});

export type DbContext = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;

export type LeaderboardPlayerReference = {
  playerId?: Id<"lobbyPlayers">;
};
