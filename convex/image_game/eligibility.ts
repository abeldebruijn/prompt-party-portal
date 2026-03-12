import { v } from "convex/values";

import { internalQuery } from "../_generated/server";
import {
  getActiveSession,
  getCurrentRound,
  requireImageGameMembership,
} from "./helpers";

export const getSubmitPromptContext = internalQuery({
  args: {
    lobbyId: v.id("lobbies"),
  },
  handler: async (ctx, args) => {
    const membership = await requireImageGameMembership(ctx, args.lobbyId);
    const session = await getActiveSession(ctx, args.lobbyId);

    if (session === null || session.status !== "InProgress") {
      throw new Error("The image game is not currently running.");
    }

    const round = await getCurrentRound(
      ctx,
      session._id,
      session.currentRoundNumber,
    );

    if (round === null || round.stage !== "Generate") {
      throw new Error("Prompts can only be submitted during Generate.");
    }

    if (!round.eligiblePlayerIds.includes(membership.player._id)) {
      throw new Error("You are spectating this round and cannot submit.");
    }

    if (membership.player._id === round.targetPlayerId) {
      throw new Error(
        "The selected player judges this round and cannot submit.",
      );
    }

    const existingSubmission = await ctx.db
      .query("imageGameSubmissions")
      .withIndex("roundIdAndAuthorPlayerId", (query) =>
        query
          .eq("roundId", round._id)
          .eq("authorPlayerId", membership.player._id),
      )
      .unique();

    if (existingSubmission !== null) {
      throw new Error("You have already submitted a prompt for this round.");
    }

    return {
      roundId: round._id,
    };
  },
});

