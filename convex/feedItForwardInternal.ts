import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { FEED_IT_FORWARD_MINIMUM_INTER_ROUND_WAIT_MS } from "./feed_it_forward/constants";
import {
  clampSetupPromptCount,
  computeLeaderboard,
  deriveRoundAssignment,
  deriveSessionSummary,
  getActiveSession,
  getChain,
  getCurrentRound,
  getSetupSlot,
  listAllActivePlayers,
  listRoundSubmissions,
  listSessionChains,
  listSetupSlots,
  requireFeedItForwardMembership,
  upsertRoundSubmissionForPlayer,
} from "./feed_it_forward/helpers";
import { FEED_IT_FORWARD_GAME_NAME } from "./lib/lobby";

function countLockedPendingImages(
  submissions: Awaited<ReturnType<typeof listRoundSubmissions>>,
) {
  return submissions.filter(
    (submission) =>
      submission.lockedAt !== undefined &&
      submission.generationStatus === "Generating",
  ).length;
}

function hasMinimumWaitElapsed(round: Doc<"feedItForwardRounds">, now: number) {
  return round.waitEndsAt === undefined || now >= round.waitEndsAt;
}

async function scheduleAiRoundSubmissions(
  ctx: MutationCtx,
  session: Doc<"feedItForwardSessions">,
  roundId: Id<"feedItForwardRounds">,
) {
  const participants = await Promise.all(
    session.playerOrderIds.map((playerId) => ctx.db.get(playerId)),
  );
  const aiPlayers = participants.filter(
    (player) => player?.isActive && player.kind === "ai",
  );

  for (const [index, player] of aiPlayers.entries()) {
    await ctx.scheduler.runAfter(
      300 + index * 350,
      internal.feedItForwardNode.generateAiRoundSubmission,
      {
        lobbyId: session.lobbyId,
        roundId,
        playerId: player._id,
      },
    );
  }
}

async function queuePendingAiSetupDuringCreation(
  ctx: MutationCtx,
  lobbyId: Id<"lobbies">,
) {
  const lobby = await ctx.db.get(lobbyId);

  if (
    lobby === null ||
    lobby.state !== "Creation" ||
    lobby.selectedGame !== FEED_IT_FORWARD_GAME_NAME
  ) {
    return { scheduledCount: 0 };
  }

  const [players, setupSlots] = await Promise.all([
    listAllActivePlayers(ctx, lobbyId),
    listSetupSlots(ctx, lobbyId),
  ]);
  const setupPromptCount = clampSetupPromptCount(
    lobby.feedItForwardSetupPromptCount,
  );
  let scheduledCount = 0;

  for (const player of players) {
    if (player.kind !== "ai") {
      continue;
    }

    for (let slotIndex = 0; slotIndex < setupPromptCount; slotIndex += 1) {
      const slot =
        setupSlots.find(
          (entry) =>
            entry.playerId === player._id && entry.slotIndex === slotIndex,
        ) ?? null;

      const isReady =
        slot !== null &&
        slot.status === "Ready" &&
        slot.prompt !== undefined &&
        slot.promptEmbedding !== undefined &&
        slot.imageStorageId !== undefined &&
        slot.imageMediaType !== undefined &&
        slot.finalizedAt !== undefined;

      if (isReady || slot?.status === "Generating") {
        continue;
      }

      const ensuredSlot = await ensureSlotForMutation(ctx, {
        lobbyId,
        playerId: player._id,
        slotIndex,
        isAutoFilled: true,
      });
      await ctx.db.patch(ensuredSlot._id, {
        status: "Generating",
        isAutoFilled: true,
        updatedAt: Date.now(),
      });
      await ctx.scheduler.runAfter(
        0,
        internal.feedItForwardNode.generateCreationAiSetupSlot,
        {
          lobbyId,
          playerId: player._id,
          slotIndex,
        },
      );
      scheduledCount += 1;
    }
  }

  return { scheduledCount };
}

