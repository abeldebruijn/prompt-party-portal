import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { mutation } from "../_generated/server";
import {
  clampRoundDurationSeconds,
  clampSetupPromptCount,
  deriveTotalRoundCount,
  ensureSetupSlot,
  getActiveSession,
  getCurrentRound,
  getSetupSlot,
  listActiveParticipants,
  listSetupSlots,
  requireFeedItForwardHost,
  requireFeedItForwardMembership,
  upsertRoundSubmissionForPlayer,
} from "./helpers";

export const updateSettings = mutation({
  args: {
    lobbyId: v.id("lobbies"),
    setupPromptCount: v.number(),
    roundDurationSeconds: v.number(),
  },
  handler: async (ctx, args) => {
    const { lobby } = await requireFeedItForwardHost(ctx, args.lobbyId);

    if (lobby.state !== "Creation") {
      throw new Error(
        "Feed It Forward settings can only change during lobby setup.",
      );
    }

    const setupPromptCount = clampSetupPromptCount(args.setupPromptCount);
    const roundDurationSeconds = clampRoundDurationSeconds(
      args.roundDurationSeconds,
    );

    if (setupPromptCount !== args.setupPromptCount) {
      throw new Error("Setup prompts per player must be between 1 and 6.");
    }

    if (roundDurationSeconds !== args.roundDurationSeconds) {
      throw new Error("Round duration must be between 15 and 180 seconds.");
    }

    await ctx.db.patch(lobby._id, {
      feedItForwardSetupPromptCount: setupPromptCount,
      feedItForwardRoundDurationSeconds: roundDurationSeconds,
      lastActivityAt: Date.now(),
    });

    await ctx.scheduler.runAfter(
      0,
      internal.feedItForwardInternal.schedulePendingAiSetupDuringCreation,
      {
        lobbyId: args.lobbyId,
      },
    );

    return {
      lobbyId: lobby._id,
      setupPromptCount,
      roundDurationSeconds,
    };
  },
});

export const finalizeSetupSlot = mutation({
  args: {
    lobbyId: v.id("lobbies"),
    slotIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const membership = await requireFeedItForwardMembership(ctx, args.lobbyId);

    if (membership.lobby.state !== "Creation") {
      throw new Error(
        "Setup slots can only be finalized before the game starts.",
      );
    }

    const slot = await getSetupSlot(
      ctx,
      args.lobbyId,
      membership.player._id,
      args.slotIndex,
    );

    if (
      slot === null ||
      slot.status !== "Ready" ||
      slot.prompt === undefined ||
      slot.imageStorageId === undefined
    ) {
      throw new Error("Generate a setup image before finalizing this slot.");
    }

    await ctx.db.patch(slot._id, {
      finalizedAt: Date.now(),
      isAutoFilled: false,
      updatedAt: Date.now(),
    });

    return {
      lobbyId: args.lobbyId,
      slotIndex: args.slotIndex,
      finalizedAt: Date.now(),
    };
  },
});

