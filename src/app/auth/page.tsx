import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";

import { AuthShell } from "./auth-shell";

const accountModes = [
  {
    eyebrow: "Email + password",
    title: "Host with a durable identity.",
    description: "Only email/password users can create and host games.",
  },
  {
    eyebrow: "Guest account",
    title: "Join quickly",
    description:
      "Guest users have fewer features due to platform limits, so a guest account works best for lightweight participation.",
  },
];

export const metadata: Metadata = {
  title: "Auth | Prompt Party Portal",
  description:
    "Choose email/password or a guest account for the Prompt Party Portal.",
};

export default function AuthPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-4 py-10 sm:px-6 lg:px-8">
      <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-start lg:gap-8">
        <div className="space-y-6">
          <section className="rounded-4xl border-2 border-foreground/10 bg-card/85 p-6 shadow-xl shadow-primary/10 backdrop-blur-sm sm:p-8 lg:p-10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Badge className="rounded-full border border-foreground/15 bg-background/70 px-3 py-1 font-mono text-[0.7rem] tracking-[0.24em] text-foreground/70 uppercase hover:bg-background/70">
                Prompt party portal
              </Badge>

              <Link
                className="inline-flex items-center rounded-full border border-foreground/12 bg-background/75 px-4 py-2 font-mono text-xs tracking-[0.18em] text-foreground/70 uppercase transition-colors hover:bg-accent hover:text-accent-foreground"
                href="/"
              >
                Back home
              </Link>
            </div>

            <div className="mt-6 space-y-4">
              <p className="max-w-2xl text-base leading-7 text-foreground/90 sm:text-lg sm:leading-8">
                Use an email account when you want a durable host identity, or
                start with a guest account when you just need a quick seat. The
                page keeps the same bright surfaces, soft borders, and playful
                hierarchy as the homepage.
              </p>
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-1">
            {accountModes.map((mode) => (
              <article
                key={mode.eyebrow}
                className="rounded-4xl border-2 border-foreground/10 bg-card/85 p-6 shadow-lg shadow-primary/10 backdrop-blur-sm sm:p-8"
              >
                <p className="font-mono text-[0.7rem] tracking-[0.24em] text-foreground/65 uppercase">
                  {mode.eyebrow}
                </p>
                <h2 className="mt-4 font-display text-4xl leading-none text-foreground">
                  {mode.title}
                </h2>
                <p className="mt-4 text-sm leading-6 text-foreground/75 sm:text-base">
                  {mode.description}
                </p>
              </article>
            ))}
          </section>
        </div>

        <AuthShell />
      </section>
    </main>
  );
}
