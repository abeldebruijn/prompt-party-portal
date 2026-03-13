import { v } from "convex/values";

import type { Id } from "../_generated/dataModel";
import { query } from "../_generated/server";
import {
  buildWinningSubmissions,
  computeLeaderboard,
  getActiveSession,
  getCurrentRound,
  listAllActivePlayers,
  listLatestRoundPokes,
  listRoundSubmissions,
  requireImageGameMembership,
} from "./helpers";

async function getSubmissionUrl(
  ctx: { storage: { getUrl: (id: Id<"_storage">) => Promise<string | null> } },
  storageId: Id<"_storage">,
) {
  return await ctx.storage.getUrl(storageId);
}

export const getGameState = query({
  args: {
    lobbyId: v.id("lobbies"),
  },
  handler: async (ctx, args) => {
    const membership = await requireImageGameMembership(ctx, args.lobbyId);
    const [session, activePlayers] = await Promise.all([
      getActiveSession(ctx, args.lobbyId),
      listAllActivePlayers(ctx, args.lobbyId),
    ]);

    if (session === null) {
      return {
        lobby: membership.lobby,
        viewer: {
          playerId: membership.player._id,
          isHost: membership.player.isHost,
        },
        settings: {
          roundCount: membership.lobby.textGameRoundCount,
        },
        session: null,
        round: null,
        completion: null,
        leaderboard: [],
      };
    }

    const round = await getCurrentRound(
      ctx,
      session._id,
      session.currentRoundNumber,
    );

    if (round === null) {
      throw new Error("The current image-game round could not be found.");
    }

    const submissions = await listRoundSubmissions(ctx, round._id);
    const leaderboard = await computeLeaderboard(ctx, session._id);
    const winners =
      round.stage === "Present" || session.status === "Completed"
        ? await buildWinningSubmissions(ctx, round)
        : [];
    const winnerUrls = await Promise.all(
      winners.map((winner) => getSubmissionUrl(ctx, winner.imageStorageId)),
    );
    const eligibleSet = new Set(round.eligiblePlayerIds);
    const targetPlayer = activePlayers.find(
      (player) => player._id === round.targetPlayerId,
    );
    const playerDisplayNames = new Map(
      activePlayers.map((player) => [player._id, player.displayName]),
    );
    const submittedSet = new Set(
      submissions.map((submission) => submission.authorPlayerId),
    );
    const latestPokeByTargetId = await listLatestRoundPokes(
      ctx,
      args.lobbyId,
      round._id,
      playerDisplayNames,
    );
    const viewerSubmission =
      submissions.find(
        (submission) => submission.authorPlayerId === membership.player._id,
      ) ?? null;
    const viewerSubmissionUrl =
      viewerSubmission !== null
        ? await getSubmissionUrl(ctx, viewerSubmission.imageStorageId)
        : null;
    const judgeSubmissions =
      round.stage === "Judge" && membership.player._id === round.targetPlayerId
        ? await Promise.all(
            submissions
              .sort((left, right) => left.submittedAt - right.submittedAt)
              .map(async (submission) => ({
                submissionId: submission._id,
                prompt: submission.prompt,
                imageUrl: await getSubmissionUrl(
                  ctx,
                  submission.imageStorageId,
                ),
                correctnessStars: submission.correctnessStars ?? null,
                creativityStars: submission.creativityStars ?? null,
              })),
          )
        : [];
    const progress = activePlayers.map((player) => {
      if (player.kind === "ai") {
        return {
          playerId: player._id,
          displayName: player.displayName,
          state: "AiExcluded" as const,
          lastPoke: null,
        };
      }

      if (!eligibleSet.has(player._id)) {
        return {
          playerId: player._id,
          displayName: player.displayName,
          state: "Spectating" as const,
          lastPoke: null,
        };
      }

      if (player._id === round.targetPlayerId) {
        return {
          playerId: player._id,
          displayName: player.displayName,
          state: "Target" as const,
          lastPoke: null,
        };
      }

      return {
        playerId: player._id,
        displayName: player.displayName,
        state: submittedSet.has(player._id)
          ? ("Submitted" as const)
          : ("Pending" as const),
        lastPoke: submittedSet.has(player._id)
          ? null
          : (latestPokeByTargetId.get(player._id) ?? null),
      };
    });

    return {
      lobby: membership.lobby,
      viewer: {
        playerId: membership.player._id,
        isHost: membership.player.isHost,
        role:
          membership.player._id === round.targetPlayerId
            ? ("Judge" as const)
            : eligibleSet.has(membership.player._id)
              ? ("Participant" as const)
              : ("Spectator" as const),
      },
      settings: {
        roundCount: session.roundCount,
      },
      session: {
        _id: session._id,
        roundCount: session.roundCount,
        currentRoundNumber: session.currentRoundNumber,
        status: session.status,
      },
      round: {
        _id: round._id,
        roundNumber: round.roundNumber,
        stage: round.stage,
        promptText: round.promptText,
        stageStartedAt: round.stageStartedAt,
        presentEndsAt: round.presentEndsAt ?? null,
        targetPlayer: targetPlayer
          ? {
              playerId: targetPlayer._id,
              displayName: targetPlayer.displayName,
            }
          : null,
        submissionCount: submissions.length,
        expectedSubmissionCount: Math.max(
          round.eligiblePlayerIds.length - 1,
          0,
        ),
        viewerSubmission: viewerSubmission
          ? {
              submissionId: viewerSubmission._id,
              prompt: viewerSubmission.prompt,
              imageUrl: viewerSubmissionUrl,
              totalScore: viewerSubmission.totalScore ?? null,
            }
          : null,
        judgeSubmissions,
        winners: winners.map((winner, index) => ({
          submissionId: winner.submissionId,
          prompt: winner.prompt,
          imageUrl: winnerUrls[index] ?? null,
          totalScore: winner.totalScore,
          correctnessStars: winner.correctnessStars,
          creativityStars: winner.creativityStars,
          authorDisplayName: winner.authorDisplayName,
        })),
        progress,
      },
      completion:
        membership.lobby.state === "Completion"
          ? {
              leaderboard,
            }
          : null,
      leaderboard,
    };
  },
});

export const getPreviewImageUrl = query({
  args: {
    lobbyId: v.id("lobbies"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    await requireImageGameMembership(ctx, args.lobbyId);
    return await getSubmissionUrl(ctx, args.storageId);
  },
});