async function startNextRound(
  ctx: MutationCtx,
  session: Doc<"feedItForwardSessions">,
  nextRoundNumber: number,
) {
  const roundsPerSlot = Math.max(session.playerOrderIds.length - 1, 1);
  const nextSlotIndex = Math.floor((nextRoundNumber - 1) / roundsPerSlot);
  const nextHopNumber = ((nextRoundNumber - 1) % roundsPerSlot) + 1;
  const now = Date.now();
  const endsAt = now + session.roundDurationSeconds * 1000;
  const nextRoundId = await ctx.db.insert("feedItForwardRounds", {
    sessionId: session._id,
    lobbyId: session.lobbyId,
    roundNumber: nextRoundNumber,
    slotIndex: nextSlotIndex,
    hopNumber: nextHopNumber,
    status: "Playing",
    startedAt: now,
    endsAt,
  });

  await ctx.db.patch(session._id, {
    currentRoundNumber: nextRoundNumber,
    status: "Playing",
  });
  await ctx.db.patch(session.lobbyId, {
    currentRound: nextRoundNumber,
    lastActivityAt: now,
  });
  await ctx.scheduler.runAt(
    endsAt,
    internal.feedItForwardInternal.handleRoundDeadline,
    { roundId: nextRoundId },
  );
  await scheduleAiRoundSubmissions(ctx, session, nextRoundId);
}

async function upsertStepZeroFromSetupSlot(
  ctx: MutationCtx,
  args: {
    session: Doc<"feedItForwardSessions">;
    slot: Doc<"feedItForwardSetupSlots">;
  },
) {
  const chain = await getChain(
    ctx,
    args.session._id,
    args.slot.playerId,
    args.slot.slotIndex,
  );

  if (
    chain === null ||
    args.slot.prompt === undefined ||
    args.slot.promptEmbedding === undefined ||
    args.slot.imageStorageId === undefined ||
    args.slot.imageMediaType === undefined
  ) {
    return;
  }

  const existingStep = await ctx.db
    .query("feedItForwardChainSteps")
    .withIndex("sourceKey", (query) =>
      query.eq("sourceKey", args.slot.sourceKey),
    )
    .unique();

  if (existingStep === null) {
    await ctx.db.insert("feedItForwardChainSteps", {
      sessionId: args.session._id,
      lobbyId: args.session.lobbyId,
      ownerPlayerId: args.slot.playerId,
      slotIndex: args.slot.slotIndex,
      stepNumber: 0,
      sourceKey: args.slot.sourceKey,
      authorPlayerId: args.slot.playerId,
      prompt: args.slot.prompt,
      promptEmbedding: args.slot.promptEmbedding,
      imageStorageId: args.slot.imageStorageId,
      imageMediaType: args.slot.imageMediaType,
      createdAt: args.slot.updatedAt,
    });
  }

  await ctx.db.patch(chain._id, {
    currentSourceKey: args.slot.sourceKey,
    currentStepNumber: 0,
    status: "Ready",
  });
}

async function maybeStartFirstRound(
  ctx: MutationCtx,
  session: Doc<"feedItForwardSessions">,
) {
  const chains = await listSessionChains(ctx, session._id);

  if (
    session.currentRoundNumber > 0 ||
    chains.some((chain) => chain.status !== "Ready")
  ) {
    return;
  }

  const now = Date.now();
  const endsAt = now + session.roundDurationSeconds * 1000;
  const roundId = await ctx.db.insert("feedItForwardRounds", {
    sessionId: session._id,
    lobbyId: session.lobbyId,
    roundNumber: 1,
    slotIndex: 0,
    hopNumber: 1,
    status: "Playing",
    startedAt: now,
    endsAt,
  });

  await ctx.db.patch(session._id, {
    currentRoundNumber: 1,
    status: "Playing",
  });
  await ctx.db.patch(session.lobbyId, {
    currentRound: 1,
    lastActivityAt: now,
  });
  await ctx.scheduler.runAt(
    endsAt,
    internal.feedItForwardInternal.handleRoundDeadline,
    {
      roundId,
    },
  );
  await scheduleAiRoundSubmissions(ctx, session, roundId);
}

