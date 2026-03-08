import { cn } from "@/lib/utils";
import type * as React from "react";

export function LobbyInput({
  className,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-12 w-full rounded-2xl border border-foreground/12 bg-background/80 px-4 text-sm text-foreground shadow-sm outline-none transition focus:border-primary/40 focus:ring-4 focus:ring-primary/10",
        "placeholder:text-foreground/45 disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}

export function LobbySelect({
  className,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-12 w-full rounded-2xl border border-foreground/12 bg-background/80 px-4 text-sm text-foreground shadow-sm outline-none transition focus:border-primary/40 focus:ring-4 focus:ring-primary/10",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}

export function LobbyTextarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "min-h-28 w-full rounded-2xl border border-foreground/12 bg-background/80 px-4 py-3 text-sm text-foreground shadow-sm outline-none transition focus:border-primary/40 focus:ring-4 focus:ring-primary/10",
        "placeholder:text-foreground/45 disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}
