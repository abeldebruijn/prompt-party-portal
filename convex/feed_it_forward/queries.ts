import { v } from "convex/values";
import { query } from "../_generated/server";
import {
  clampRoundDurationSeconds,
  clampSetupPromptCount,
  computeLeaderboard,
  deriveRoundAssignment,
  deriveTotalRoundCount,
  getActiveSession,
  getChain,
  getCurrentRound,
  listAllActivePlayers,
  listChainSteps,
  listLatestRoundPokes,
  listRoundSubmissions,
  listSetupSlots,
  requireFeedItForwardMembership,
} from "./helpers";

export const getSetupState = query({
  args: {
    lobbyId: v.id("lobbies"),
  },
  handler: async (ctx, args) => {
    const membership = await requireFeedItForwardMembership(ctx, args.lobbyId);
    const [players, setupSlots] = await Promise.all([
      listAllActivePlayers(ctx, args.lobbyId),
      listSetupSlots(ctx, args.lobbyId),
    ]);
    const setupPromptCount = clampSetupPromptCount(
      membership.lobby.feedItForwardSetupPromptCount,
    );
    const roundDurationSeconds = clampRoundDurationSeconds(
      membership.lobby.feedItForwardRoundDurationSeconds,
    );
    const activeHumanPlayers = players.filter(
      (player) => player.kind === "human",
    );
    const totalRounds = deriveTotalRoundCount(
      activeHumanPlayers.length,
      setupPromptCount,
    );

    return {
      lobby: membership.lobby,
      viewer: {
        playerId: membership.player._id,
        isHost: membership.player.isHost,
      },
      settings: {
        setupPromptCount,
        roundDurationSeconds,
        totalRounds,
      },
      players: activeHumanPlayers.map((player) => ({
        playerId: player._id,
        displayName: player.displayName,
        completedSlotCount: setupSlots.filter(
          (slot) =>
            slot.playerId === player._id && slot.finalizedAt !== undefined,
        ).length,
      })),
      viewerSlots: await Promise.all(
        Array.from({ length: setupPromptCount }, async (_, slotIndex) => {
          const slot =
            setupSlots.find(
              (entry) =>
                entry.playerId === membership.player._id &&
                entry.slotIndex === slotIndex,
            ) ?? null;
          return {
            slotIndex,
            status: slot?.status ?? "Empty",
            prompt: slot?.prompt ?? "",
            imageStorageId: slot?.imageStorageId ?? null,
            imageUrl:
              slot?.imageStorageId !== undefined
                ? await ctx.storage.getUrl(slot.imageStorageId)
                : null,
            finalizedAt: slot?.finalizedAt ?? null,
          };
        }),
      ),
    };
  },
});