async function maybeAdvanceAfterWaiting(
  ctx: MutationCtx,
  sessionId: Id<"feedItForwardSessions">,
  roundId: Id<"feedItForwardRounds">,
) {
  const session = await ctx.db.get(sessionId);
  const round = await ctx.db.get(roundId);

  if (
    session === null ||
    round === null ||
    round.status !== "WaitingForImages" ||
    session.status !== "WaitingForImages"
  ) {
    return;
  }

  const submissions = await listRoundSubmissions(ctx, round._id);
  const lockedPendingCount = countLockedPendingImages(submissions);
  const now = Date.now();

  if (lockedPendingCount > 0 || !hasMinimumWaitElapsed(round, now)) {
    return;
  }

  await applyRoundOutcome(ctx, session, round);
}

async function applyRoundOutcome(
  ctx: MutationCtx,
  session: Doc<"feedItForwardSessions">,
  round: Doc<"feedItForwardRounds">,
) {
  const submissions = await listRoundSubmissions(ctx, round._id);
  const lockedReady = submissions.filter(
    (submission) =>
      submission.lockedAt !== undefined &&
      submission.generationStatus === "Ready" &&
      submission.imageStorageId !== undefined &&
      submission.imageMediaType !== undefined &&
      submission.promptEmbedding !== undefined,
  );
  const now = Date.now();

  for (const submission of lockedReady) {
    const chain = await getChain(
      ctx,
      session._id,
      submission.ownerPlayerId,
      submission.slotIndex,
    );

    if (chain === null) {
      continue;
    }

    const promptEmbedding = submission.promptEmbedding;
    const imageStorageId = submission.imageStorageId;
    const imageMediaType = submission.imageMediaType;
    const lockedAt = submission.lockedAt;

    if (
      promptEmbedding === undefined ||
      imageStorageId === undefined ||
      imageMediaType === undefined ||
      lockedAt === undefined
    ) {
      continue;
    }

    await ctx.db.insert("feedItForwardChainSteps", {
      sessionId: session._id,
      lobbyId: session.lobbyId,
      ownerPlayerId: submission.ownerPlayerId,
      slotIndex: submission.slotIndex,
      stepNumber: submission.previousStepNumber + 1,
      sourceKey: submission.sourceKey,
      authorPlayerId: submission.authorPlayerId,
      prompt: submission.prompt,
      promptEmbedding,
      imageStorageId,
      imageMediaType,
      roundNumber: submission.roundNumber,
      createdAt: lockedAt,
    });
    await ctx.db.patch(chain._id, {
      currentSourceKey: submission.sourceKey,
      currentStepNumber: submission.previousStepNumber + 1,
      status: "Ready",
    });
  }

  await ctx.db.patch(round._id, {
    status: "Completed",
    completedAt: now,
  });

  if (round.roundNumber >= session.totalRounds) {
    const lobby = await ctx.db.get(session.lobbyId);
    if (lobby === null) {
      throw new Error("The Feed It Forward lobby could not be found.");
    }
    const leaderboard = await computeLeaderboard(
      ctx,
      session._id,
      session.playerOrderIds,
    );
    await ctx.db.insert("lobbyCompletions", {
      lobbyId: session.lobbyId,
      completedByUserId: lobby.hostUserId,
      selectedGame: "Feed It Forward",
      completedAt: now,
      summary: deriveSessionSummary(session.totalRounds),
      leaderboard,
    });
    await ctx.db.patch(session._id, {
      status: "Completed",
      completedAt: now,
    });
    await ctx.db.patch(session.lobbyId, {
      state: "Completion",
      currentRound: round.roundNumber,
      completedAt: now,
      lastActivityAt: now,
    });
    return;
  }

  await startNextRound(ctx, session, round.roundNumber + 1);
}

export const getSetupSlotPayload = internalQuery({
  args: {
    lobbyId: v.id("lobbies"),
    slotIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const { player } = await queryMembership(ctx, args.lobbyId);

    return {
      playerId: player._id,
    };
  },
});

async function queryMembership(ctx: QueryCtx, lobbyId: Id<"lobbies">) {
  return await requireFeedItForwardMembership(ctx, lobbyId);
}

export const schedulePendingAiSetupDuringCreation = internalMutation({
  args: {
    lobbyId: v.id("lobbies"),
  },
  handler: async (ctx, args) => {
    return await queuePendingAiSetupDuringCreation(ctx, args.lobbyId);
  },
});

