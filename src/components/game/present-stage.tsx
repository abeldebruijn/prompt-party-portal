"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const enterTransition = {
  duration: 0.55,
  ease: [0.16, 1, 0.3, 1] as const,
};

export function PresentStageShell({
  countdownSeconds,
  children,
}: {
  countdownSeconds: number;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  const urgencyTone =
    countdownSeconds === 0
      ? "border-emerald-500/25 bg-emerald-500/12 text-emerald-950 dark:text-emerald-200"
      : countdownSeconds <= 3
        ? "border-amber-500/35 bg-amber-500/14 text-amber-950 dark:text-amber-200"
        : "border-primary/25 bg-primary/10 text-foreground";

  return (
    <div className="mt-8 border-t border-foreground/10 pt-8 grid gap-4">
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="mt-5"
        initial={reducedMotion ? false : { opacity: 0, y: 18 }}
        transition={{
          ...enterTransition,
          delay: reducedMotion ? 0 : 0.12,
        }}
      >
        {children}
      </motion.div>

      <motion.div
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className={cn(
          "relative isolate flex min-w-[11.5rem] flex-col gap-2.5 rounded-[1.35rem] border px-3.5 py-3.5 shadow-[inset_0_1px_0_color-mix(in_oklch,var(--color-background)_76%,transparent)] sm:px-4",
          urgencyTone,
        )}
        initial={reducedMotion ? false : { opacity: 0, scale: 0.94, y: 10 }}
        transition={{
          duration: 0.45,
          ease: [0.22, 1, 0.36, 1],
          delay: reducedMotion ? 0 : 0.08,
        }}
      >
        <AnimatedCountdown seconds={countdownSeconds} />
      </motion.div>
    </div>
  );
}

function AnimatedCountdown({ seconds }: { seconds: number }) {
  const reducedMotion = useReducedMotion();
  const displayValue = String(seconds).padStart(2, "0");

  if (reducedMotion) {
    return (
      <div className="flex items-end gap-2.5">
        <span className="font-display text-5xl leading-none tabular-nums sm:text-6xl">
          {displayValue}
        </span>
        <span className="pb-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.22em] opacity-65">
          sec
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-end gap-2.5">
      <div className="flex items-center gap-1">
        {displayValue.split("").map((digit, index) => (
          <DigitColumn
            key={`${index}-${digit}`}
            digit={digit}
            seconds={seconds}
          />
        ))}
      </div>
      <motion.span
        animate={{
          opacity: seconds <= 3 ? [0.55, 1, 0.55] : 0.7,
          y: seconds <= 3 ? [0, -2, 0] : 0,
        }}
        className="pb-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.22em]"
        transition={{
          duration: seconds <= 3 ? 0.9 : 0.25,
          ease: [0.25, 1, 0.5, 1],
          repeat: seconds <= 3 && seconds > 0 ? Infinity : 0,
        }}
      >
        sec
      </motion.span>
    </div>
  );
}

function DigitColumn({ digit, seconds }: { digit: string; seconds: number }) {
  const urgent = seconds <= 3 && seconds > 0;

  return (
    <div className="relative flex h-[4.25rem] w-[3rem] items-center justify-center overflow-hidden rounded-[0.95rem] border border-foreground/10 bg-background/82 shadow-[inset_0_1px_0_color-mix(in_oklch,var(--color-background)_84%,transparent)] sm:h-[4.75rem] sm:w-[3.4rem]">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={digit}
          animate={{
            opacity: 1,
            scale: urgent ? [1, 1.08, 1] : 1,
            y: 0,
          }}
          className="font-display text-4xl leading-none tabular-nums text-foreground sm:text-5xl"
          exit={{ opacity: 0, y: -18 }}
          initial={{ opacity: 0, y: 18 }}
          transition={{
            duration: urgent ? 0.42 : 0.28,
            ease: [0.16, 1, 0.3, 1],
          }}
        >
          {digit}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
