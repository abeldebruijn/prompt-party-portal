"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Loader2Icon, UsersIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { LobbyTextarea } from "@/app/lobby/_components/lobby-ui";
import { SubmissionProgressList } from "@/components/game/submission-progress-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SurfaceCard, SurfaceCardTitle } from "@/components/ui/surface-card";
import { api, type Id } from "@/lib/convex";

type Snapshot = FunctionReturnType<typeof api.feedItForward.getGameState>;
type ChainGalleryEntry = NonNullable<
  Snapshot["completion"]
>["chainGallery"][number];
type ChainGalleryStep = ChainGalleryEntry["steps"][number];
type LeaderboardEntry = Snapshot["leaderboard"][number];

function Loading() {
  return (
    <main className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-5xl items-center px-4 py-10 sm:px-6 lg:px-8">
      <SurfaceCard className="w-full text-center">
        <Loader2Icon className="mx-auto size-6 animate-spin text-primary" />
        <SurfaceCardTitle className="mt-5 text-3xl">
          Syncing Feed It Forward...
        </SurfaceCardTitle>
      </SurfaceCard>
    </main>
  );
}

export default function FeedItForwardGamePage() {
  const params = useParams<{ lobbyId: string }>();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const lobbyId = params.lobbyId as Id<"lobbies">;
  const snapshot = useQuery(
    api.feedItForward.getGameState,
    isAuthenticated ? { lobbyId } : "skip",
  );
  const submitPrompt = useMutation(api.feedItForward.submitPrompt);
  const pokePlayer = useMutation(api.lobbies.pokePlayer);
  const resetLobby = useMutation(api.lobbies.resetLobby);

  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [promptDraft, setPromptDraft] = useState("");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (snapshot?.round?.viewerSubmission?.prompt) {
      setPromptDraft(snapshot.round.viewerSubmission.prompt);
    }
  }, [snapshot?.round?.viewerSubmission?.prompt]);

  async function runAction(actionKey: string, operation: () => Promise<void>) {
    setPendingAction(actionKey);
    setActionError(null);

    try {
      await operation();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "That Feed It Forward action could not be completed.",
      );
    } finally {
      setPendingAction(null);
    }
  }

  if (isLoading || (isAuthenticated && snapshot === undefined)) {
    return <Loading />;
  }

  if (!isAuthenticated || !snapshot) {
    return <Loading />;
  }

  const countdownSeconds =
    snapshot.round === null
      ? 0
      : Math.max(0, Math.ceil((snapshot.round.endsAt - now) / 1000));
  const waitingCountdownSeconds =
    snapshot.waiting?.waitEndsAt === null ||
    snapshot.waiting?.waitEndsAt === undefined
      ? (snapshot.waiting?.remainingWaitSeconds ?? 0)
      : Math.max(0, Math.ceil((snapshot.waiting.waitEndsAt - now) / 1000));

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-10 sm:px-6 lg:px-8">
      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <SurfaceCard>
            <Badge className="rounded-full border border-foreground/15 bg-background/75 px-3 py-1 font-mono text-[0.7rem] uppercase tracking-[0.24em] text-foreground/70 hover:bg-background/75">
              Feed It Forward
            </Badge>
            <SurfaceCardTitle className="mt-5 text-4xl sm:text-5xl">
              {snapshot.completion
                ? "Final chain gallery"
                : snapshot.waiting
                  ? "Waiting for images"
                  : `Round ${snapshot.round?.roundNumber ?? 0} of ${snapshot.settings.totalRounds}`}
            </SurfaceCardTitle>
            {actionError ? (
              <p className="mt-4 text-sm text-destructive">{actionError}</p>
            ) : null}
          </SurfaceCard>

          {snapshot.round ? (
            <SurfaceCard>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-foreground/70">
                    Describe the image as precisely as possible.
                  </p>
                  <p className="mt-1 font-mono text-3xl">{countdownSeconds}s</p>
                </div>
                <div className="text-right text-sm text-foreground/65">
                  <p>Seed owner</p>
                  <p className="font-medium text-foreground">
                    {snapshot.round.sourceOwnerDisplayName ?? "Unknown"}
                  </p>
                </div>
              </div>

              {snapshot.round.sourceImageUrl ? (
                <div className="mt-6 overflow-hidden rounded-3xl border border-foreground/10">
                  <Image
                    alt="Round source"
                    className="aspect-square w-full object-cover"
                    height={720}
                    src={snapshot.round.sourceImageUrl}
                    width={720}
                  />
                </div>
              ) : null}

              {snapshot.viewer.role === "Participant" &&
              snapshot.round.status === "Playing" &&
              !snapshot.waiting ? (
                <form
                  className="mt-6 space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void runAction("submit", async () => {
                      await submitPrompt({
                        lobbyId,
                        prompt: promptDraft,
                      });
                    });
                  }}
                >
                  <LobbyTextarea
                    onChange={(event) => setPromptDraft(event.target.value)}
                    placeholder="Describe what you see in as much detail as possible."
                    value={promptDraft}
                  />
                  <Button
                    className="rounded-full px-6"
                    disabled={pendingAction === "submit"}
                  >
                    {pendingAction === "submit" ? (
                      <>
                        <Loader2Icon className="size-4 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      "Submit or replace prompt"
                    )}
                  </Button>
                </form>
              ) : null}

              {snapshot.round.viewerSubmission ? (
                <div className="mt-6 rounded-3xl border border-foreground/10 bg-background/70 p-4 text-sm">
                  <p className="font-medium text-foreground">
                    Your latest prompt
                  </p>
                  <p className="mt-2 text-foreground/80">
                    {snapshot.round.viewerSubmission.prompt}
                  </p>
                  {snapshot.round.viewerSubmission.totalScore !== null ? (
                    <div className="mt-3 flex flex-wrap gap-3 text-foreground/70">
                      <span>
                        Prev: {snapshot.round.viewerSubmission.previousScore}
                      </span>
                      <span>
                        Original:{" "}
                        {snapshot.round.viewerSubmission.originalScore}
                      </span>
                      <span>
                        Total: {snapshot.round.viewerSubmission.totalScore}
                      </span>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </SurfaceCard>
          ) : null}

          {snapshot.waiting ? (
            <SurfaceCard>
              <SurfaceCardTitle className="text-2xl">
                Waiting for the next image batch
              </SurfaceCardTitle>
              {snapshot.waiting.pendingImageCount > 0 ? (
                <p className="mt-4 text-base leading-7 text-foreground/80">
                  {snapshot.waiting.pendingImageCount} images are still being
                  generated for the next round.
                </p>
              ) : (
                <p className="mt-4 text-base leading-7 text-foreground/80">
                  All images are ready. The next round starts shortly.
                </p>
              )}
              <p className="mt-3 font-mono text-3xl text-foreground">
                {waitingCountdownSeconds}s
              </p>
              <p className="mt-2 text-sm text-foreground/65">
                Next round starts in {waitingCountdownSeconds}s
              </p>
            </SurfaceCard>
          ) : null}

          {snapshot.completion ? (
            <SurfaceCard>
              <SurfaceCardTitle className="text-2xl">
                Chain gallery
              </SurfaceCardTitle>
              <div className="mt-6 space-y-6">
                {snapshot.completion.chainGallery.map(
                  (chain: ChainGalleryEntry) => (
                    <div
                      key={`${chain.ownerPlayerId}-${chain.slotIndex}`}
                      className="rounded-3xl border border-foreground/10 bg-background/70 p-4"
                    >
                      <p className="font-medium text-foreground">
                        {chain.ownerDisplayName} · seed #{chain.slotIndex + 1}
                      </p>
                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        {chain.steps.map((step: ChainGalleryStep) => (
                          <div
                            key={step.sourceKey}
                            className="overflow-hidden rounded-3xl border border-foreground/10"
                          >
                            {step.imageUrl ? (
                              <Image
                                alt={step.prompt}
                                className="aspect-square w-full object-cover"
                                height={320}
                                src={step.imageUrl}
                                width={320}
                              />
                            ) : null}
                            <div className="p-4 text-sm">
                              <p className="font-mono text-xs uppercase tracking-[0.18em] text-foreground/60">
                                Step {step.stepNumber}
                              </p>
                              <p className="mt-2 text-foreground/85">
                                {step.prompt}
                              </p>
                              <p className="mt-2 text-foreground/60">
                                by {step.authorDisplayName}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ),
                )}
              </div>
              {snapshot.viewer.isHost ? (
                <Button
                  className="mt-6 rounded-full px-6"
                  disabled={pendingAction === "reset"}
                  onClick={() =>
                    void runAction("reset", async () => {
                      await resetLobby({ lobbyId });
                    })
                  }
                >
                  Reset lobby
                </Button>
              ) : null}
            </SurfaceCard>
          ) : null}
        </div>

        <div className="space-y-6 xl:sticky xl:top-16">
          <SurfaceCard>
            <SurfaceCardTitle className="text-2xl">
              <UsersIcon className="size-5 text-primary" />
              Leaderboard
            </SurfaceCardTitle>
            <div className="mt-6 space-y-3">
              {snapshot.leaderboard.map((entry: LeaderboardEntry) => (
                <div
                  key={entry.playerId}
                  className="flex items-center justify-between gap-3 rounded-3xl border border-foreground/10 bg-background/70 px-4 py-3"
                >
                  <span>
                    #{entry.rank} {entry.displayName}
                  </span>
                  <span className="font-mono">{entry.score}</span>
                </div>
              ))}
            </div>
          </SurfaceCard>

          {snapshot.round ? (
            <SurfaceCard>
              <SurfaceCardTitle className="text-2xl">
                Submission progress
              </SurfaceCardTitle>
              <div className="mt-6">
                <SubmissionProgressList
                  onPoke={(playerId) =>
                    void runAction(`poke:${playerId}`, async () => {
                      await pokePlayer({
                        lobbyId,
                        playerId: playerId as Id<"lobbyPlayers">,
                      });
                    })
                  }
                  pendingAction={pendingAction}
                  progress={snapshot.round.progress}
                  viewerPlayerId={snapshot.viewer.playerId}
                />
              </div>
            </SurfaceCard>
          ) : null}

          <Button asChild className="rounded-full w-full" variant="outline">
            <Link href={`/lobby/${lobbyId}`}>Back to lobby</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
