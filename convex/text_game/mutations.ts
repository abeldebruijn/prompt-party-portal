import { v } from "convex/values";

import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { mutation } from "../_generated/server";
import { shuffleArray } from "../game/random";
import { validateStarCount } from "../game/scoring";
import {
  DEFAULT_TEXT_GAME_ROUND_COUNT,
  sanitizeSummary,
  TEXT_GAME_NAME,
} from "../lib/lobby";
import { requireLobbyMembershipForViewer } from "../lobbies/helpers";
import {
  buildWinningSubmissions,
  clampRoundCount,
  computeLeaderboard,
  createRound,
  getActiveSession,
  getCurrentRound,
  listActiveHumanPlayers,
  listRoundSubmissions,
  moveRoundToPresent,
  requireTextGameHost,
  requireTextGameMembership,
  sanitizeAnswerInput,
} from "./helpers";

async function transitionGenerateToJudgeOrPresent(
  ctx: MutationCtx,
  lobbyId: Id<"lobbies">,
  forcePresentIfEmpty = false,
) {
  const session = await getActiveSession(ctx, lobbyId);

  if (session === null || session.status !== "InProgress") {
    return { state: "noop" as const };
  }

  const round = await getCurrentRound(
    ctx,
    session._id,
    session.currentRoundNumber,
  );

  if (round === null || round.stage !== "Generate") {
    return { state: "noop" as const };
  }

  const submissions = await listRoundSubmissions(ctx, round._id);
  const expectedSubmissionCount = Math.max(
    round.eligiblePlayerIds.length - 1,
    0,
  );
  const now = Date.now();

  if (submissions.length === 0 && forcePresentIfEmpty) {
    await moveRoundToPresent(ctx, round, now);
    return { state: "present" as const };
  }

  if (
    submissions.length < expectedSubmissionCount &&
    !(forcePresentIfEmpty && submissions.length > 0)
  ) {
    return { state: "pending" as const };
  }

  await ctx.db.patch(round._id, {
    stage: "Judge",
    stageStartedAt: now,
    presentEndsAt: undefined,
  });

  return { state: "judge" as const };
}

export const updateSettings = mutation({
  args: {
    lobbyId: v.id("lobbies"),
    roundCount: v.number(),
  },
  handler: async (ctx, args) => {
    const { lobby } = await requireTextGameHost(ctx, args.lobbyId);

    if (lobby.state !== "Creation") {
      throw new Error("Text-game settings can only change during lobby setup.");
    }

    const roundCount = clampRoundCount(args.roundCount);

    if (roundCount !== args.roundCount) {
      throw new Error("Round count must be an integer between 1 and 20.");
    }

    await ctx.db.patch(lobby._id, {
      textGameRoundCount: roundCount,
      lastActivityAt: Date.now(),
    });

    return {
      lobbyId: lobby._id,
      roundCount,
    };
  },
});

export const startGame = mutation({
  args: {
    lobbyId: v.id("lobbies"),
  },
  handler: async (ctx, args) => {
    const { lobby } = await requireTextGameHost(ctx, args.lobbyId);

    if (lobby.state !== "Creation") {
      throw new Error("Only lobbies in setup mode can start the text game.");
    }

    if (lobby.selectedGame !== TEXT_GAME_NAME) {
      throw new Error("This lobby is not using the text game.");
    }

    const [activePlayers, prompts] = await Promise.all([
      listActiveHumanPlayers(ctx, lobby._id),
      ctx.db
        .query("textGamePrompts")
        .withIndex("isActive", (query) => query.eq("isActive", true))
        .collect(),
    ]);

    if (activePlayers.length < 2) {
      throw new Error(
        "At least two active human players are required for the text game.",
      );
    }

    const roundCount = clampRoundCount(
      lobby.textGameRoundCount ?? DEFAULT_TEXT_GAME_ROUND_COUNT,
    );

    if (prompts.length < roundCount) {
      throw new Error("Not enough active text-game prompts are stored yet.");
    }

    const now = Date.now();
    const selectedPromptIds = shuffleArray(
      prompts.sort((left, right) => left.order - right.order),
      `${lobby._id}:${now}:text-game-prompts`,
    )
      .slice(0, roundCount)
      .map((prompt) => prompt._id);
    const sessionId = await ctx.db.insert("textGameSessions", {
      lobbyId: lobby._id,
      roundCount,
      promptIds: selectedPromptIds,
      currentRoundNumber: 1,
      status: "InProgress",
      startedAt: now,
    });
    const session = await ctx.db.get(sessionId);

    if (session === null) {
      throw new Error("The text game could not be started.");
    }

    await createRound(ctx, session, lobby._id, 1, now);
    await ctx.db.patch(lobby._id, {
      state: "Playing",
      currentRound: 1,
      startedAt: lobby.startedAt ?? now,
      completedAt: undefined,
      lastActivityAt: now,
      textGameRoundCount: roundCount,
    });

    return {
      lobbyId: lobby._id,
      sessionId,
      state: "Playing" as const,
      currentRound: 1,
    };
  },
});

