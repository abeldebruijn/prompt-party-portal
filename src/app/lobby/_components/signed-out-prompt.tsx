import { LogInIcon } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SurfaceCard } from "@/components/ui/surface-card";

export function SignedOutPrompt() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-4 py-10 sm:px-6 lg:px-8">
      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start lg:gap-8">
        <SurfaceCard>
          <Badge className="rounded-full border border-foreground/15 bg-background/75 px-3 py-1 font-mono text-[0.7rem] tracking-[0.24em] text-foreground/70 uppercase hover:bg-background/75">
            Lobby access
          </Badge>
          <h1 className="mt-5 font-display text-5xl leading-none text-foreground sm:text-6xl">
            Sign in before you create or join a lobby.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-foreground/85 sm:text-lg sm:leading-8">
            Hosts and players both need an account session here. Use
            email/password for durable host powers, or continue as a guest when
            you only need a quick seat at the table.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild className="rounded-full px-6">
              <Link href="/auth">
                <LogInIcon className="size-4" />
                Open auth
              </Link>
            </Button>

            <Button asChild className="rounded-full px-6" variant="outline">
              <Link href="/">Back home</Link>
            </Button>
          </div>
        </SurfaceCard>

        <SurfaceCard className="space-y-4">
          <p className="font-mono text-[0.7rem] tracking-[0.24em] text-foreground/60 uppercase">
            What unlocks when you sign in
          </p>
          {[
            "Create a lobby with an email/password host account.",
            "Join any active lobby with its 6-character code.",
            "Edit your generated username after you arrive.",
          ].map((item, index) => (
            <div
              key={item}
              className="flex items-start gap-3 rounded-3xl border border-foreground/10 bg-background/70 p-4"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                {index + 1}
              </span>
              <p className="pt-1 text-sm leading-6 text-foreground/80">
                {item}
              </p>
            </div>
          ))}
        </SurfaceCard>
      </section>
    </main>
  );
}