export const markSetupGenerating = internalMutation({
  args: {
    lobbyId: v.id("lobbies"),
    playerId: v.id("lobbyPlayers"),
    slotIndex: v.number(),
    isAutoFilled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const slot = await ensureSlotForMutation(ctx, args);

    await ctx.db.patch(slot._id, {
      status: "Generating",
      isAutoFilled: args.isAutoFilled,
      updatedAt: Date.now(),
    });
  },
});

export const getCreationAiSetupPayload = internalQuery({
  args: {
    lobbyId: v.id("lobbies"),
    playerId: v.id("lobbyPlayers"),
    slotIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const [lobby, player] = await Promise.all([
      ctx.db.get(args.lobbyId),
      ctx.db.get(args.playerId),
    ]);

    if (
      lobby === null ||
      lobby.state !== "Creation" ||
      lobby.selectedGame !== FEED_IT_FORWARD_GAME_NAME ||
      player === null ||
      player.lobbyId !== args.lobbyId ||
      !player.isActive ||
      player.kind !== "ai"
    ) {
      return null;
    }

    const slot = await getSetupSlot(
      ctx,
      args.lobbyId,
      args.playerId,
      args.slotIndex,
    );

    if (slot?.status === "Generating") {
      return {
        lobbyId: args.lobbyId,
        playerId: args.playerId,
        slotIndex: args.slotIndex,
      };
    }

    return null;
  },
});

async function ensureSlotForMutation(
  ctx: MutationCtx,
  args: {
    lobbyId: Id<"lobbies">;
    playerId: Id<"lobbyPlayers">;
    slotIndex: number;
    isAutoFilled: boolean;
  },
) {
  const existing = await getSetupSlot(
    ctx,
    args.lobbyId,
    args.playerId,
    args.slotIndex,
  );

  if (existing !== null) {
    return existing;
  }

  const slotId = await ctx.db.insert("feedItForwardSetupSlots", {
    lobbyId: args.lobbyId,
    playerId: args.playerId,
    slotIndex: args.slotIndex,
    sourceKey: `setup:${args.playerId}:${args.slotIndex}`,
    status: "Empty",
    isAutoFilled: args.isAutoFilled,
    updatedAt: Date.now(),
  });

  const slot = await ctx.db.get(slotId);

  if (slot === null) {
    throw new Error("The setup slot could not be created.");
  }

  return slot;
}

export const generateUploadUrl = internalMutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const storeSetupGenerationResult = internalMutation({
  args: {
    lobbyId: v.id("lobbies"),
    playerId: v.id("lobbyPlayers"),
    slotIndex: v.number(),
    prompt: v.string(),
    promptParts: v.object({
      subject: v.string(),
      action: v.string(),
      detail1: v.string(),
      detail2: v.string(),
      detail3: v.string(),
    }),
    promptEmbedding: v.array(v.float64()),
    imageStorageId: v.id("_storage"),
    imageMediaType: v.string(),
    isAutoFilled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const slot = await ensureSlotForMutation(ctx, args);
    const previousStorageId = slot.imageStorageId;
    const now = Date.now();

    await ctx.db.patch(slot._id, {
      prompt: args.prompt,
      promptParts: args.promptParts,
      promptEmbedding: args.promptEmbedding,
      imageStorageId: args.imageStorageId,
      imageMediaType: args.imageMediaType,
      status: "Ready",
      isAutoFilled: args.isAutoFilled,
      finalizedAt: now,
      updatedAt: now,
    });

    if (
      previousStorageId !== undefined &&
      previousStorageId !== args.imageStorageId
    ) {
      await ctx.storage.delete(previousStorageId);
    }

    return {
      storageId: args.imageStorageId,
      updatedAt: now,
    };
  },
});

