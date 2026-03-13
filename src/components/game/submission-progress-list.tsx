"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { BellRingIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ProgressState =
  | "Submitted"
  | "Pending"
  | "Target"
  | "Spectating"
  | "AiExcluded";

export type SubmissionProgressEntry = {
  playerId: string;
  displayName: string;
  state: ProgressState;
  lastPoke: {
    createdAt: number;
    pokedByDisplayName: string;
    pokedByPlayerId: string;
  } | null;
};

function statusTone(state: ProgressState) {
  switch (state) {
    case "Submitted":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-400";
    case "Target":
      return "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-400";
    case "Spectating":
    case "AiExcluded":
      return "border-foreground/15 bg-foreground/5 text-foreground/60";
    default:
      return "border-foreground/15 bg-foreground/5 text-foreground/80";
  }
}

function progressOrder(state: ProgressState) {
  switch (state) {
    case "Pending":
      return 0;
    case "Submitted":
      return 1;
    case "Target":
      return 2;
    case "Spectating":
      return 3;
    case "AiExcluded":
      return 4;
  }
}

function ProgressRow({
  entry,
  pendingAction,
  viewerPlayerId,
  onPoke,
  pokeLabel = "Poke",
}: {
  entry: SubmissionProgressEntry;
  pendingAction: string | null;
  viewerPlayerId: string;
  onPoke: (playerId: string) => void;
  pokeLabel?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [isNotified, setIsNotified] = useState(false);
  const previousPokeAt = useRef<number | null>(
    entry.lastPoke?.createdAt ?? null,
  );
  const isViewer = entry.playerId === viewerPlayerId;
  const canPoke = entry.state === "Pending" && !isViewer;
  const showViewerAlert = isViewer && entry.lastPoke !== null;
  const latestPokerName = entry.lastPoke?.pokedByDisplayName ?? null;

  useEffect(() => {
    const latestPokeAt = entry.lastPoke?.createdAt ?? null;

    if (!isViewer || latestPokeAt === null) {
      previousPokeAt.current = latestPokeAt;
      return;
    }

    if (previousPokeAt.current === null) {
      previousPokeAt.current = latestPokeAt;
      return;
    }

    if (latestPokeAt <= previousPokeAt.current) {
      return;
    }

    if (latestPokerName === null) {
      previousPokeAt.current = latestPokeAt;
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
  }, [entry.lastPoke?.createdAt, isViewer, latestPokerName]);

  return (
    <motion.div
      initial={false}
      animate={
        reduceMotion
          ? { opacity: 1 }
          : isNotified
            ? {
                x: [0, -8, 6, -4, 0],
                y: [0, -1, 0],
                scale: [1, 1.028, 0.995, 1],
                boxShadow: [
                  "0 0 0 0 rgba(0,0,0,0)",
                  "0 0 0 6px rgba(245, 158, 11, 0.16)",
                  "0 18px 38px -24px rgba(245, 158, 11, 0.5)",
                  "0 0 0 0 rgba(0,0,0,0)",
                ],
              }
            : {
                x: 0,
                y: 0,
                scale: 1,
                boxShadow: "0 0 0 0 rgba(0,0,0,0)",
              }
      }
      transition={{
        duration: reduceMotion ? 0.12 : 0.56,
        ease: [0.16, 1, 0.3, 1],
      }}
      className={cn(
        "relative flex items-start justify-between gap-3 rounded-2xl border px-3 py-3 will-change-transform",
        statusTone(entry.state),
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

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="max-w-[140px] truncate text-sm font-medium">
            {entry.displayName}
          </span>
          <span className="text-[0.65rem] font-bold uppercase tracking-[0.15em] opacity-60">
            {entry.state}
          </span>
          {isViewer ? (
            <span className="text-[0.65rem] font-bold uppercase tracking-[0.15em] opacity-45">
              You
            </span>
          ) : null}
        </div>

        {entry.lastPoke ? (
          <motion.div
            animate={
              reduceMotion
                ? { opacity: 1 }
                : isNotified
                  ? { opacity: 1, y: [0, -1, 0] }
                  : { opacity: 0.88, y: 0 }
            }
            className={cn(
              "mt-1 flex items-center gap-1.5 text-xs",
              showViewerAlert
                ? "font-medium text-amber-900 dark:text-amber-300"
                : "opacity-80",
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
              Poked by {entry.lastPoke.pokedByDisplayName}
              {isViewer ? " just now" : ""}
            </span>
          </motion.div>
        ) : null}
      </div>

      {canPoke ? (
        <Button
          className="rounded-full"
          disabled={pendingAction === `poke:${entry.playerId}`}
          onClick={() => onPoke(entry.playerId)}
          size="xs"
          type="button"
          variant="outline"
        >
          {pendingAction === `poke:${entry.playerId}` ? "Poking..." : pokeLabel}
        </Button>
      ) : null}
    </motion.div>
  );
}

export function SubmissionProgressList({
  progress,
  pendingAction,
  viewerPlayerId,
  onPoke,
  pokeLabel,
}: {
  progress: SubmissionProgressEntry[];
  pendingAction: string | null;
  viewerPlayerId: string;
  onPoke: (playerId: string) => void;
  pokeLabel?: string;
}) {
  return (
    <div className="space-y-2">
      {progress
        .toSorted((a, b) => progressOrder(a.state) - progressOrder(b.state))
        .map((entry) => (
          <ProgressRow
            key={entry.playerId}
            entry={entry}
            onPoke={onPoke}
            pendingAction={pendingAction}
            pokeLabel={pokeLabel}
            viewerPlayerId={viewerPlayerId}
          />
        ))}
    </div>
  );
}