export const startGame = mutation({
  args: {
    lobbyId: v.id("lobbies"),
  },
  handler: async (ctx, args) => {
    const { lobby } = await requireFeedItForwardHost(ctx, args.lobbyId);

    if (lobby.state !== "Creation") {
      throw new Error("Only lobbies in setup mode can start Feed It Forward.");
    }

    const players = await listActiveParticipants(ctx, args.lobbyId);

    if (players.length < 2) {
      throw new Error(
        "At least two active players are required for Feed It Forward.",
      );
    }

    const setupPromptCount = clampSetupPromptCount(
      lobby.feedItForwardSetupPromptCount,
    );
    const roundDurationSeconds = clampRoundDurationSeconds(
      lobby.feedItForwardRoundDurationSeconds,
    );
    const totalRounds = deriveTotalRoundCount(players.length, setupPromptCount);
    const now = Date.now();
    const sessionId = await ctx.db.insert("feedItForwardSessions", {
      lobbyId: args.lobbyId,
      setupPromptCount,
      roundDurationSeconds,
      playerOrderIds: players.map((player) => player._id),
      totalRounds,
      currentRoundNumber: 0,
      status: "WaitingForSetup",
      startedAt: now,
    });
    const session = await ctx.db.get(sessionId);

    if (session === null) {
      throw new Error("Feed It Forward could not be started.");
    }

    const slots = await listSetupSlots(ctx, args.lobbyId);
    let hasPendingAutoFill = false;
    const readySlotsToFinalize: Array<{
      playerId: Id<"lobbyPlayers">;
      slotIndex: number;
    }> = [];

    for (const player of players) {
      for (let slotIndex = 0; slotIndex < setupPromptCount; slotIndex += 1) {
        const sourceKey = `setup:${player._id}:${slotIndex}`;
        await ctx.db.insert("feedItForwardChains", {
          sessionId,
          lobbyId: args.lobbyId,
          ownerPlayerId: player._id,
          slotIndex,
          originalSourceKey: sourceKey,
          currentSourceKey: undefined,
          currentStepNumber: undefined,
          status: "Pending",
        });

        const slot =
          slots.find(
            (entry) =>
              entry.playerId === player._id && entry.slotIndex === slotIndex,
          ) ?? null;

        if (
          slot !== null &&
          slot.finalizedAt !== undefined &&
          slot.status === "Ready" &&
          slot.prompt !== undefined &&
          slot.promptEmbedding !== undefined &&
          slot.imageStorageId !== undefined &&
          slot.imageMediaType !== undefined
        ) {
          readySlotsToFinalize.push({
            playerId: player._id,
            slotIndex,
          });
          continue;
        }

        hasPendingAutoFill = true;
        await ensureSetupSlot(ctx, args.lobbyId, player._id, slotIndex, true);
        await ctx.runMutation(
          internal.feedItForwardInternal.markSetupGenerating,
          {
            lobbyId: args.lobbyId,
            playerId: player._id,
            slotIndex,
            isAutoFilled: true,
          },
        );
        await ctx.scheduler.runAfter(
          0,
          internal.feedItForwardNode.generateAutoFillSetupSlot,
          {
            sessionId,
            lobbyId: args.lobbyId,
            playerId: player._id,
            slotIndex,
          },
        );
      }
    }

    for (const readySlot of readySlotsToFinalize) {
      await ctx.runMutation(
        internal.feedItForwardInternal.finalizeSetupSlotForSession,
        {
          sessionId,
          playerId: readySlot.playerId,
          slotIndex: readySlot.slotIndex,
        },
      );
    }

    await ctx.db.patch(lobby._id, {
      state: "Playing",
      currentRound: hasPendingAutoFill ? 0 : 1,
      startedAt: lobby.startedAt ?? now,
      completedAt: undefined,
      lastActivityAt: now,
      feedItForwardSetupPromptCount: setupPromptCount,
      feedItForwardRoundDurationSeconds: roundDurationSeconds,
    });

    return {
      lobbyId: args.lobbyId,
      sessionId,
      state: "Playing" as const,
      currentRound: hasPendingAutoFill ? 0 : 1,
    };
  },
});

export const submitPrompt = mutation({
  args: {
    lobbyId: v.id("lobbies"),
    prompt: v.string(),
  },
  handler: async (ctx, args) => {
    const membership = await requireFeedItForwardMembership(ctx, args.lobbyId);
    const session = await getActiveSession(ctx, args.lobbyId);

    if (session === null || session.status !== "Playing") {
      throw new Error("Feed It Forward is not currently accepting prompts.");
    }

    if (!session.playerOrderIds.includes(membership.player._id)) {
      throw new Error("You are spectating this session.");
    }

    const round = await getCurrentRound(
      ctx,
      session._id,
      session.currentRoundNumber,
    );

    if (round === null || round.status !== "Playing") {
      throw new Error("The current round is not accepting prompts.");
    }

    if (Date.now() > round.endsAt) {
      throw new Error("The round timer has already ended.");
    }

    return await upsertRoundSubmissionForPlayer(ctx, {
      lobbyId: args.lobbyId,
      round,
      session,
      playerId: membership.player._id,
      prompt: args.prompt,
      replaceExisting: true,
    });
  },
});