export const finalizeSetupSlotForSession = internalMutation({
  args: {
    sessionId: v.id("feedItForwardSessions"),
    playerId: v.id("lobbyPlayers"),
    slotIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);

    if (session === null) {
      return;
    }

    const slot = await getSetupSlot(
      ctx,
      session.lobbyId,
      args.playerId,
      args.slotIndex,
    );

    if (
      slot === null ||
      slot.status !== "Ready" ||
      slot.prompt === undefined ||
      slot.promptEmbedding === undefined ||
      slot.imageStorageId === undefined ||
      slot.imageMediaType === undefined
    ) {
      return;
    }

    await ctx.db.patch(slot._id, {
      finalizedAt: slot.finalizedAt ?? Date.now(),
    });
    await upsertStepZeroFromSetupSlot(ctx, {
      session,
      slot: {
        ...slot,
        finalizedAt: slot.finalizedAt ?? Date.now(),
      },
    });
    await maybeStartFirstRound(ctx, session);
  },
});

export const getSubmissionGenerationPayload = internalQuery({
  args: {
    submissionId: v.id("feedItForwardSubmissions"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.submissionId);
  },
});

export const getAiRoundSubmissionPayload = internalQuery({
  args: {
    lobbyId: v.id("lobbies"),
    roundId: v.id("feedItForwardRounds"),
    playerId: v.id("lobbyPlayers"),
  },
  handler: async (ctx, args) => {
    const [session, round, player] = await Promise.all([
      getActiveSession(ctx, args.lobbyId),
      ctx.db.get(args.roundId),
      ctx.db.get(args.playerId),
    ]);

    if (
      session === null ||
      round === null ||
      player === null ||
      round.sessionId !== session._id ||
      round.status !== "Playing" ||
      session.status !== "Playing" ||
      !player.isActive ||
      player.kind !== "ai" ||
      !session.playerOrderIds.includes(player._id)
    ) {
      return null;
    }

    const existingSubmission = await ctx.db
      .query("feedItForwardSubmissions")
      .withIndex("roundIdAndAuthorPlayerId", (query) =>
        query.eq("roundId", round._id).eq("authorPlayerId", player._id),
      )
      .unique();

    if (existingSubmission !== null) {
      return null;
    }

    const assignment = deriveRoundAssignment(
      session.playerOrderIds,
      round.roundNumber,
      player._id,
    );

    if (assignment === null) {
      return null;
    }

    const chain = await getChain(
      ctx,
      session._id,
      assignment.ownerPlayerId,
      assignment.slotIndex,
    );

    if (
      chain === null ||
      chain.status !== "Ready" ||
      chain.currentSourceKey === undefined
    ) {
      return null;
    }

    const sourceStep = await ctx.db
      .query("feedItForwardChainSteps")
      .withIndex("sourceKey", (query) =>
        query.eq("sourceKey", chain.currentSourceKey as string),
      )
      .unique();

    if (
      sourceStep === null ||
      sourceStep.imageStorageId === undefined ||
      sourceStep.imageMediaType === undefined
    ) {
      return null;
    }

    return {
      lobbyId: args.lobbyId,
      roundId: round._id,
      playerId: player._id,
      playerDisplayName: player.displayName,
      personalityType: player.aiPersonalityType ?? "complimenting",
      customPrompt: player.aiCustomPrompt ?? null,
      sourceImageStorageId: sourceStep.imageStorageId,
      sourceImageMediaType: sourceStep.imageMediaType,
      sourcePrompt: sourceStep.prompt,
    };
  },
});

export const submitPromptAsPlayer = internalMutation({
  args: {
    lobbyId: v.id("lobbies"),
    playerId: v.id("lobbyPlayers"),
    prompt: v.string(),
  },
  handler: async (ctx, args) => {
    const [session, player] = await Promise.all([
      getActiveSession(ctx, args.lobbyId),
      ctx.db.get(args.playerId),
    ]);

    if (
      session === null ||
      session.status !== "Playing" ||
      player === null ||
      player.lobbyId !== args.lobbyId ||
      !player.isActive ||
      !session.playerOrderIds.includes(player._id)
    ) {
      return null;
    }

    const round = await getCurrentRound(
      ctx,
      session._id,
      session.currentRoundNumber,
    );

    if (
      round === null ||
      round.status !== "Playing" ||
      Date.now() > round.endsAt
    ) {
      return null;
    }

    return await upsertRoundSubmissionForPlayer(ctx, {
      lobbyId: args.lobbyId,
      session,
      round,
      playerId: player._id,
      prompt: args.prompt,
      replaceExisting: false,
    });
  },
});

