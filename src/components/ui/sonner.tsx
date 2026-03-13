"use client";

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:rounded-[1.6rem] group-[.toaster]:border-2 group-[.toaster]:border-foreground/10 group-[.toaster]:bg-card/92 group-[.toaster]:px-4 group-[.toaster]:py-3.5 group-[.toaster]:font-sans group-[.toaster]:text-card-foreground group-[.toaster]:shadow-[0_22px_60px_-30px_color-mix(in_oklch,var(--color-primary)_45%,transparent)] group-[.toaster]:backdrop-blur-md",
          content: "gap-1.5",
          title:
            "font-display text-[1.05rem] leading-none tracking-[-0.01em] text-foreground",
          description:
            "text-[0.82rem] leading-5 font-medium text-foreground/72",
          icon: "mt-0.5 rounded-full border border-primary/18 bg-primary/10 p-1 text-primary shadow-sm shadow-primary/10",
          actionButton:
            "rounded-full bg-primary px-3.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90",
          cancelButton:
            "rounded-full border border-foreground/12 bg-background/78 px-3.5 text-sm font-semibold text-foreground/72 transition-colors hover:bg-background",
          closeButton:
            "rounded-full border border-foreground/10 bg-background/82 text-foreground/55 transition-colors hover:bg-background hover:text-foreground/78",
          success:
            "group-[.toaster]:border-emerald-500/28 group-[.toaster]:bg-[color-mix(in_oklch,var(--color-card)_88%,oklch(0.84_0.12_160)_12%)]",
          error:
            "group-[.toaster]:border-destructive/28 group-[.toaster]:bg-[color-mix(in_oklch,var(--color-card)_88%,var(--color-destructive)_12%)]",
          warning:
            "group-[.toaster]:border-amber-500/30 group-[.toaster]:bg-[color-mix(in_oklch,var(--color-card)_88%,oklch(0.84_0.15_85)_12%)]",
          info: "group-[.toaster]:border-primary/24 group-[.toaster]:bg-[color-mix(in_oklch,var(--color-card)_90%,var(--color-primary)_10%)]",
        },
      }}
      style={
        {
          "--normal-bg": "color-mix(in oklch, var(--card) 92%, white 8%)",
          "--normal-text": "var(--card-foreground)",
          "--normal-border":
            "color-mix(in oklch, var(--border) 88%, var(--primary) 12%)",
          "--border-radius": "1.6rem",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
