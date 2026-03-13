"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronLeft,
  Loader2Icon,
  RefreshCcw,
  StarIcon,
  StarOff,
  TrophyIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { LobbyTextarea } from "@/app/lobby/_components/lobby-ui";
import { SubmissionProgressList } from "@/components/game/submission-progress-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SurfaceCard, SurfaceCardTitle } from "@/components/ui/surface-card";
import { api, type Id } from "@/lib/convex";
import { cn } from "@/lib/utils";

type GameSnapshot = FunctionReturnType<typeof api.textGame.getGameState>;

function LoadingState() {
  return (
    <main className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-5xl items-center px-4 py-10 sm:px-6 lg:px-8">
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
    <main className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-5xl items-center px-4 py-10 sm:px-6 lg:px-8">
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

function LeaderboardItem({
  entry,
}: {
  entry: GameSnapshot["leaderboard"][number];
}) {
  const prevRank = useRef(entry.rank);
  const [direction, setDirection] = useState<"up" | "down" | "none">("none");

  useEffect(() => {
    if (entry.rank < prevRank.current) {
      setDirection("up");
    } else if (entry.rank > prevRank.current) {
      setDirection("down");
    }
    prevRank.current = entry.rank;
  }, [entry.rank]);

  useEffect(() => {
    if (direction !== "none") {
      const t = setTimeout(() => setDirection("none"), 500);
      return () => clearTimeout(t);
    }
  }, [direction]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{
        opacity: 1,
        y: 0,
        scale: direction === "up" ? 1.02 : direction === "down" ? 0.98 : 1,
        rotate: direction === "up" ? -2 : direction === "down" ? 2 : 0,
        zIndex: direction === "up" ? 10 : 1,
      }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{
        layout: { type: "spring", stiffness: 300, damping: 25 },
        scale: { type: "spring", stiffness: 400, damping: 25 },
        rotate: { type: "spring", stiffness: 400, damping: 25 },
      }}
      className={cn(
        "flex items-center justify-between gap-3 rounded-3xl border px-4 py-3 origin-center",
        entry.rank === 1
          ? "border-primary/30 bg-primary/5 shadow-sm shadow-primary/10"
          : entry.rank === 2
            ? "border-emerald-500/30 bg-emerald-500/5 shadow-sm shadow-emerald-500/10"
            : entry.rank === 3
              ? "border-amber-500/30 bg-amber-500/5 shadow-sm shadow-amber-500/10"
              : "border-foreground/10 bg-background/75",
      )}
    >
      <div className="flex items-center gap-3 overflow-hidden">
        <span
          className={cn(
            "font-mono text-sm font-bold min-w-5",
            entry.rank === 1
              ? "text-primary"
              : entry.rank === 2
                ? "text-emerald-500"
                : entry.rank === 3
                  ? "text-amber-500"
                  : "text-foreground/50",
          )}
        >
          #{entry.rank}
        </span>
        <span className="truncate font-medium text-foreground">
          {entry.displayName}
        </span>
      </div>
      <div className="flex items-baseline gap-1 shrink-0">
        <span className="font-mono text-sm font-medium tabular-nums text-foreground/70">
          {entry.score}
        </span>
        <span className="text-xs font-medium text-foreground/40">pts</span>
      </div>
    </motion.div>
  );
}

function Leaderboard({
  leaderboard,
}: {
  leaderboard: GameSnapshot["leaderboard"];
}) {
  return (
    <div className="grid gap-3 relative">
      <AnimatePresence>
        {leaderboard.map((entry) => (
          <LeaderboardItem
            key={entry.playerId ?? entry.displayName}
            entry={entry}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function RatingSelector({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number | null;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const [hoverValue, setHoverValue] = useState<number | null>(null);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground/80">{label}</p>

      {/* biome-ignore lint/a11y/noStaticElementInteractions: Used for visual hover state only */}
      <div
        className="flex gap-1 items-center"
        onMouseLeave={() => setHoverValue(null)}
      >
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(0)}
          onMouseEnter={() => setHoverValue(0)}
          className={cn(
            "group relative rounded-full p-2 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
            disabled
              ? "cursor-not-allowed opacity-60"
              : "hover:scale-110 active:scale-95",
          )}
        >
          <StarOff
            className={cn(
              "size-5 transition-all duration-300",
              value === 0
                ? "fill-primary text-primary"
                : "fill-transparent text-foreground/20 group-hover:text-primary/30",
            )}
          />
        </button>

        <div className="w-0.5 h-6 mx-2 rounded-full bg-foreground/20"></div>

        {Array.from({ length: 5 }, (_, i) => i + 1).map((option) => {
          const isFilled = (hoverValue ?? value ?? 0) >= option;
          return (
            <button
              key={option}
              type="button"
              disabled={disabled}
              onClick={() => onChange(option)}
              onMouseEnter={() => setHoverValue(option)}
              className={cn(
                "group relative rounded-full p-1.5 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                disabled
                  ? "cursor-not-allowed opacity-60"
                  : "hover:scale-110 active:scale-95",
              )}
            >
              <StarIcon
                className={cn(
                  "size-8 transition-all duration-300",
                  isFilled
                    ? "fill-primary text-primary"
                    : "fill-transparent text-foreground/20 group-hover:text-primary/30",
                )}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

type ActiveGameState = NonNullable<GameSnapshot> & {
  round: NonNullable<NonNullable<GameSnapshot>["round"]>;
  session: NonNullable<NonNullable<GameSnapshot>["session"]>;
};

function GenerateStage({
  snapshot,
  lobbyId,
  canSubmit,
  pendingAction,
  runAction,
}: {
  snapshot: ActiveGameState;
  lobbyId: Id<"lobbies">;
  canSubmit: boolean;
  pendingAction: string | null;
  runAction: (actionKey: string, operation: () => Promise<void>) => void;
}) {
  const [answerDraft, setAnswerDraft] = useState("");
  const submitAnswer = useMutation(api.textGame.submitAnswer);
  const advanceToJudge = useMutation(api.textGame.advanceToJudge);

  useEffect(() => {
    if (snapshot.round.viewerSubmission?.answer) {
      setAnswerDraft(snapshot.round.viewerSubmission.answer);
    }
  }, [snapshot.round.viewerSubmission?.answer]);

  return (
    <div className="mt-8 border-t border-foreground/10 pt-8">
      {canSubmit ? (
        <form
          className="space-y-4"
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
        <div className="flex flex-col items-center justify-center space-y-4 rounded-3xl border border-amber-500/25 bg-amber-500/5 px-5 py-10 text-center">
          <div className="flex items-center gap-3">
            <span className="relative flex size-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex size-3 rounded-full bg-amber-500"></span>
            </span>
            <span className="font-medium text-amber-700 dark:text-amber-500">
              You are the judge
            </span>
          </div>
          <p className="max-w-[320px] text-sm leading-6 text-foreground/70">
            Players are generating answers right now. Get ready to score their
            anonymous submissions!
          </p>
        </div>
      ) : snapshot.round.viewerSubmission ? (
        <div className="rounded-3xl border border-emerald-500/25 bg-emerald-500/10 p-5">
          <p className="text-sm font-medium text-foreground/80">
            Submitted answer
          </p>
          <p className="mt-3 text-base leading-7 text-foreground">
            {snapshot.round.viewerSubmission.answer}
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center space-y-4 rounded-3xl border border-foreground/10 bg-background/50 px-5 py-10 text-center">
          <div className="flex items-center gap-2 text-foreground/60">
            <Loader2Icon className="size-5 animate-spin" />
            <span className="font-medium">Spectating</span>
          </div>
          <p className="max-w-[280px] text-sm leading-6 text-foreground/70">
            You joined after this round started. Sit back and relax until the
            next prompt.
          </p>
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
            "Skip to judging"
          )}
        </Button>
      ) : null}
    </div>
  );
}

function JudgeStage({
  snapshot,
  lobbyId,
  isJudge,
  pendingAction,
  runAction,
  reportError,
}: {
  snapshot: ActiveGameState;
  lobbyId: Id<"lobbies">;
  isJudge: boolean;
  pendingAction: string | null;
  runAction: (actionKey: string, operation: () => Promise<void>) => void;
  reportError: (message: string) => void;
}) {
  const [ratingDrafts, setRatingDrafts] = useState<
    Record<
      string,
      { correctnessStars: number | null; creativityStars: number | null }
    >
  >({});
  const savingBySubmissionIdRef = useRef<Record<string, boolean>>({});
  const [savingBySubmissionId, setSavingBySubmissionId] = useState<
    Record<string, boolean>
  >({});
  const rateSubmission = useMutation(api.textGame.rateSubmission);
  const advanceToPresent = useMutation(api.textGame.advanceToPresent);

  useEffect(() => {
    if (!snapshot.round.judgeSubmissions.length) {
      return;
    }

    setRatingDrafts((current) => {
      const next = { ...current };

      for (const submission of snapshot.round.judgeSubmissions) {
        next[submission.submissionId] = next[submission.submissionId] ?? {
          correctnessStars: submission.correctnessStars,
          creativityStars: submission.creativityStars,
        };
      }

      return next;
    });
  }, [snapshot.round.judgeSubmissions]);

  const allSubmissionsRated = useMemo(
    () =>
      snapshot.round.judgeSubmissions.every(
        (submission) =>
          submission.correctnessStars !== null &&
          submission.creativityStars !== null,
      ),
    [snapshot.round.judgeSubmissions],
  );

  const hasPendingSave = useMemo(
    () => Object.values(savingBySubmissionId).some(Boolean),
    [savingBySubmissionId],
  );

  async function saveSubmissionRating(
    submissionId: string,
    update: { correctnessStars?: number; creativityStars?: number },
    previous: {
      correctnessStars: number | null;
      creativityStars: number | null;
    },
  ) {
    if (savingBySubmissionIdRef.current[submissionId]) {
      return;
    }

    savingBySubmissionIdRef.current[submissionId] = true;
    setSavingBySubmissionId((current) => ({
      ...current,
      [submissionId]: true,
    }));

    try {
      await rateSubmission({
        lobbyId,
        submissionId: submissionId as Id<"textGameSubmissions">,
        ...update,
      });
    } catch (error) {
      reportError(
        error instanceof Error
          ? error.message
          : "That rating could not be saved.",
      );
      setRatingDrafts((current) => ({
        ...current,
        [submissionId]: previous,
      }));
    } finally {
      savingBySubmissionIdRef.current[submissionId] = false;
      setSavingBySubmissionId((current) => ({
        ...current,
        [submissionId]: false,
      }));
    }
  }

  return (
    <div className="mt-6 border-t border-foreground/10 pt-6">
      {isJudge ? (
        <div className="mt-6 space-y-4">
          {snapshot.round.judgeSubmissions.map((submission) => {
            const draft = ratingDrafts[submission.submissionId] ?? {
              correctnessStars: submission.correctnessStars,
              creativityStars: submission.creativityStars,
            };
            const isSaving = Boolean(
              savingBySubmissionId[submission.submissionId],
            );

            return (
              <div
                key={submission.submissionId}
                className="relative rounded-3xl border border-foreground/10 bg-background/75 p-5"
              >
                {isSaving ? (
                  <div className="absolute right-4 top-4 text-foreground/60">
                    <Loader2Icon className="size-4 animate-spin" />
                    <span className="sr-only">Saving...</span>
                  </div>
                ) : null}
                <p className="mt-3 text-base leading-7 text-foreground">
                  {submission.answer}
                </p>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <RatingSelector
                    label="Correctness"
                    onChange={(value) => {
                      const previous = draft;
                      const nextDraft = {
                        ...draft,
                        correctnessStars: value,
                      };
                      setRatingDrafts((current) => ({
                        ...current,
                        [submission.submissionId]: nextDraft,
                      }));
                      saveSubmissionRating(
                        submission.submissionId,
                        { correctnessStars: value },
                        previous,
                      );
                    }}
                    value={draft.correctnessStars}
                    disabled={isSaving}
                  />
                  <RatingSelector
                    label="Creativity"
                    onChange={(value) => {
                      const previous = draft;
                      const nextDraft = {
                        ...draft,
                        creativityStars: value,
                      };
                      setRatingDrafts((current) => ({
                        ...current,
                        [submission.submissionId]: nextDraft,
                      }));
                      saveSubmissionRating(
                        submission.submissionId,
                        { creativityStars: value },
                        previous,
                      );
                    }}
                    value={draft.creativityStars}
                    disabled={isSaving}
                  />
                </div>
              </div>
            );
          })}

          <div className="mt-4 flex items-center justify-end gap-4">
            {!allSubmissionsRated && (
              <p className="text-sm text-foreground/60">
                Please rate all submissions before continuing
              </p>
            )}

            <Button
              className="rounded-full px-6"
              disabled={
                !allSubmissionsRated ||
                hasPendingSave ||
                pendingAction === "advanceToPresent"
              }
              onClick={() =>
                void runAction("advanceToPresent", async () => {
                  await advanceToPresent({ lobbyId });
                })
              }
              type="button"
            >
              {pendingAction === "advanceToPresent" ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" />
                  Continuing...
                </>
              ) : (
                "Continue to next round"
              )}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-6 flex flex-col items-center justify-center space-y-4 rounded-3xl border border-foreground/10 bg-background/50 px-5 py-10 text-center">
          <div className="flex items-center gap-2 text-foreground/60">
            <Loader2Icon className="size-5 animate-spin" />
            <span className="font-medium">Scoring in progress</span>
          </div>

          <Leaderboard leaderboard={snapshot.leaderboard} />

          <p className="max-w-[300px] text-sm leading-6 text-foreground/70 text-balance">
            <strong className="font-medium text-foreground">
              {snapshot.round.targetPlayer?.displayName}
            </strong>{" "}
            is rating the anonymous answers now.
          </p>
        </div>
      )}
    </div>
  );
}

function PresentStage({
  snapshot,
  lobbyId,
  pendingAction,
  runAction,
}: {
  snapshot: ActiveGameState;
  lobbyId: Id<"lobbies">;
  pendingAction: string | null;
  runAction: (actionKey: string, operation: () => Promise<void>) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const advanceAfterPresent = useMutation(api.textGame.advanceAfterPresent);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (
      !snapshot.round.presentEndsAt ||
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
    snapshot.lobby.state,
    snapshot.round.presentEndsAt,
    snapshot.round.stage,
  ]);

  const countdownSeconds = useMemo(() => {
    if (!snapshot.round.presentEndsAt) {
      return 0;
    }
    return Math.max(0, Math.ceil((snapshot.round.presentEndsAt - now) / 1000));
  }, [now, snapshot.round.presentEndsAt]);

  return (
    <div className="mt-10 border-t border-foreground/10 pt-10">
      <div className="rounded-3xl border border-primary/20 bg-primary/10 p-5">
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

  const pokePlayer = useMutation(api.textGame.pokePlayer);
  const resetLobby = useMutation(api.lobbies.resetLobby);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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

  // If round is the last round show component for final results
  if (
    snapshot.round.roundNumber >= snapshot.session.roundCount &&
    snapshot.round.stage === "Present"
  ) {
    return (
      <main className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-7xl flex-col justify-center px-4 py-10 sm:px-6 lg:px-8">
        <SurfaceCard>
          <SurfaceCardTitle className="text-2xl">
            <TrophyIcon className="size-5 text-primary" />
            Leaderboard
          </SurfaceCardTitle>
          <div className="mt-6">
            <Leaderboard leaderboard={snapshot.leaderboard} />
          </div>
        </SurfaceCard>

        {/* If user is host show reset lobby button */}
        {snapshot.viewer.isHost ? (
          <Button
            className="mt-6 rounded-full px-6"
            onClick={() => resetLobby({ lobbyId })}
          >
            <RefreshCcw className="size-4" />
            Reset lobby
          </Button>
        ) : (
          <Link href="/">
            <Button className="mt-6 rounded-full px-6">
              <ChevronLeft className="size-4" />
              Back to home
            </Button>
          </Link>
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-7xl flex-col justify-center px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex items-center sticky top-20 z-10 justify-center sm:justify-end">
        <div className="grid place-items-center p-1 m-2 rounded-full bg-radial from-background/80 via-background/20 to-background/0 to-80% backdrop-blur-[2px] select-none">
          <div className="grid place-items-center p-1 rounded-full bg-radial from-background/80 via-background/20 to-background/0 backdrop-blur-sm select-none">
            <div className="grid place-items-center p-1 rounded-full bg-radial from-background/80 via-background/20 to-background/0 backdrop-blur-md select-none">
              <Badge className="rounded-full border border-foreground/15 bg-background/75 px-3 py-1 font-mono text-[0.7rem] tracking-[0.24em] text-foreground/70 uppercase hover:bg-background/75">
                Round {snapshot.round.roundNumber} /{" "}
                {snapshot.session.roundCount}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr] xl:items-start xl:gap-8">
        <div className="space-y-6">
          <SurfaceCard>
            <SurfaceCardTitle className="text-3xl sm:text-4xl leading-tight">
              {snapshot.round.promptText}
            </SurfaceCardTitle>

            {actionError ? (
              <p className="mt-6 text-sm leading-6 text-destructive">
                {actionError}
              </p>
            ) : null}

            {snapshot.round.stage === "Generate" ? (
              <GenerateStage
                canSubmit={canSubmit}
                lobbyId={lobbyId}
                pendingAction={pendingAction}
                runAction={runAction}
                snapshot={snapshot as ActiveGameState}
              />
            ) : null}

            {snapshot.round.stage === "Judge" ? (
              <JudgeStage
                isJudge={isJudge}
                lobbyId={lobbyId}
                pendingAction={pendingAction}
                reportError={(message) => setActionError(message)}
                runAction={runAction}
                snapshot={snapshot as ActiveGameState}
              />
            ) : null}

            {snapshot.round.stage === "Present" ? (
              <PresentStage
                lobbyId={lobbyId}
                pendingAction={pendingAction}
                runAction={runAction}
                snapshot={snapshot as ActiveGameState}
              />
            ) : null}
          </SurfaceCard>
        </div>

        <div className="space-y-6 xl:sticky xl:top-16">
          <SurfaceCard>
            <div className="flex items-center gap-3">
              <UsersIcon className="size-5 text-primary" />
              <SurfaceCardTitle className="text-2xl">
                Submission progress
              </SurfaceCardTitle>
            </div>
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

          {snapshot.round.stage !== "Judge" && (
            <SurfaceCard>
              <SurfaceCardTitle className="text-2xl">
                <TrophyIcon className="size-5 text-primary" />
                Leaderboard
              </SurfaceCardTitle>
              <div className="mt-6">
                <Leaderboard leaderboard={snapshot.leaderboard} />
              </div>
            </SurfaceCard>
          )}

          {snapshot.lobby.state === "Completion" ? (
            <SurfaceCard>
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