export const finalizeRoundSubmission = internalMutation({
  args: {
    submissionId: v.id("feedItForwardSubmissions"),
    generationNonce: v.number(),
    promptEmbedding: v.array(v.float64()),
    imageStorageId: v.id("_storage"),
    imageMediaType: v.string(),
    previousSimilarity: v.number(),
    originalSimilarity: v.number(),
    previousScore: v.number(),
    originalScore: v.number(),
  },
  handler: async (ctx, args) => {
    const submission = await ctx.db.get(args.submissionId);

    if (
      submission === null ||
      submission.latestGenerationNonce !== args.generationNonce
    ) {
      await ctx.storage.delete(args.imageStorageId);
      return;
    }

    if (
      submission.imageStorageId !== undefined &&
      submission.imageStorageId !== args.imageStorageId
    ) {
      await ctx.storage.delete(submission.imageStorageId);
    }

    await ctx.db.patch(submission._id, {
      generationStatus: "Ready",
      promptEmbedding: args.promptEmbedding,
      imageStorageId: args.imageStorageId,
      imageMediaType: args.imageMediaType,
      previousSimilarity: args.previousSimilarity,
      originalSimilarity: args.originalSimilarity,
      previousScore: args.previousScore,
      originalScore: args.originalScore,
      totalScore: args.previousScore + args.originalScore,
    });
    await maybeAdvanceAfterWaiting(
      ctx,
      submission.sessionId,
      submission.roundId,
    );
  },
});

export const handleRoundDeadline = internalMutation({
  args: {
    roundId: v.id("feedItForwardRounds"),
  },
  handler: async (ctx, args) => {
    const round = await ctx.db.get(args.roundId);

    if (round === null || round.status !== "Playing") {
      return;
    }

    const session = await ctx.db.get(round.sessionId);

    if (session === null || session.status !== "Playing") {
      return;
    }

    const submissions = await listRoundSubmissions(ctx, round._id);
    const now = Date.now();
    const isFinalRound = round.roundNumber >= session.totalRounds;

    await Promise.all(
      submissions
        .filter(
          (submission) =>
            submission.lockedAt === undefined &&
            submission.submittedAt <= round.endsAt,
        )
        .map((submission) =>
          ctx.db.patch(submission._id, {
            lockedAt: now,
          }),
        ),
    );

    const refreshedSubmissions = await listRoundSubmissions(ctx, round._id);
    const lockedPendingCount = countLockedPendingImages(refreshedSubmissions);

    if (isFinalRound && lockedPendingCount === 0) {
      await applyRoundOutcome(ctx, session, round);
      return;
    }

    const waitEndsAt = isFinalRound
      ? undefined
      : now + FEED_IT_FORWARD_MINIMUM_INTER_ROUND_WAIT_MS;

    await ctx.db.patch(round._id, {
      status: "WaitingForImages",
      waitingStartedAt: now,
      waitEndsAt,
    });
    await ctx.db.patch(session._id, {
      status: "WaitingForImages",
    });
    await ctx.db.patch(session.lobbyId, {
      lastActivityAt: now,
    });

    if (waitEndsAt !== undefined) {
      await ctx.scheduler.runAt(
        waitEndsAt,
        internal.feedItForwardInternal.handleRoundWaitElapsed,
        { roundId: round._id },
      );
    }

    if (
      lockedPendingCount > 0 ||
      !hasMinimumWaitElapsed({ ...round, waitEndsAt }, now)
    ) {
      return;
    }

    await applyRoundOutcome(ctx, session, {
      ...round,
      status: "WaitingForImages",
      waitingStartedAt: now,
      waitEndsAt,
    });
  },
});

export const handleRoundWaitElapsed = internalMutation({
  args: {
    roundId: v.id("feedItForwardRounds"),
  },
  handler: async (ctx, args) => {
    const round = await ctx.db.get(args.roundId);

    if (round === null || round.status !== "WaitingForImages") {
      return;
    }

    const session = await ctx.db.get(round.sessionId);

    if (session === null || session.status !== "WaitingForImages") {
      return;
    }

    await maybeAdvanceAfterWaiting(ctx, session._id, round._id);
  },
});
