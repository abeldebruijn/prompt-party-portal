"use client";

import { motion, useReducedMotion } from "framer-motion";
import { BellRingIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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

    previousPokeAt.current = latestPokeAt;
    setIsNotified(true);
    const timeoutId = window.setTimeout(() => setIsNotified(false), 1200);

    return () => window.clearTimeout(timeoutId);
  }, [entry.lastPoke?.createdAt, isViewer]);

  return (
    <motion.div
      animate={
        reduceMotion
          ? { opacity: 1 }
          : isNotified
            ? {
                x: [0, -5, 4, -3, 0],
                scale: [1, 1.015, 1],
              }
            : {
                x: 0,
                scale: 1,
              }
      }
      transition={{
        duration: reduceMotion ? 0.12 : 0.42,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={cn(
        "flex items-start justify-between gap-3 rounded-2xl border px-3 py-3",
        statusTone(entry.state),
        isNotified && "ring-2 ring-primary/30",
      )}
    >
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
          <div className="mt-1 flex items-center gap-1.5 text-xs opacity-80">
            <BellRingIcon className="size-3.5" />
            <span>Poked by {entry.lastPoke.pokedByDisplayName}</span>
          </div>
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