export const submitAnswer = mutation({
  args: {
    lobbyId: v.id("lobbies"),
    answer: v.string(),
  },
  handler: async (ctx, args) => {
    const membership = await requireTextGameMembership(ctx, args.lobbyId);
    const session = await getActiveSession(ctx, args.lobbyId);

    if (session === null || session.status !== "InProgress") {
      throw new Error("The text game is not currently running.");
    }

    const round = await getCurrentRound(
      ctx,
      session._id,
      session.currentRoundNumber,
    );

    if (round === null || round.stage !== "Generate") {
      throw new Error("Answers can only be submitted during Generate.");
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
      .query("textGameSubmissions")
      .withIndex("roundIdAndAuthorPlayerId", (query) =>
        query
          .eq("roundId", round._id)
          .eq("authorPlayerId", membership.player._id),
      )
      .unique();

    if (existingSubmission !== null) {
      throw new Error("You have already submitted an answer for this round.");
    }

    await ctx.db.insert("textGameSubmissions", {
      roundId: round._id,
      authorPlayerId: membership.player._id,
      answer: sanitizeAnswerInput(args.answer),
      submittedAt: Date.now(),
    });

    await transitionGenerateToJudgeOrPresent(ctx, args.lobbyId);

    return {
      lobbyId: args.lobbyId,
      roundId: round._id,
    };
  },
});

export const pokePlayer = mutation({
  args: {
    lobbyId: v.id("lobbies"),
    playerId: v.id("lobbyPlayers"),
  },
  handler: async (ctx, args) => {
    const membership = await requireTextGameMembership(ctx, args.lobbyId);
    const session = await getActiveSession(ctx, args.lobbyId);

    if (session === null || session.status !== "InProgress") {
      throw new Error("The text game is not currently running.");
    }

    const round = await getCurrentRound(
      ctx,
      session._id,
      session.currentRoundNumber,
    );

    if (round === null || round.stage !== "Generate") {
      throw new Error("Players can only be poked during Generate.");
    }

    if (membership.player._id === args.playerId) {
      throw new Error("You cannot poke yourself.");
    }

    const targetPlayer = await ctx.db.get(args.playerId);

    if (
      targetPlayer === null ||
      targetPlayer.lobbyId !== args.lobbyId ||
      !targetPlayer.isActive ||
      targetPlayer.kind !== "human"
    ) {
      throw new Error("Only pending players can be poked.");
    }

    if (
      !round.eligiblePlayerIds.includes(targetPlayer._id) ||
      targetPlayer._id === round.targetPlayerId
    ) {
      throw new Error("Only pending players can be poked.");
    }

    const existingSubmission = await ctx.db
      .query("textGameSubmissions")
      .withIndex("roundIdAndAuthorPlayerId", (query) =>
        query.eq("roundId", round._id).eq("authorPlayerId", targetPlayer._id),
      )
      .unique();

    if (existingSubmission !== null) {
      throw new Error("Only pending players can be poked.");
    }

    const now = Date.now();
    const pokeId = await ctx.db.insert("playerPokes", {
      lobbyId: args.lobbyId,
      targetPlayerId: targetPlayer._id,
      pokedByPlayerId: membership.player._id,
      textRoundId: round._id,
      createdAt: now,
    });

    await ctx.db.patch(membership.lobby._id, { lastActivityAt: now });

    return {
      lobbyId: args.lobbyId,
      pokeId,
      playerId: targetPlayer._id,
    };
  },
});

export const advanceToJudge = mutation({
  args: {
    lobbyId: v.id("lobbies"),
  },
  handler: async (ctx, args) => {
    await requireTextGameHost(ctx, args.lobbyId);

    const result = await transitionGenerateToJudgeOrPresent(
      ctx,
      args.lobbyId,
      true,
    );

    return {
      lobbyId: args.lobbyId,
      transition: result.state,
    };
  },
});

export const rateSubmission = mutation({
  args: {
    lobbyId: v.id("lobbies"),
    submissionId: v.id("textGameSubmissions"),
    correctnessStars: v.optional(v.number()),
    creativityStars: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const membership = await requireTextGameMembership(ctx, args.lobbyId);
    const session = await getActiveSession(ctx, args.lobbyId);

    if (session === null || session.status !== "InProgress") {
      throw new Error("The text game is not currently running.");
    }

    const round = await getCurrentRound(
      ctx,
      session._id,
      session.currentRoundNumber,
    );

    if (round === null || round.stage !== "Judge") {
      throw new Error("Submissions can only be rated during Judge.");
    }

    if (membership.player._id !== round.targetPlayerId) {
      throw new Error("Only the selected player can rate this round.");
    }

    if (
      args.correctnessStars === undefined &&
      args.creativityStars === undefined
    ) {
      throw new Error("At least one star rating must be provided.");
    }

    if (
      (args.correctnessStars !== undefined &&
        !validateStarCount(args.correctnessStars)) ||
      (args.creativityStars !== undefined &&
        !validateStarCount(args.creativityStars))
    ) {
      throw new Error("Stars must be integers between 0 and 5.");
    }

    const submission = await ctx.db.get(args.submissionId);

    if (submission === null || submission.roundId !== round._id) {
      throw new Error("That submission does not belong to the current round.");
    }

    const now = Date.now();

    const nextCorrectnessStars =
      args.correctnessStars ?? submission.correctnessStars;
    const nextCreativityStars =
      args.creativityStars ?? submission.creativityStars;

    const patch: Partial<{
      correctnessStars: number;
      creativityStars: number;
      totalScore: number;
      judgedAt: number;
    }> = {};

    if (args.correctnessStars !== undefined) {
      patch.correctnessStars = args.correctnessStars;
    }

    if (args.creativityStars !== undefined) {
      patch.creativityStars = args.creativityStars;
    }

    if (
      nextCorrectnessStars !== undefined &&
      nextCreativityStars !== undefined
    ) {
      patch.totalScore = nextCorrectnessStars + nextCreativityStars;
      patch.judgedAt = now;
    }

    await ctx.db.patch(submission._id, patch);

    return {
      lobbyId: args.lobbyId,
      submissionId: submission._id,
      stage: "Judge" as const,
      isComplete:
        nextCorrectnessStars !== undefined && nextCreativityStars !== undefined,
    };
  },
});

export const advanceToPresent = mutation({
  args: {
    lobbyId: v.id("lobbies"),
  },
  handler: async (ctx, args) => {
    const membership = await requireTextGameMembership(ctx, args.lobbyId);
    const session = await getActiveSession(ctx, args.lobbyId);

    if (session === null || session.status !== "InProgress") {
      throw new Error("The text game is not currently running.");
    }

    const round = await getCurrentRound(
      ctx,
      session._id,
      session.currentRoundNumber,
    );

    if (round === null) {
      throw new Error("The current text-game round could not be found.");
    }

    if (round.stage === "Present") {
      return { lobbyId: args.lobbyId, stage: "Present" as const };
    }

    if (round.stage !== "Judge") {
      throw new Error("Rounds can only advance to results during Judge.");
    }

    if (membership.player._id !== round.targetPlayerId) {
      throw new Error("Only the selected player can advance this round.");
    }

    const submissions = await listRoundSubmissions(ctx, round._id);
    const allRated = submissions.every(
      (submission) =>
        submission.correctnessStars !== undefined &&
        submission.creativityStars !== undefined,
    );

    if (!allRated) {
      throw new Error("Please rate all submissions before continuing.");
    }

    const now = Date.now();
    await moveRoundToPresent(ctx, round, now);

    return { lobbyId: args.lobbyId, stage: "Present" as const };
  },
});

export const skipToPresent = mutation({
  args: {
    lobbyId: v.id("lobbies"),
  },
  handler: async (ctx, args) => {
    await requireTextGameHost(ctx, args.lobbyId);
    const session = await getActiveSession(ctx, args.lobbyId);

    if (session === null || session.status !== "InProgress") {
      throw new Error("The text game is not currently running.");
    }

    const round = await getCurrentRound(
      ctx,
      session._id,
      session.currentRoundNumber,
    );

    if (round === null) {
      throw new Error("The current text-game round could not be found.");
    }

    if (round.stage === "Present") {
      return { lobbyId: args.lobbyId, stage: "Present" as const };
    }

    if (round.stage !== "Judge") {
      throw new Error("Rounds can only advance to results during Judge.");
    }

    const now = Date.now();
    await moveRoundToPresent(ctx, round, now);

    return { lobbyId: args.lobbyId, stage: "Present" as const };
  },
});

export const advanceAfterPresent = mutation({
  args: {
    lobbyId: v.id("lobbies"),
  },
  handler: async (ctx, args) => {
    const membership = await requireLobbyMembershipForViewer(ctx, args.lobbyId);
    const session = await getActiveSession(ctx, args.lobbyId);

    if (membership.lobby.selectedGame !== TEXT_GAME_NAME) {
      throw new Error("This lobby is not using the text game.");
    }

    if (session === null) {
      return { lobbyId: args.lobbyId, state: membership.lobby.state };
    }

    if (session.status === "Completed") {
      return { lobbyId: args.lobbyId, state: "Completion" as const };
    }

    const round = await getCurrentRound(
      ctx,
      session._id,
      session.currentRoundNumber,
    );

    if (round === null || round.stage !== "Present") {
      return { lobbyId: args.lobbyId, state: membership.lobby.state };
    }

    if ((round.presentEndsAt ?? 0) > Date.now()) {
      return { lobbyId: args.lobbyId, state: membership.lobby.state };
    }

    const nextRoundNumber = session.currentRoundNumber + 1;

    if (nextRoundNumber <= session.roundCount) {
      const now = Date.now();
      await ctx.db.patch(session._id, {
        currentRoundNumber: nextRoundNumber,
      });
      await createRound(ctx, session, args.lobbyId, nextRoundNumber, now);
      await ctx.db.patch(membership.lobby._id, {
        currentRound: nextRoundNumber,
        lastActivityAt: now,
      });

      return {
        lobbyId: args.lobbyId,
        state: "Playing" as const,
        currentRound: nextRoundNumber,
      };
    }

    const leaderboard = await computeLeaderboard(ctx, session._id);
    const now = Date.now();
    const winningSubmissions = await buildWinningSubmissions(ctx, round);

    await ctx.db.insert("lobbyCompletions", {
      lobbyId: membership.lobby._id,
      completedByUserId: membership.lobby.hostUserId,
      selectedGame: membership.lobby.selectedGame,
      completedAt: now,
      summary:
        winningSubmissions.length > 0
          ? sanitizeSummary("Text game complete. Final leaderboard is ready.")
          : sanitizeSummary(
              "Text game complete. No winning submissions were scored.",
            ),
      leaderboard: leaderboard.map((entry) => ({
        playerId: entry.playerId,
        displayName: entry.displayName,
        rank: entry.rank,
        score: entry.score,
      })),
    });

    await ctx.db.patch(session._id, {
      status: "Completed",
      completedAt: now,
    });
    await ctx.db.patch(membership.lobby._id, {
      state: "Completion",
      completedAt: now,
      lastActivityAt: now,
    });

    return {
      lobbyId: args.lobbyId,
      state: "Completion" as const,
    };
  },
});
