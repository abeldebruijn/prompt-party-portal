import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { FEED_IT_FORWARD_ALL_SUBMITTED_ROUND_CAP_MS } from "./feed_it_forward/constants";
import { FEED_IT_FORWARD_GAME_NAME } from "./lib/lobby";
import { createConvexTest } from "./test.setup";

type TestBackend = ReturnType<typeof createConvexTest>;

let nextUserSeed = 0;

async function createViewer(
  t: TestBackend,
  options: {
    name?: string;
    hasPasswordAccount?: boolean;
  } = {},
) {
  nextUserSeed += 1;

  const userId = await t.run(async (ctx) => {
    const insertedUserId = await ctx.db.insert("users", {
      name: options.name ?? `User ${nextUserSeed}`,
      isAnonymous: false,
    });

    if (options.hasPasswordAccount) {
      await ctx.db.insert("authAccounts", {
        userId: insertedUserId,
        provider: "password",
        providerAccountId: `user-${nextUserSeed}@example.com`,
      });
    }

    return insertedUserId;
  });

  return {
    userId,
    client: t.withIdentity({ subject: userId }),
  };
}

const TEST_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO9Ww2kAAAAASUVORK5CYII=";

async function storeTestImage(t: TestBackend): Promise<Id<"_storage">> {
  return await t.run(async (ctx) => {
    const blob = new Blob([Buffer.from(TEST_PNG_BASE64, "base64")], {
      type: "image/png",
    });
    return (await ctx.storage.store(blob)) as Id<"_storage">;
  });
}

function requireValue<T>(value: T | null | undefined, label: string): T {
  expect(value, `${label} should exist`).not.toBeNull();
  expect(value, `${label} should exist`).not.toBeUndefined();
  return value as T;
}

async function createFeedLobby(t: TestBackend) {
  const host = await createViewer(t, {
    name: "Host Person",
    hasPasswordAccount: true,
  });
  const created = await host.client.mutation(api.lobbies.createLobby, {
    selectedGame: FEED_IT_FORWARD_GAME_NAME,
  });

  return {
    host,
    ...created,
  };
}

async function addAiPlayer(
  hostClient: Awaited<ReturnType<typeof createViewer>>["client"],
  lobbyId: Id<"lobbies">,
  options: {
    displayName?: string;
    personalityType?: "roasting" | "complimenting" | "custom";
    customPrompt?: string;
  } = {},
) {
  return await hostClient.mutation(api.lobbies.addAiPlayer, {
    lobbyId,
    displayName: options.displayName,
    personalityType: options.personalityType ?? "complimenting",
    customPrompt: options.customPrompt,
  });
}

