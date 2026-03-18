"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  BellRingIcon,
  Loader2Icon,
  StarIcon,
  StarOff,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { LobbyTextarea } from "@/app/lobby/_components/lobby-ui";
import { PresentStageShell } from "@/components/game/present-stage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SurfaceCard, SurfaceCardTitle } from "@/components/ui/surface-card";
import { api, type Id } from "@/lib/convex";
import { cn } from "@/lib/utils";

type GameSnapshot = FunctionReturnType<typeof api.textGame.getGameState>;
type ProgressEntry = NonNullable<
  NonNullable<NonNullable<GameSnapshot>["round"]>["progress"]
>[number];
type LeaderboardEntry = NonNullable<GameSnapshot>["leaderboard"][number];
type LeaderboardRow = {
  entry: LeaderboardEntry | null;
  progress: ProgressEntry | null;
  key: string;
};

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
  progress,
  pendingAction,
  viewerPlayerId,
  onPoke,
}: {
  entry: LeaderboardEntry | null;
  progress: ProgressEntry | null;
  pendingAction?: string | null;
  viewerPlayerId?: string;
  onPoke?: (playerId: string) => void;
}) {
  const rank = entry?.rank ?? Number.MAX_SAFE_INTEGER;
  const prevRank = useRef(rank);
  const [direction, setDirection] = useState<"up" | "down" | "none">("none");
  const reduceMotion = useReducedMotion();
  const [isNotified, setIsNotified] = useState(false);
  const previousPokeAt = useRef<number | null>(
    progress?.lastPoke?.createdAt ?? null,
  );
  const isViewer =
    progress !== null &&
    viewerPlayerId !== undefined &&
    progress.playerId === viewerPlayerId;
  const canPoke =
    progress !== null &&
    onPoke !== undefined &&
    progress.state === "Pending" &&
    !isViewer;
  const showViewerAlert = isViewer && progress?.lastPoke !== null;
  const latestPokerName = progress?.lastPoke?.pokedByDisplayName ?? null;

  useEffect(() => {
    if (rank < prevRank.current) {
      setDirection("up");
    } else if (rank > prevRank.current) {
      setDirection("down");
    }
    prevRank.current = rank;
  }, [rank]);

  useEffect(() => {
    if (direction !== "none") {
      const t = setTimeout(() => setDirection("none"), 500);
      return () => clearTimeout(t);
    }
  }, [direction]);

  useEffect(() => {
    const latestPokeAt = progress?.lastPoke?.createdAt ?? null;

    if (!isViewer || latestPokeAt === null) {
      previousPokeAt.current = latestPokeAt;
      return;
    }

    if (previousPokeAt.current === null) {
      previousPokeAt.current = latestPokeAt;
      return;
    }

    if (latestPokeAt <= previousPokeAt.current || latestPokerName === null) {
      return;
    }

    previousPokeAt.current = latestPokeAt;
    setIsNotified(true);
    toast("You were poked", {
      description: `${latestPokerName} is waiting on your submission.`,
      duration: 2600,
      position: "top-center",
    });
    const timeoutId = window.setTimeout(() => setIsNotified(false), 1800);

    return () => window.clearTimeout(timeoutId);
  }, [isViewer, latestPokerName, progress?.lastPoke?.createdAt]);

  const state = progress?.state ?? null;

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
        "relative flex items-start justify-between gap-3 rounded-3xl border px-4 py-3 origin-center",
        entry?.rank === 1
          ? "border-primary/30 bg-primary/5 shadow-sm shadow-primary/10"
          : entry?.rank === 2
            ? "border-emerald-500/30 bg-emerald-500/5 shadow-sm shadow-emerald-500/10"
            : entry?.rank === 3
              ? "border-amber-500/30 bg-amber-500/5 shadow-sm shadow-amber-500/10"
              : "border-foreground/10 bg-background/75",
        isNotified &&
          "border-amber-500/55 bg-amber-500/12 ring-2 ring-amber-500/35",
      )}
    >
      <AnimatePresence initial={false}>
        {showViewerAlert ? (
          <motion.div
            animate={
              reduceMotion
                ? { opacity: 1 }
                : isNotified
                  ? { opacity: 1, y: 0, scale: 1 }
                  : { opacity: 0.92, y: 0, scale: 1 }
            }
            className="absolute right-3 top-3 rounded-full border border-amber-500/35 bg-amber-500/14 px-2.5 py-1 text-[0.62rem] font-black uppercase tracking-[0.18em] text-amber-900 dark:text-amber-300"
            exit={{ opacity: 0, y: -6 }}
            initial={
              reduceMotion
                ? { opacity: 1 }
                : { opacity: 0, y: -10, scale: 0.94 }
            }
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          >
            Poke received
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3 overflow-hidden">
          {entry ? (
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
          ) : (
            <span className="min-w-5 text-center font-mono text-sm font-bold text-foreground/30">
              •
            </span>
          )}
          <span className="truncate font-medium text-foreground">
            {entry?.displayName ?? progress?.displayName ?? "Unknown player"}
          </span>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {state ? (
            <span className="rounded-full border border-foreground/12 bg-foreground/5 px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-[0.15em] text-foreground/65">
              {state}
            </span>
          ) : null}
          {isViewer ? (
            <span className="text-[0.65rem] font-bold uppercase tracking-[0.15em] text-foreground/45">
              You
            </span>
          ) : null}
        </div>

        {progress?.lastPoke ? (
          <motion.div
            animate={
              reduceMotion
                ? { opacity: 1 }
                : isNotified
                  ? { opacity: 1, y: [0, -1, 0] }
                  : { opacity: 0.88, y: 0 }
            }
            className={cn(
              "mt-2 flex items-center gap-1.5 text-xs",
              showViewerAlert
                ? "font-medium text-amber-900 dark:text-amber-300"
                : "text-foreground/70",
            )}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            <motion.span
              animate={
                reduceMotion
                  ? { scale: 1 }
                  : isNotified
                    ? { rotate: [-10, 14, -8, 0], scale: [1, 1.18, 1] }
                    : { rotate: 0, scale: 1 }
              }
              className="flex items-center justify-center"
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            >
              <BellRingIcon className="size-3.5" />
            </motion.span>
            <motion.span
              animate={
                reduceMotion
                  ? { scale: 1, opacity: 1 }
                  : isNotified
                    ? { scale: [1, 1.35, 1], opacity: [0.7, 1, 0.82] }
                    : { scale: 1, opacity: 0.72 }
              }
              className="size-1.5 rounded-full bg-current"
              transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
            />
            <span>
              Poked by {progress.lastPoke.pokedByDisplayName}
              {isViewer ? " just now" : ""}
            </span>
          </motion.div>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2">
        {entry ? (
          <div className="flex items-baseline gap-1">
            <span className="font-mono text-sm font-medium tabular-nums text-foreground/70">
              {entry.score}
            </span>
            <span className="text-xs font-medium text-foreground/40">pts</span>
          </div>
        ) : null}

        {canPoke && progress ? (
          <Button
            className="rounded-full"
            disabled={pendingAction === `poke:${progress.playerId}`}
            onClick={() => onPoke(progress.playerId)}
            size="xs"
            type="button"
            variant="outline"
          >
            {pendingAction === `poke:${progress.playerId}`
              ? "Poking..."
              : "Poke"}
          </Button>
        ) : null}
      </div>
    </motion.div>
  );
}

function buildLeaderboardRows(
  leaderboard: GameSnapshot["leaderboard"],
  progress: ProgressEntry[] | undefined,
) {
  const progressByPlayerId = new Map(
    (progress ?? []).map((entry) => [entry.playerId, entry]),
  );
  const seen = new Set<string>();
  const rows: LeaderboardRow[] = leaderboard.map((entry) => {
    seen.add(entry.playerId ?? entry.displayName);
    return {
      entry,
      progress: entry.playerId
        ? (progressByPlayerId.get(entry.playerId) ?? null)
        : null,
      key: entry.playerId ?? entry.displayName,
    };
  });

  for (const progressEntry of progress ?? []) {
    if (seen.has(progressEntry.playerId)) {
      continue;
    }
    rows.push({
      entry: null,
      progress: progressEntry,
      key: progressEntry.playerId,
    });
  }

  return rows;
}

function Leaderboard({
  leaderboard,
  progress,
  pendingAction,
  viewerPlayerId,
  onPoke,
  canPoke = false,
}: {
  leaderboard: GameSnapshot["leaderboard"];
  progress?: ProgressEntry[];
  pendingAction?: string | null;
  viewerPlayerId?: string;
  onPoke?: (playerId: string) => void;
  canPoke?: boolean;
}) {
  const rows = useMemo(
    () => buildLeaderboardRows(leaderboard, progress),
    [leaderboard, progress],
  );

  return (
    <div className="grid gap-3 relative">
      <AnimatePresence>
        {rows.map((row) => (
          <LeaderboardItem
            key={row.key}
            entry={row.entry}
            onPoke={canPoke ? onPoke : undefined}
            pendingAction={pendingAction}
            progress={row.progress}
            viewerPlayerId={viewerPlayerId}
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
  const skipToPresent = useMutation(api.textGame.skipToPresent);

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

          <div className="mt-4 flex flex-wrap items-center justify-end gap-4">
            {isJudge && !allSubmissionsRated && (
              <p className="text-sm text-foreground/60">
                Please rate all submissions before continuing
              </p>
            )}

            {snapshot.viewer.isHost ? (
              <Button
                className="rounded-full px-6"
                disabled={hasPendingSave || pendingAction === "skipToPresent"}
                onClick={() =>
                  void runAction("skipToPresent", async () => {
                    await skipToPresent({ lobbyId });
                  })
                }
                type="button"
                variant="outline"
              >
                {pendingAction === "skipToPresent" ? (
                  <>
                    <Loader2Icon className="size-4 animate-spin" />
                    Skipping...
                  </>
                ) : (
                  "Skip to present"
                )}
              </Button>
            ) : null}

            {isJudge ? (
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
            ) : null}
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

          {snapshot.viewer.isHost ? (
            <Button
              className="rounded-full px-6"
              disabled={pendingAction === "skipToPresent" || hasPendingSave}
              onClick={() =>
                void runAction("skipToPresent", async () => {
                  await skipToPresent({ lobbyId });
                })
              }
              type="button"
              variant="outline"
            >
              {pendingAction === "skipToPresent" ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" />
                  Skipping...
                </>
              ) : (
                "Skip to present"
              )}
            </Button>
          ) : null}
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
    <PresentStageShell
      countdownSeconds={countdownSeconds}
      description="The room can take in the best line, see who wrote it, and catch the score split before the next prompt drops."
      eyebrow="Results spotlight"
      title="The round lands here."
    >
      {snapshot.round.winners.length > 0 ? (
        <div className="grid gap-3">
          {snapshot.round.winners.map((winner, index) => (
            <motion.article
              key={winner.submissionId}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="rounded-[1.35rem] border border-foreground/10 bg-background/82 p-4 shadow-[0_20px_60px_-42px_color-mix(in_oklch,var(--color-primary)_45%,transparent)] sm:p-5"
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              transition={{
                duration: 0.45,
                delay: 0.08 + index * 0.08,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="rounded-full border border-primary/18 bg-primary/10 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-foreground/70">
                  Winning answer
                </span>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground/45">
                  {winner.authorDisplayName}
                </p>
              </div>
              <p className="mt-4 max-w-3xl text-xl leading-tight text-foreground sm:text-[1.7rem] sm:leading-[1.08]">
                {winner.answer}
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-foreground/70 sm:text-sm">
                <span className="rounded-full border border-foreground/10 bg-background/65 px-3 py-1">
                  {winner.correctnessStars}/5 correctness
                </span>
                <span className="rounded-full border border-foreground/10 bg-background/65 px-3 py-1">
                  {winner.creativityStars}/5 creativity
                </span>
              </div>
            </motion.article>
          ))}
        </div>
      ) : (
        <div className="rounded-[1.35rem] border border-dashed border-foreground/15 bg-background/72 px-4 py-6 text-sm leading-6 text-foreground/72 sm:px-5">
          No answers were scored this round.
        </div>
      )}

      {countdownSeconds === 0 && snapshot.lobby.state !== "Completion" ? (
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
    </PresentStageShell>
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

      <section
        className={cn(
          "grid gap-6 xl:items-start xl:gap-8",
          snapshot.round.stage === "Judge"
            ? "xl:grid-cols-1"
            : "xl:grid-cols-[1.1fr_0.9fr]",
        )}
      >
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
          {snapshot.round.stage !== "Judge" && (
            <SurfaceCard>
              <SurfaceCardTitle className="text-2xl">
                <UsersIcon className="size-5 text-primary" />
                Leaderboard
              </SurfaceCardTitle>
              <div className="mt-6">
                <Leaderboard
                  canPoke={snapshot.round.stage === "Generate"}
                  leaderboard={snapshot.leaderboard}
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