export const getGameState = query({
  args: {
    lobbyId: v.id("lobbies"),
  },
  handler: async (ctx, args) => {
    const membership = await requireFeedItForwardMembership(ctx, args.lobbyId);
    const [session, activePlayers, setupSlots] = await Promise.all([
      getActiveSession(ctx, args.lobbyId),
      listAllActivePlayers(ctx, args.lobbyId),
      listSetupSlots(ctx, args.lobbyId),
    ]);
    const setupPromptCount = clampSetupPromptCount(
      membership.lobby.feedItForwardSetupPromptCount,
    );
    const roundDurationSeconds = clampRoundDurationSeconds(
      membership.lobby.feedItForwardRoundDurationSeconds,
    );

    if (session === null) {
      return {
        lobby: membership.lobby,
        viewer: {
          playerId: membership.player._id,
          isHost: membership.player.isHost,
          role: "Participant" as const,
        },
        settings: {
          setupPromptCount,
          roundDurationSeconds,
          totalRounds: deriveTotalRoundCount(
            activePlayers.filter((player) => player.kind === "human").length,
            setupPromptCount,
          ),
        },
        session: null,
        round: null,
        leaderboard: [],
        completion: null,
        waiting: null,
      };
    }

    const leaderboard = await computeLeaderboard(
      ctx,
      session._id,
      session.playerOrderIds,
    );
    const playerDisplayNames = new Map(
      activePlayers.map((player) => [player._id, player.displayName]),
    );

    if (membership.lobby.state === "Completion") {
      const chainGallery = (
        await Promise.all(
          session.playerOrderIds.flatMap((ownerPlayerId) =>
            Array.from({ length: session.setupPromptCount }, (_, slotIndex) =>
              listChainSteps(ctx, session._id, ownerPlayerId, slotIndex),
            ),
          ),
        )
      )
        .filter((steps) => steps.length > 0)
        .map(async (steps) => ({
          ownerPlayerId: steps[0].ownerPlayerId,
          ownerDisplayName:
            playerDisplayNames.get(steps[0].ownerPlayerId) ?? "Unknown player",
          slotIndex: steps[0].slotIndex,
          steps: await Promise.all(
            steps.map(async (step) => ({
              sourceKey: step.sourceKey,
              stepNumber: step.stepNumber,
              prompt: step.prompt,
              authorPlayerId: step.authorPlayerId,
              authorDisplayName:
                playerDisplayNames.get(step.authorPlayerId) ?? "Unknown player",
              imageUrl: await ctx.storage.getUrl(step.imageStorageId),
            })),
          ),
        }));

      return {
        lobby: membership.lobby,
        viewer: {
          playerId: membership.player._id,
          isHost: membership.player.isHost,
          role: session.playerOrderIds.includes(membership.player._id)
            ? ("Participant" as const)
            : ("Spectator" as const),
        },
        settings: {
          setupPromptCount: session.setupPromptCount,
          roundDurationSeconds: session.roundDurationSeconds,
          totalRounds: session.totalRounds,
        },
        session,
        round: null,
        leaderboard,
        waiting: null,
        completion: {
          chainGallery: await Promise.all(chainGallery),
        },
      };
    }

    const round =
      session.currentRoundNumber > 0
        ? await getCurrentRound(ctx, session._id, session.currentRoundNumber)
        : null;

    const viewerIsParticipant = session.playerOrderIds.includes(
      membership.player._id,
    );
    const assignment =
      viewerIsParticipant && round
        ? deriveRoundAssignment(
            session.playerOrderIds,
            round.roundNumber,
            membership.player._id,
          )
        : null;
    const chain =
      assignment && round
        ? await getChain(
            ctx,
            session._id,
            assignment.ownerPlayerId,
            assignment.slotIndex,
          )
        : null;
    const currentSourceKey = chain?.currentSourceKey;
    const sourceStep =
      currentSourceKey !== undefined
        ? await ctx.db
            .query("feedItForwardChainSteps")
            .withIndex("sourceKey", (query) =>
              query.eq("sourceKey", currentSourceKey),
            )
            .unique()
        : null;
    const sourceImageUrl =
      sourceStep?.imageStorageId !== undefined
        ? await ctx.storage.getUrl(sourceStep.imageStorageId)
        : null;
    const submissions = round ? await listRoundSubmissions(ctx, round._id) : [];
    const latestPokeByTargetId =
      round === null
        ? new Map()
        : await listLatestRoundPokes(
            ctx,
            args.lobbyId,
            round.roundNumber,
            playerDisplayNames,
          );
    const viewerSubmission =
      round === null
        ? null
        : (submissions.find(
            (submission) => submission.authorPlayerId === membership.player._id,
          ) ?? null);
    const progress =
      round === null
        ? []
        : session.playerOrderIds.map((playerId) => {
            const player = activePlayers.find(
              (entry) => entry._id === playerId,
            );
            const submitted = submissions.find(
              (submission) => submission.authorPlayerId === playerId,
            );

            return {
              playerId,
              displayName: player?.displayName ?? "Unknown player",
              state:
                submitted !== undefined
                  ? ("Submitted" as const)
                  : ("Pending" as const),
              lastPoke:
                submitted !== undefined
                  ? null
                  : (latestPokeByTargetId.get(playerId) ?? null),
            };
          });
    const pendingImageCount =
      round === null
        ? setupSlots.filter((slot) => slot.status === "Generating").length
        : submissions.filter(
            (submission) =>
              submission.lockedAt !== undefined &&
              submission.generationStatus === "Generating",
          ).length;

    return {
      lobby: membership.lobby,
      viewer: {
        playerId: membership.player._id,
        isHost: membership.player.isHost,
        role: viewerIsParticipant
          ? ("Participant" as const)
          : ("Spectator" as const),
      },
      settings: {
        setupPromptCount: session.setupPromptCount,
        roundDurationSeconds: session.roundDurationSeconds,
        totalRounds: session.totalRounds,
      },
      session,
      round:
        round === null
          ? null
          : {
              _id: round._id,
              roundNumber: round.roundNumber,
              slotIndex: round.slotIndex,
              hopNumber: round.hopNumber,
              status: round.status,
              startedAt: round.startedAt,
              endsAt: round.endsAt,
              sourceImageUrl,
              sourcePrompt: sourceStep?.prompt ?? null,
              sourceOwnerDisplayName:
                assignment?.ownerPlayerId !== undefined
                  ? (playerDisplayNames.get(assignment.ownerPlayerId) ?? null)
                  : null,
              viewerSubmission:
                viewerSubmission === null
                  ? null
                  : {
                      submissionId: viewerSubmission._id,
                      prompt: viewerSubmission.prompt,
                      generationStatus: viewerSubmission.generationStatus,
                      previousScore: viewerSubmission.previousScore ?? null,
                      originalScore: viewerSubmission.originalScore ?? null,
                      totalScore: viewerSubmission.totalScore ?? null,
                    },
              progress,
            },
      waiting:
        session.status === "WaitingForSetup" ||
        session.status === "WaitingForImages"
          ? {
              pendingImageCount,
            }
          : null,
      leaderboard,
      completion: null,
    };
  },
});