async function seedFinalizedSetupSlot(
  t: TestBackend,
  args: {
    lobbyId: Id<"lobbies">;
    playerId: Id<"lobbyPlayers">;
    slotIndex: number;
    prompt: string;
  },
) {
  const imageStorageId = await storeTestImage(t);
  const embedding = Array.from({ length: 1536 }, (_, index) =>
    index % 3 === 0 ? 0.1 : 0,
  );

  await t.run(async (ctx) => {
    await ctx.db.insert("feedItForwardSetupSlots", {
      lobbyId: args.lobbyId,
      playerId: args.playerId,
      slotIndex: args.slotIndex,
      sourceKey: `setup:${args.playerId}:${args.slotIndex}`,
      prompt: args.prompt,
      promptEmbedding: embedding,
      imageStorageId,
      imageMediaType: "image/png",
      status: "Ready",
      isAutoFilled: false,
      finalizedAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
}

async function startTwoPlayerFeedItForwardGame(
  t: TestBackend,
  options: {
    setupPromptCount?: number;
    roundDurationSeconds?: number;
  } = {},
) {
  const {
    host,
    lobbyId,
    joinCode,
    playerId: hostPlayerId,
  } = await createFeedLobby(t);
  const member = await createViewer(t, { name: "Alice Example" });
  const joined = await member.client.mutation(api.lobbies.joinLobbyByCode, {
    joinCode,
  });
  const setupPromptCount = options.setupPromptCount ?? 1;
  const roundDurationSeconds = options.roundDurationSeconds ?? 45;

  await host.client.mutation(api.feedItForward.updateSettings, {
    lobbyId,
    setupPromptCount,
    roundDurationSeconds,
  });

  for (let slotIndex = 0; slotIndex < setupPromptCount; slotIndex += 1) {
    await seedFinalizedSetupSlot(t, {
      lobbyId,
      playerId: hostPlayerId,
      slotIndex,
      prompt: `Host seed ${slotIndex + 1}`,
    });
    await seedFinalizedSetupSlot(t, {
      lobbyId,
      playerId: joined.playerId,
      slotIndex,
      prompt: `Guest seed ${slotIndex + 1}`,
    });
  }

  await host.client.mutation(api.feedItForward.startGame, { lobbyId });

  const snapshot = await host.client.query(api.feedItForward.getGameState, {
    lobbyId,
  });

  return {
    host,
    member,
    joined,
    lobbyId,
    hostPlayerId,
    round: requireValue(snapshot.round, "started round"),
  };
}

describe("convex/feedItForward", () => {
  beforeEach(() => {
    process.env.FEED_IT_FORWARD_MOCK = "1";
  });

  afterEach(() => {
    delete process.env.FEED_IT_FORWARD_MOCK;
    vi.useRealTimers();
  });

  it("stores settings and starts from finalized setup slots", async () => {
    const t = createConvexTest();
    const {
      host,
      lobbyId,
      joinCode,
      playerId: hostPlayerId,
    } = await createFeedLobby(t);
    const member = await createViewer(t, { name: "Alice Example" });
    const joined = await member.client.mutation(api.lobbies.joinLobbyByCode, {
      joinCode,
    });

    await host.client.mutation(api.feedItForward.updateSettings, {
      lobbyId,
      setupPromptCount: 2,
      roundDurationSeconds: 45,
    });

    await seedFinalizedSetupSlot(t, {
      lobbyId,
      playerId: hostPlayerId,
      slotIndex: 0,
      prompt: "A moon fox conducts a choir of glowing umbrellas.",
    });
    await seedFinalizedSetupSlot(t, {
      lobbyId,
      playerId: hostPlayerId,
      slotIndex: 1,
      prompt: "A velvet whale paints rainbows in a teacup storm.",
    });
    await seedFinalizedSetupSlot(t, {
      lobbyId,
      playerId: joined.playerId,
      slotIndex: 0,
      prompt: "A brass owl surfs across a pancake eclipse.",
    });
    await seedFinalizedSetupSlot(t, {
      lobbyId,
      playerId: joined.playerId,
      slotIndex: 1,
      prompt: "A sapphire bear tends a garden of floating violins.",
    });

    await host.client.mutation(api.feedItForward.startGame, { lobbyId });

    const snapshot = await host.client.query(api.feedItForward.getGameState, {
      lobbyId,
    });

    expect(snapshot.settings.setupPromptCount).toBe(2);
    expect(snapshot.settings.roundDurationSeconds).toBe(45);
    expect(snapshot.settings.totalRounds).toBe(2);
    expect(snapshot.session?.status).toBe("Playing");
    expect(snapshot.round?.roundNumber).toBe(1);
    expect(snapshot.round?.sourceImageUrl).toBeTruthy();
  });

  it("caps the round deadline to 10 seconds when all participants have submitted", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-19T09:00:00.000Z"));

    const t = createConvexTest();
    const { host, member, lobbyId } = await startTwoPlayerFeedItForwardGame(t);

    const startingState = await host.client.query(
      api.feedItForward.getGameState,
      {
        lobbyId,
      },
    );
    const originalEndsAt = requireValue(
      startingState.round,
      "round before submissions",
    ).endsAt;

    await host.client.mutation(api.feedItForward.submitPrompt, {
      lobbyId,
      prompt: "Host prompt",
    });

    const afterFirstSubmission = await host.client.query(
      api.feedItForward.getGameState,
      {
        lobbyId,
      },
    );
    expect(
      requireValue(afterFirstSubmission.round, "round after first submit")
        .endsAt,
    ).toBe(originalEndsAt);

    await member.client.mutation(api.feedItForward.submitPrompt, {
      lobbyId,
      prompt: "Guest prompt",
    });

    const afterSecondSubmission = await host.client.query(
      api.feedItForward.getGameState,
      {
        lobbyId,
      },
    );
    const shortenedRound = requireValue(
      afterSecondSubmission.round,
      "round after second submit",
    );

    expect(shortenedRound.endsAt).toBe(
      Date.now() + FEED_IT_FORWARD_ALL_SUBMITTED_ROUND_CAP_MS,
    );
    expect(shortenedRound.endsAt).toBeLessThan(originalEndsAt);
  });

  it("does not shorten the round when 10 seconds or less remain", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-19T09:30:00.000Z"));

    const t = createConvexTest();
    const { host, member, lobbyId } = await startTwoPlayerFeedItForwardGame(t);

    const startingState = await host.client.query(
      api.feedItForward.getGameState,
      {
        lobbyId,
      },
    );
    const originalEndsAt = requireValue(
      startingState.round,
      "round before submissions",
    ).endsAt;

    await host.client.mutation(api.feedItForward.submitPrompt, {
      lobbyId,
      prompt: "Host prompt",
    });

    vi.advanceTimersByTime(36_000);
    vi.setSystemTime(Date.now());

    await member.client.mutation(api.feedItForward.submitPrompt, {
      lobbyId,
      prompt: "Guest prompt",
    });

    const afterSecondSubmission = await host.client.query(
      api.feedItForward.getGameState,
      {
        lobbyId,
      },
    );

    expect(
      requireValue(afterSecondSubmission.round, "round after late submit")
        .endsAt,
    ).toBe(originalEndsAt);
  });

  it("does not extend the shortened deadline on resubmission", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-19T09:45:00.000Z"));

    const t = createConvexTest();
    const { host, member, lobbyId } = await startTwoPlayerFeedItForwardGame(t);

    await host.client.mutation(api.feedItForward.submitPrompt, {
      lobbyId,
      prompt: "Host prompt",
    });
    await member.client.mutation(api.feedItForward.submitPrompt, {
      lobbyId,
      prompt: "Guest prompt",
    });

    const cappedState = await host.client.query(
      api.feedItForward.getGameState,
      {
        lobbyId,
      },
    );
    const cappedEndsAt = requireValue(cappedState.round, "capped round").endsAt;

    vi.advanceTimersByTime(3_000);
    vi.setSystemTime(Date.now());

    await host.client.mutation(api.feedItForward.submitPrompt, {
      lobbyId,
      prompt: "Host prompt revised",
    });

    const resubmittedState = await host.client.query(
      api.feedItForward.getGameState,
      {
        lobbyId,
      },
    );

    expect(
      requireValue(resubmittedState.round, "resubmitted round").endsAt,
    ).toBe(cappedEndsAt);
  });

  it("waits at least 15 seconds before advancing when images are ready at deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-19T10:00:00.000Z"));

    const t = createConvexTest();
    const {
      host,
      lobbyId,
      joinCode,
      playerId: hostPlayerId,
    } = await createFeedLobby(t);
    const member = await createViewer(t, { name: "Alice Example" });
    const joined = await member.client.mutation(api.lobbies.joinLobbyByCode, {
      joinCode,
    });

    await host.client.mutation(api.feedItForward.updateSettings, {
      lobbyId,
      setupPromptCount: 2,
      roundDurationSeconds: 45,
    });

    for (const [playerId, slotIndex, prompt] of [
      [hostPlayerId, 0, "A moon fox conducts a choir of glowing umbrellas."],
      [hostPlayerId, 1, "A velvet whale paints rainbows in a teacup storm."],
      [joined.playerId, 0, "A brass owl surfs across a pancake eclipse."],
      [
        joined.playerId,
        1,
        "A sapphire bear tends a garden of floating violins.",
      ],
    ] as const) {
      await seedFinalizedSetupSlot(t, {
        lobbyId,
        playerId,
        slotIndex,
        prompt,
      });
    }

    await host.client.mutation(api.feedItForward.startGame, { lobbyId });

    const beforeDeadline = await host.client.query(
      api.feedItForward.getGameState,
      {
        lobbyId,
      },
    );
    const firstRound = requireValue(beforeDeadline.round, "first round");

    await t.mutation(internal.feedItForwardInternal.handleRoundDeadline, {
      roundId: firstRound._id,
    });

    const waitingState = await host.client.query(
      api.feedItForward.getGameState,
      {
        lobbyId,
      },
    );

    expect(waitingState.session?.status).toBe("WaitingForImages");
    expect(waitingState.round?.status).toBe("WaitingForImages");
    expect(waitingState.waiting?.pendingImageCount).toBe(0);
    expect(waitingState.waiting?.remainingWaitSeconds).toBe(15);

    vi.advanceTimersByTime(14_000);
    vi.setSystemTime(Date.now());
    await t.mutation(internal.feedItForwardInternal.handleRoundWaitElapsed, {
      roundId: firstRound._id,
    });

    const stillWaiting = await host.client.query(
      api.feedItForward.getGameState,
      {
        lobbyId,
      },
    );
    expect(stillWaiting.session?.status).toBe("WaitingForImages");
    expect(stillWaiting.round?.roundNumber).toBe(1);

    vi.advanceTimersByTime(1_000);
    vi.setSystemTime(Date.now());
    await t.mutation(internal.feedItForwardInternal.handleRoundWaitElapsed, {
      roundId: firstRound._id,
    });

    const nextRound = await host.client.query(api.feedItForward.getGameState, {
      lobbyId,
    });
    expect(nextRound.session?.status).toBe("Playing");
    expect(nextRound.round?.roundNumber).toBe(2);
  });

  it("waits for both the timer and locked images before advancing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-19T11:00:00.000Z"));

    const t = createConvexTest();
    const {
      host,
      lobbyId,
      joinCode,
      playerId: hostPlayerId,
    } = await createFeedLobby(t);
    const member = await createViewer(t, { name: "Alice Example" });
    const joined = await member.client.mutation(api.lobbies.joinLobbyByCode, {
      joinCode,
    });

    await host.client.mutation(api.feedItForward.updateSettings, {
      lobbyId,
      setupPromptCount: 2,
      roundDurationSeconds: 45,
    });

    for (const [playerId, slotIndex, prompt] of [
      [hostPlayerId, 0, "A moon fox conducts a choir of glowing umbrellas."],
      [hostPlayerId, 1, "A velvet whale paints rainbows in a teacup storm."],
      [joined.playerId, 0, "A brass owl surfs across a pancake eclipse."],
      [
        joined.playerId,
        1,
        "A sapphire bear tends a garden of floating violins.",
      ],
    ] as const) {
      await seedFinalizedSetupSlot(t, {
        lobbyId,
        playerId,
        slotIndex,
        prompt,
      });
    }

    await host.client.mutation(api.feedItForward.startGame, { lobbyId });
    const started = await host.client.query(api.feedItForward.getGameState, {
      lobbyId,
    });
    const startedRound = requireValue(started.round, "started round");

    const pendingImageStorageId = await storeTestImage(t);
    const readyImageStorageId = await storeTestImage(t);

    await t.run(async (ctx) => {
      const session = await ctx.db
        .query("feedItForwardSessions")
        .withIndex("lobbyId", (query) => query.eq("lobbyId", lobbyId))
        .unique();
      const sessionRecord = requireValue(session, "session");
      const memberChain = await ctx.db
        .query("feedItForwardChains")
        .withIndex("sessionIdAndOwnerPlayerIdAndSlotIndex", (query) =>
          query
            .eq("sessionId", sessionRecord._id)
            .eq("ownerPlayerId", joined.playerId)
            .eq("slotIndex", 0),
        )
        .unique();
      const chainRecord = requireValue(memberChain, "member chain");
      const previousSourceKey = requireValue(
        chainRecord.currentSourceKey,
        "previous source key",
      );
      const previousStepNumber = requireValue(
        chainRecord.currentStepNumber,
        "previous step number",
      );

      await ctx.db.insert("feedItForwardSubmissions", {
        sessionId: sessionRecord._id,
        roundId: startedRound._id,
        lobbyId,
        roundNumber: 1,
        authorPlayerId: hostPlayerId,
        ownerPlayerId: joined.playerId,
        slotIndex: 0,
        sourceKey: `submission:${startedRound._id}:${hostPlayerId}`,
        previousSourceKey,
        originalSourceKey: chainRecord.originalSourceKey,
        previousStepNumber,
        prompt: "A pending prompt about moonlit umbrellas.",
        submittedAt: Date.now() - 1000,
        latestGenerationNonce: 1,
        generationStatus: "Generating",
        imageStorageId: pendingImageStorageId,
        imageMediaType: "image/png",
      });
    });

    await t.mutation(internal.feedItForwardInternal.handleRoundDeadline, {
      roundId: startedRound._id,
    });

    const waitingState = await host.client.query(
      api.feedItForward.getGameState,
      {
        lobbyId,
      },
    );
    expect(waitingState.waiting?.pendingImageCount).toBe(1);
    expect(waitingState.waiting?.remainingWaitSeconds).toBe(15);

    vi.advanceTimersByTime(15_000);
    vi.setSystemTime(Date.now());
    await t.mutation(internal.feedItForwardInternal.handleRoundWaitElapsed, {
      roundId: startedRound._id,
    });

    const stillWaiting = await host.client.query(
      api.feedItForward.getGameState,
      {
        lobbyId,
      },
    );
    expect(stillWaiting.session?.status).toBe("WaitingForImages");
    expect(stillWaiting.round?.roundNumber).toBe(1);

    await t.run(async (ctx) => {
      const submission = await ctx.db
        .query("feedItForwardSubmissions")
        .withIndex("roundId", (query) => query.eq("roundId", startedRound._id))
        .unique();

      expect(submission).toBeTruthy();
    });

    const pendingSubmissionId = await t.run(async (ctx) => {
      const submission = await ctx.db
        .query("feedItForwardSubmissions")
        .withIndex("roundId", (query) => query.eq("roundId", startedRound._id))
        .unique();
      return requireValue(submission, "pending submission")._id;
    });

    await t.mutation(internal.feedItForwardInternal.finalizeRoundSubmission, {
      submissionId: pendingSubmissionId,
      generationNonce: 1,
      promptEmbedding: Array.from({ length: 1536 }, (_, index) =>
        index % 5 === 0 ? 0.2 : 0,
      ),
      imageStorageId: readyImageStorageId,
      imageMediaType: "image/png",
      previousSimilarity: 0.5,
      originalSimilarity: 0.3,
      previousScore: 4,
      originalScore: 3,
    });

    const advanced = await host.client.query(api.feedItForward.getGameState, {
      lobbyId,
    });
    expect(advanced.session?.status).toBe("Playing");
    expect(advanced.round?.roundNumber).toBe(2);
  });

  it("does not delay final completion after the last round", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-19T12:00:00.000Z"));

    const t = createConvexTest();
    const {
      host,
      lobbyId,
      joinCode,
      playerId: hostPlayerId,
    } = await createFeedLobby(t);
    const member = await createViewer(t, { name: "Alice Example" });
    const joined = await member.client.mutation(api.lobbies.joinLobbyByCode, {
      joinCode,
    });

    await host.client.mutation(api.feedItForward.updateSettings, {
      lobbyId,
      setupPromptCount: 1,
      roundDurationSeconds: 45,
    });

    await seedFinalizedSetupSlot(t, {
      lobbyId,
      playerId: hostPlayerId,
      slotIndex: 0,
      prompt: "A moon fox conducts a choir of glowing umbrellas.",
    });
    await seedFinalizedSetupSlot(t, {
      lobbyId,
      playerId: joined.playerId,
      slotIndex: 0,
      prompt: "A brass owl surfs across a pancake eclipse.",
    });

    await host.client.mutation(api.feedItForward.startGame, { lobbyId });
    const started = await host.client.query(api.feedItForward.getGameState, {
      lobbyId,
    });
    const finalRound = requireValue(started.round, "final round");

    await t.mutation(internal.feedItForwardInternal.handleRoundDeadline, {
      roundId: finalRound._id,
    });

    const completed = await host.client.query(api.feedItForward.getGameState, {
      lobbyId,
    });
    expect(completed.session?.status).toBe("Completed");
    expect(completed.completion).toBeTruthy();
    expect(completed.waiting).toBeNull();
  });

  it("includes AI players in setup progress and session order", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-20T09:00:00.000Z"));

    const t = createConvexTest();
    const { host, lobbyId, playerId: hostPlayerId } = await createFeedLobby(t);
    const aiPlayer = await addAiPlayer(host.client, lobbyId, {
      displayName: "Bot Berry",
      personalityType: "complimenting",
    });

    await t.finishAllScheduledFunctions(() => {
      vi.runAllTimers();
      vi.setSystemTime(Date.now());
    });

    const setupState = await host.client.query(
      api.feedItForward.getSetupState,
      {
        lobbyId,
      },
    );
    const aiProgress = setupState.players.find(
      (player) => player.playerId === aiPlayer.playerId,
    );

    expect(setupState.settings.totalRounds).toBe(2);
    expect(aiProgress?.kind).toBe("ai");
    expect(aiProgress?.completedSlotCount).toBe(2);
    expect(aiProgress?.generatingSlotCount).toBe(0);

    await seedFinalizedSetupSlot(t, {
      lobbyId,
      playerId: hostPlayerId,
      slotIndex: 0,
      prompt: "Host seed 1",
    });
    await seedFinalizedSetupSlot(t, {
      lobbyId,
      playerId: hostPlayerId,
      slotIndex: 1,
      prompt: "Host seed 2",
    });

    await host.client.mutation(api.feedItForward.startGame, { lobbyId });

    const started = await host.client.query(api.feedItForward.getGameState, {
      lobbyId,
    });

    expect(started.session?.playerOrderIds).toContain(aiPlayer.playerId);
    expect(started.settings.totalRounds).toBe(2);
    expect(started.round?.roundNumber).toBe(1);
  });

  it("queues AI setup after switching to Feed It Forward and when increasing setup count", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-20T09:30:00.000Z"));

    const t = createConvexTest();
    const host = await createViewer(t, {
      name: "Host Person",
      hasPasswordAccount: true,
    });
    const created = await host.client.mutation(api.lobbies.createLobby, {});
    const aiPlayer = await addAiPlayer(host.client, created.lobbyId, {
      displayName: "Switch Bot",
    });

    await host.client.mutation(api.lobbies.selectGame, {
      lobbyId: created.lobbyId,
      game: FEED_IT_FORWARD_GAME_NAME,
    });

    await t.finishAllScheduledFunctions(() => {
      vi.runAllTimers();
      vi.setSystemTime(Date.now());
    });

    let setupState = await host.client.query(api.feedItForward.getSetupState, {
      lobbyId: created.lobbyId,
    });
    let aiProgress = setupState.players.find(
      (player) => player.playerId === aiPlayer.playerId,
    );

    expect(aiProgress?.completedSlotCount).toBe(2);

    await host.client.mutation(api.feedItForward.updateSettings, {
      lobbyId: created.lobbyId,
      setupPromptCount: 3,
      roundDurationSeconds: 45,
    });

    await t.finishAllScheduledFunctions(() => {
      vi.runAllTimers();
      vi.setSystemTime(Date.now());
    });

    setupState = await host.client.query(api.feedItForward.getSetupState, {
      lobbyId: created.lobbyId,
    });
    aiProgress = setupState.players.find(
      (player) => player.playerId === aiPlayer.playerId,
    );

    expect(aiProgress?.completedSlotCount).toBe(3);

    const aiSlots = await t.run(async (ctx) => {
      return await ctx.db
        .query("feedItForwardSetupSlots")
        .withIndex("lobbyId", (query) => query.eq("lobbyId", created.lobbyId))
        .filter((query) => query.eq(query.field("playerId"), aiPlayer.playerId))
        .collect();
    });

    expect(aiSlots).toHaveLength(3);
    expect(aiSlots.every((slot) => slot.finalizedAt !== undefined)).toBe(true);
  });

  it("auto-submits AI round prompts during play", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-20T10:00:00.000Z"));

    const t = createConvexTest();
    const { host, lobbyId, playerId: hostPlayerId } = await createFeedLobby(t);
    const aiPlayer = await addAiPlayer(host.client, lobbyId, {
      displayName: "Tone Bot",
      personalityType: "custom",
      customPrompt: "slightly dramatic but still clear",
    });

    await host.client.mutation(api.feedItForward.updateSettings, {
      lobbyId,
      setupPromptCount: 1,
      roundDurationSeconds: 45,
    });
    await seedFinalizedSetupSlot(t, {
      lobbyId,
      playerId: hostPlayerId,
      slotIndex: 0,
      prompt: "Host seed 1",
    });

    await t.finishAllScheduledFunctions(() => {
      vi.runAllTimers();
      vi.setSystemTime(Date.now());
    });

    await host.client.mutation(api.feedItForward.startGame, { lobbyId });

    vi.advanceTimersByTime(1_000);
    vi.setSystemTime(Date.now());
    await t.finishInProgressScheduledFunctions();
    await t.finishInProgressScheduledFunctions();

    const gameState = await host.client.query(api.feedItForward.getGameState, {
      lobbyId,
    });
    const aiProgress = gameState.round?.progress.find(
      (entry) => entry.playerId === aiPlayer.playerId,
    );

    expect(aiProgress?.state).toBe("Submitted");

    const aiSubmission = await t.run(async (ctx) => {
      const session = await ctx.db
        .query("feedItForwardSessions")
        .withIndex("lobbyId", (query) => query.eq("lobbyId", lobbyId))
        .first();

      if (session === null) {
        return null;
      }

      const round = await ctx.db
        .query("feedItForwardRounds")
        .withIndex("sessionIdAndRoundNumber", (query) =>
          query.eq("sessionId", session._id).eq("roundNumber", 1),
        )
        .unique();

      if (round === null) {
        return null;
      }

      return await ctx.db
        .query("feedItForwardSubmissions")
        .withIndex("roundIdAndAuthorPlayerId", (query) =>
          query
            .eq("roundId", round._id)
            .eq("authorPlayerId", aiPlayer.playerId),
        )
        .unique();
    });

    expect(aiSubmission?.prompt).toBeTruthy();
    expect(aiSubmission?.authorPlayerId).toBe(aiPlayer.playerId);
  });
});
