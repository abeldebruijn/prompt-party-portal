"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  ChevronLeft,
  Loader2Icon,
  PartyPopperIcon,
  ShieldQuestionIcon,
  SparklesIcon,
  StarIcon,
  TimerResetIcon,
  TrophyIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { LobbyTextarea } from "@/app/lobby/_components/lobby-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SurfaceCard, SurfaceCardTitle } from "@/components/ui/surface-card";
import { api, type Id } from "@/lib/convex";
import { cn } from "@/lib/utils";

type GameSnapshot = FunctionReturnType<typeof api.textGame.getGameState>;

function LoadingState() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-4 py-10 sm:px-6 lg:px-8">
      <SurfaceCard className="w-full text-center">
        <Loader2Icon className="mx-auto size-6 animate-spin text-primary" />
        <SurfaceCardTitle className="mt-5 text-3xl">
          Syncing text game...
        </SurfaceCardTitle>
      </SurfaceCard>
    </main>
  );
}

function SignedOutState() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-4 py-10 sm:px-6 lg:px-8">
      <SurfaceCard className="w-full">
        <SurfaceCardTitle className="text-4xl">
          Sign in to rejoin this game.
        </SurfaceCardTitle>
        <div className="mt-6 flex gap-3">
          <Button asChild className="rounded-full px-6">
            <Link href="/auth">Open auth</Link>
          </Button>
          <Button asChild className="rounded-full px-6" variant="outline">
            <Link href="/lobby">Back to lobbies</Link>
          </Button>
        </div>
      </SurfaceCard>
    </main>
  );
}

function statusTone(state: string) {
  switch (state) {
    case "Submitted":
      return "border-emerald-500/25 bg-emerald-500/10 text-emerald-900";
    case "Target":
      return "border-amber-500/25 bg-amber-500/10 text-amber-900";
    case "Spectating":
    case "AiExcluded":
      return "border-foreground/12 bg-background/70 text-foreground/65";
    default:
      return "border-foreground/12 bg-background/70 text-foreground";
  }
}

function ProgressList({
  progress,
}: {
  progress: NonNullable<GameSnapshot["round"]>["progress"];
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {progress.map((entry) => (
        <div
          key={entry.playerId}
          className={cn(
            "rounded-3xl border px-4 py-3",
            statusTone(entry.state),
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium">{entry.displayName}</span>
            <Badge className="rounded-full border border-current/15 bg-transparent px-2.5 py-1 text-[0.65rem] uppercase tracking-[0.18em] text-current hover:bg-transparent">
              {entry.state}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  );
}

function Leaderboard({
  leaderboard,
}: {
  leaderboard: GameSnapshot["leaderboard"];
}) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {leaderboard.map((entry) => (
        <div
          key={entry.playerId ?? entry.displayName}
          className={cn(
            "rounded-3xl border bg-background/75 p-5",
            entry.rank === 1
              ? "border-primary/30 shadow-lg shadow-primary/10"
              : "border-foreground/10",
          )}
        >
          <p className="font-mono text-[0.7rem] tracking-[0.22em] text-foreground/60 uppercase">
            Place #{entry.rank}
          </p>
          <h3 className="mt-3 text-xl font-semibold text-foreground">
            {entry.displayName}
          </h3>
          <p className="mt-2 text-sm leading-6 text-foreground/70">
            Score: {entry.score}
          </p>
        </div>
      ))}
    </div>
  );
}

function RatingSelector({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground/80">{label}</p>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 6 }, (_, index) => index).map((option) => (
          <Button
            key={option}
            className="rounded-full px-3"
            onClick={() => onChange(option)}
            size="sm"
            type="button"
            variant={value === option ? "default" : "outline"}
          >
            <StarIcon className="size-3.5" />
            {option}
          </Button>
        ))}
      </div>
    </div>
  );
}

