import type * as React from "react";
import { cn } from "@/lib/utils";

export function SurfaceCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-4xl border-2 border-foreground/10 bg-card/85 p-6 shadow-xl shadow-primary/10 backdrop-blur-sm sm:p-8",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function SurfaceCardTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={cn(
        "font-display text-4xl leading-none text-foreground",
        className,
      )}
    >
      {children}
    </h2>
  );
}
