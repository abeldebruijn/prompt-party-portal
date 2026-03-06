"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function LobbyErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-4 py-10 sm:px-6 lg:px-8">
      <section className="w-full rounded-4xl border-2 border-foreground/10 bg-card/85 p-6 shadow-xl shadow-primary/10 backdrop-blur-sm sm:p-8 lg:p-10">
        <p className="font-mono text-[0.7rem] tracking-[0.24em] text-foreground/60 uppercase">
          Lobby unavailable
        </p>
        <h1 className="mt-5 font-display text-5xl leading-none text-foreground">
          This lobby could not be loaded.
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-foreground/80 sm:text-lg sm:leading-8">
          {error.message ||
            "You may need to join the lobby first, or the room may no longer be active for your account."}
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button className="rounded-full px-6" onClick={() => reset()}>
            Try again
          </Button>

          <Button asChild className="rounded-full px-6" variant="outline">
            <Link href="/lobby">Back to lobby hub</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