export default function TextGamePage() {
  const params = useParams<{ lobbyId: string }>();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const lobbyId = params.lobbyId as Id<"lobbies">;
  const snapshot = useQuery(
    api.textGame.getGameState,
    isAuthenticated ? { lobbyId } : "skip",
  );
  const submitAnswer = useMutation(api.textGame.submitAnswer);
  const advanceToJudge = useMutation(api.textGame.advanceToJudge);
  const rateSubmission = useMutation(api.textGame.rateSubmission);
  const advanceAfterPresent = useMutation(api.textGame.advanceAfterPresent);
  const resetLobby = useMutation(api.lobbies.resetLobby);

  const [answerDraft, setAnswerDraft] = useState("");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [ratingDrafts, setRatingDrafts] = useState<
    Record<
      string,
      { correctnessStars: number | null; creativityStars: number | null }
    >
  >({});
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (
      snapshot &&
      snapshot.lobby.selectedGame !== "Pick text that suits a situation"
    ) {
      router.replace(`/lobby/${lobbyId}`);
    }
  }, [lobbyId, router, snapshot]);

  useEffect(() => {
    if (snapshot && snapshot.lobby.state === "Creation") {
      router.replace(`/lobby/${lobbyId}`);
    }
  }, [lobbyId, router, snapshot]);

  useEffect(() => {
    if (snapshot?.round?.viewerSubmission?.answer) {
      setAnswerDraft(snapshot.round.viewerSubmission.answer);
    }
  }, [snapshot?.round?.viewerSubmission?.answer]);

  useEffect(() => {
    if (!snapshot?.round?.judgeSubmissions.length) {
      return;
    }

    setRatingDrafts((current) => {
      const next = { ...current };

      for (const submission of snapshot.round?.judgeSubmissions ?? []) {
        next[submission.submissionId] = next[submission.submissionId] ?? {
          correctnessStars: submission.correctnessStars,
          creativityStars: submission.creativityStars,
        };
      }

      return next;
    });
  }, [snapshot?.round?.judgeSubmissions]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (
      !snapshot?.round?.presentEndsAt ||
      snapshot.round.stage !== "Present" ||
      snapshot.lobby.state === "Completion"
    ) {
      return;
    }

    const timeout = window.setTimeout(
      () => {
        void advanceAfterPresent({ lobbyId });
      },
      Math.max(snapshot.round.presentEndsAt - Date.now(), 0) + 100,
    );

    return () => window.clearTimeout(timeout);
  }, [
    advanceAfterPresent,
    lobbyId,
    snapshot?.lobby.state,
    snapshot?.round?.presentEndsAt,
    snapshot?.round?.stage,
  ]);

  async function runAction(actionKey: string, operation: () => Promise<void>) {
    setPendingAction(actionKey);
    setActionError(null);

    try {
      await operation();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "That text-game action could not be completed.",
      );
    } finally {
      setPendingAction(null);
    }
  }

  const countdownSeconds = useMemo(() => {
    if (!snapshot?.round?.presentEndsAt) {
      return 0;
    }

    return Math.max(0, Math.ceil((snapshot.round.presentEndsAt - now) / 1000));
  }, [now, snapshot?.round?.presentEndsAt]);

  if (isLoading || (isAuthenticated && snapshot === undefined)) {
    return <LoadingState />;
  }

  if (!isAuthenticated) {
    return <SignedOutState />;
  }

  if (!snapshot || !snapshot.round || !snapshot.session) {
    return <LoadingState />;
  }

  const canSubmit =
    snapshot.round.stage === "Generate" &&
    snapshot.viewer.role === "Participant" &&
    !snapshot.round.viewerSubmission;
  const isJudge = snapshot.viewer.role === "Judge";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col justify-center px-4 py-10 sm:px-6 lg:px-8">
      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr] xl:items-start xl:gap-8">
        <div className="space-y-6">
          <SurfaceCard>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                asChild
                className="rounded-full"
                size="sm"
                variant="outline"
              >
                <Link href={`/lobby/${lobbyId}`}>
                  <ChevronLeft className="size-4" /> Back to lobby
                </Link>
              </Button>
              <Badge className="rounded-full border border-foreground/15 bg-background/75 px-3 py-1 font-mono text-[0.7rem] tracking-[0.24em] text-foreground/70 uppercase hover:bg-background/75">
                Round {snapshot.round.roundNumber} /{" "}
                {snapshot.session.roundCount}
              </Badge>
            </div>

            <SurfaceCardTitle className="mt-6 text-3xl sm:text-4xl">
              {snapshot.round.promptText}
            </SurfaceCardTitle>

            <div className="mt-6 flex flex-wrap gap-3 text-xs font-mono tracking-[0.18em] text-foreground/65 uppercase">
              <span className="rounded-full border border-foreground/12 bg-background/75 px-3 py-2">
                Stage {snapshot.round.stage}
              </span>
              <span className="rounded-full border border-foreground/12 bg-background/75 px-3 py-2">
                Your role {snapshot.viewer.role}
              </span>
              {snapshot.round.targetPlayer ? (
                <span className="rounded-full border border-foreground/12 bg-background/75 px-3 py-2">
                  Prompt about {snapshot.round.targetPlayer.displayName}
                </span>
              ) : null}
            </div>

            {actionError ? (
              <p className="mt-6 text-sm leading-6 text-destructive">
                {actionError}
              </p>
            ) : null}
          </SurfaceCard>

          {snapshot.round.stage === "Generate" ? (
            <SurfaceCard>
              <div className="flex items-start gap-3">
                <SparklesIcon className="size-5 text-primary" />
                <SurfaceCardTitle className="text-2xl">
                  Generate
                </SurfaceCardTitle>
              </div>

              {canSubmit ? (
                <form
                  className="mt-6 space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void runAction("submit", async () => {
                      await submitAnswer({ lobbyId, answer: answerDraft });
                    });
                  }}
                >
                  <label className="block space-y-2" htmlFor="text-answer">
                    <span className="text-sm font-medium text-foreground/80">
                      Your answer
                    </span>
                    <LobbyTextarea
                      id="text-answer"
                      onChange={(event) => setAnswerDraft(event.target.value)}
                      placeholder="Write a sharp, funny, or surprisingly accurate answer."
                      value={answerDraft}
                    />
                  </label>

                  <Button
                    className="rounded-full px-6"
                    disabled={pendingAction === "submit"}
                    type="submit"
                  >
                    {pendingAction === "submit" ? (
                      <>
                        <Loader2Icon className="size-4 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      "Submit answer"
                    )}
                  </Button>
                </form>
              ) : snapshot.viewer.role === "Judge" ? (
                <div className="mt-6 rounded-3xl border border-amber-500/25 bg-amber-500/10 p-5 text-sm leading-6 text-foreground/80">
                  You are this round’s judge. Wait for the other players to
                  submit, then score the anonymous answers.
                </div>
              ) : snapshot.round.viewerSubmission ? (
                <div className="mt-6 rounded-3xl border border-emerald-500/25 bg-emerald-500/10 p-5">
                  <p className="text-sm font-medium text-foreground/80">
                    Submitted answer
                  </p>
                  <p className="mt-3 text-base leading-7 text-foreground">
                    {snapshot.round.viewerSubmission.answer}
                  </p>
                </div>
              ) : (
                <div className="mt-6 rounded-3xl border border-foreground/10 bg-background/70 p-5 text-sm leading-6 text-foreground/80">
                  You joined after this round started, so you are spectating
                  until the next prompt.
                </div>
              )}

              {snapshot.viewer.isHost ? (
                <Button
                  className="mt-6 rounded-full px-6"
                  disabled={pendingAction === "advance"}
                  onClick={() =>
                    void runAction("advance", async () => {
                      await advanceToJudge({ lobbyId });
                    })
                  }
                  variant="outline"
                >
                  {pendingAction === "advance" ? (
                    <>
                      <Loader2Icon className="size-4 animate-spin" />
                      Advancing...
                    </>
                  ) : (
                    "Force advance to judge"
                  )}
                </Button>
              ) : null}
            </SurfaceCard>
          ) : null}

          {snapshot.round.stage === "Judge" ? (
            <SurfaceCard>
              <div className="flex items-start gap-3">
                <ShieldQuestionIcon className="size-5 text-primary" />
                <SurfaceCardTitle className="text-2xl">Judge</SurfaceCardTitle>
              </div>

              {isJudge ? (
                <div className="mt-6 space-y-4">
                  {snapshot.round.judgeSubmissions.map((submission, index) => {
                    const draft = ratingDrafts[submission.submissionId] ?? {
                      correctnessStars: submission.correctnessStars,
                      creativityStars: submission.creativityStars,
                    };

                    return (
                      <div
                        key={submission.submissionId}
                        className="rounded-3xl border border-foreground/10 bg-background/75 p-5"
                      >
                        <p className="font-mono text-[0.7rem] tracking-[0.22em] text-foreground/60 uppercase">
                          Anonymous answer #{index + 1}
                        </p>
                        <p className="mt-3 text-base leading-7 text-foreground">
                          {submission.answer}
                        </p>
                        <div className="mt-5 grid gap-4 md:grid-cols-2">
                          <RatingSelector
                            label="Correctness"
                            onChange={(value) =>
                              setRatingDrafts((current) => ({
                                ...current,
                                [submission.submissionId]: {
                                  ...draft,
                                  correctnessStars: value,
                                },
                              }))
                            }
                            value={draft.correctnessStars}
                          />
                          <RatingSelector
                            label="Creativity"
                            onChange={(value) =>
                              setRatingDrafts((current) => ({
                                ...current,
                                [submission.submissionId]: {
                                  ...draft,
                                  creativityStars: value,
                                },
                              }))
                            }
                            value={draft.creativityStars}
                          />
                        </div>
                        <Button
                          className="mt-5 rounded-full px-6"
                          disabled={
                            pendingAction === submission.submissionId ||
                            draft.correctnessStars === null ||
                            draft.creativityStars === null
                          }
                          onClick={() =>
                            void runAction(
                              submission.submissionId,
                              async () => {
                                await rateSubmission({
                                  lobbyId,
                                  submissionId: submission.submissionId,
                                  correctnessStars: draft.correctnessStars ?? 0,
                                  creativityStars: draft.creativityStars ?? 0,
                                });
                              },
                            )
                          }
                          type="button"
                        >
                          {pendingAction === submission.submissionId ? (
                            <>
                              <Loader2Icon className="size-4 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            "Save rating"
                          )}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-6 rounded-3xl border border-foreground/10 bg-background/70 p-5 text-sm leading-6 text-foreground/80">
                  {snapshot.round.targetPlayer?.displayName} is rating the
                  answers now.
                </div>
              )}
            </SurfaceCard>
          ) : null}

          {snapshot.round.stage === "Present" ? (
            <SurfaceCard>
              <div className="flex items-start gap-3">
                <PartyPopperIcon className="size-5 text-primary" />
                <SurfaceCardTitle className="text-2xl">
                  Present
                </SurfaceCardTitle>
              </div>

              <div className="mt-6 rounded-3xl border border-primary/20 bg-primary/10 p-5">
                <p className="font-mono text-[0.7rem] tracking-[0.22em] text-foreground/60 uppercase">
                  Advancing in {countdownSeconds}s
                </p>
                {snapshot.round.winners.length > 0 ? (
                  <div className="mt-4 space-y-4">
                    {snapshot.round.winners.map((winner) => (
                      <div
                        key={winner.submissionId}
                        className="rounded-3xl border border-primary/20 bg-background/75 p-5"
                      >
                        <p className="text-base leading-7 text-foreground">
                          {winner.answer}
                        </p>
                        <p className="mt-3 text-sm leading-6 text-foreground/70">
                          {winner.authorDisplayName} · {winner.correctnessStars}
                          /5 correctness · {winner.creativityStars}/5 creativity
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-sm leading-6 text-foreground/75">
                    No answers were scored this round.
                  </p>
                )}
              </div>

              {countdownSeconds === 0 ? (
                <Button
                  className="mt-6 rounded-full px-6"
                  disabled={pendingAction === "continue"}
                  onClick={() =>
                    void runAction("continue", async () => {
                      await advanceAfterPresent({ lobbyId });
                    })
                  }
                >
                  {pendingAction === "continue" ? (
                    <>
                      <Loader2Icon className="size-4 animate-spin" />
                      Continuing...
                    </>
                  ) : (
                    "Continue"
                  )}
                </Button>
              ) : null}
            </SurfaceCard>
          ) : null}
        </div>

        <div className="space-y-6 xl:sticky xl:top-16">
          <SurfaceCard>
            <div className="flex items-start gap-3">
              <UsersIcon className="size-5 text-primary" />
              <SurfaceCardTitle className="text-2xl">
                Submission progress
              </SurfaceCardTitle>
            </div>
            <div className="mt-6">
              <ProgressList progress={snapshot.round.progress} />
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <div className="flex items-start gap-3">
              <TrophyIcon className="size-5 text-primary" />
              <SurfaceCardTitle className="text-2xl">
                Leaderboard
              </SurfaceCardTitle>
            </div>
            <div className="mt-6">
              <Leaderboard leaderboard={snapshot.leaderboard} />
            </div>
          </SurfaceCard>

          {snapshot.lobby.state === "Completion" ? (
            <SurfaceCard>
              <div className="flex items-start gap-3">
                <TimerResetIcon className="size-5 text-primary" />
                <SurfaceCardTitle className="text-2xl">
                  Session complete
                </SurfaceCardTitle>
              </div>
              <p className="mt-4 text-sm leading-6 text-foreground/75">
                The text game is finished. The host can reset the lobby to start
                a new setup.
              </p>
              {snapshot.viewer.isHost ? (
                <Button
                  className="mt-6 rounded-full px-6"
                  disabled={pendingAction === "reset"}
                  onClick={() =>
                    void runAction("reset", async () => {
                      await resetLobby({ lobbyId });
                      router.replace(`/lobby/${lobbyId}`);
                    })
                  }
                >
                  {pendingAction === "reset" ? (
                    <>
                      <Loader2Icon className="size-4 animate-spin" />
                      Resetting...
                    </>
                  ) : (
                    "Reset lobby"
                  )}
                </Button>
              ) : null}
            </SurfaceCard>
          ) : null}
        </div>
      </section>
    </main>
  );
}
