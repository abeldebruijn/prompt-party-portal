"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  ArrowRightIcon,
  Loader2Icon,
  LogInIcon,
  SparklesIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type * as React from "react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/convex";
import { normalizeJoinCodeInput } from "@/lib/lobby-ui";
import { cn } from "@/lib/utils";

type LobbyGame = FunctionReturnType<
  typeof api.lobbies.listAvailableGames
>[number];

function SurfaceCard({
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

function LobbyInput({ className, ...props }: React.ComponentProps<"input">) {
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

function LobbySelect({ className, ...props }: React.ComponentProps<"select">) {
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

function LobbyHubLoading() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-10 sm:px-6 lg:px-8">
      <SurfaceCard className="w-full text-center">
        <Loader2Icon className="mx-auto size-6 animate-spin text-primary" />
        <h1 className="mt-5 font-display text-4xl leading-none text-foreground">
          Loading lobby controls...
        </h1>
        <p className="mt-3 text-sm leading-6 text-foreground/70 sm:text-base">
          Checking your account and fetching the approved placeholder games.
        </p>
      </SurfaceCard>
    </main>
  );
}

function SignedOutPrompt() {
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

export default function LobbyHubPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const viewer = useQuery(api.users.viewer, isAuthenticated ? {} : "skip");
  const games = useQuery(
    api.lobbies.listAvailableGames,
    isAuthenticated ? {} : "skip",
  );
  const createLobby = useMutation(api.lobbies.createLobby);
  const joinLobbyByCode = useMutation(api.lobbies.joinLobbyByCode);

  const [selectedGame, setSelectedGame] = useState<LobbyGame | "">("");
  const [joinCode, setJoinCode] = useState("");
  const [pendingAction, setPendingAction] = useState<"create" | "join" | null>(
    null,
  );
  const [createError, setCreateError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedGame && games?.[0]) {
      setSelectedGame(games[0]);
    }
  }, [games, selectedGame]);

  const isBusy = pendingAction !== null;
  const normalizedJoinCode = useMemo(
    () => normalizeJoinCodeInput(joinCode),
    [joinCode],
  );

  async function handleCreateLobby() {
    if (!selectedGame || isBusy) {
      return;
    }

    setPendingAction("create");
    setCreateError(null);
    setJoinError(null);

    try {
      const result = await createLobby({ selectedGame });
      router.push(`/lobby/${result.lobbyId}`);
    } catch (error) {
      setPendingAction(null);
      setCreateError(
        error instanceof Error
          ? error.message
          : "Could not create a lobby right now.",
      );
    }
  }

  async function handleJoinLobby(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (normalizedJoinCode.length !== 6 || isBusy) {
      return;
    }

    setPendingAction("join");
    setCreateError(null);
    setJoinError(null);

    try {
      const result = await joinLobbyByCode({ joinCode: normalizedJoinCode });
      router.push(`/lobby/${result.lobbyId}`);
    } catch (error) {
      setPendingAction(null);
      setJoinError(
        error instanceof Error ? error.message : "Could not join that lobby.",
      );
    }
  }

  if (
    isLoading ||
    (isAuthenticated && (viewer === undefined || games === undefined))
  ) {
    return <LobbyHubLoading />;
  }

  if (!isAuthenticated) {
    return <SignedOutPrompt />;
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-4 py-10 sm:px-6 lg:px-8">
      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start lg:gap-8">
        <div className="space-y-6">
          <SurfaceCard>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Badge className="rounded-full border border-foreground/15 bg-background/75 px-3 py-1 font-mono text-[0.7rem] tracking-[0.24em] text-foreground/70 uppercase hover:bg-background/75">
                Lobby hub
              </Badge>

              <Button
                asChild
                className="rounded-full"
                size="sm"
                variant="outline"
              >
                <Link href="/">Back home</Link>
              </Button>
            </div>

            <h1 className="mt-5 font-display text-5xl leading-none text-foreground sm:text-6xl">
              Create a room or jump in by code.
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-7 text-foreground/85 sm:text-lg sm:leading-8">
              {viewer ? `Hi ${viewer.username} — ` : ""}
              hosts choose one approved placeholder game, players join with a
              6-character code, and the lobby stays reactive from setup through
              completion.
            </p>

            <div className="mt-6 flex flex-wrap gap-3 text-xs text-foreground/65 uppercase tracking-[0.18em] font-mono">
              <span className="rounded-full border border-foreground/12 bg-background/75 px-3 py-2">
                {viewer?.canCreateLobby
                  ? "Host-ready account"
                  : "Guest join-only account"}
              </span>
              <span className="rounded-full border border-foreground/12 bg-background/75 px-3 py-2">
                Approved games only
              </span>
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <p className="font-mono text-[0.7rem] tracking-[0.24em] text-foreground/60 uppercase">
              Create lobby
            </p>
            <h2 className="mt-4 font-display text-4xl leading-none text-foreground">
              Start in Creation state as the host.
            </h2>
            <p className="mt-4 text-sm leading-6 text-foreground/75 sm:text-base">
              Pick one of the approved placeholder games now. You can still swap
              it later before the session starts.
            </p>

            {viewer?.canCreateLobby ? (
              <div className="mt-6 space-y-4">
                <label className="block space-y-2" htmlFor="create-lobby-game">
                  <span className="text-sm font-medium text-foreground/80">
                    Placeholder game
                  </span>
                  <LobbySelect
                    disabled={isBusy || !games?.length}
                    id="create-lobby-game"
                    onChange={(event) =>
                      setSelectedGame(event.target.value as LobbyGame)
                    }
                    value={selectedGame}
                  >
                    {games?.map((game) => (
                      <option key={game} value={game}>
                        {game}
                      </option>
                    ))}
                  </LobbySelect>
                </label>

                <Button
                  className="h-11 rounded-full px-6"
                  disabled={!selectedGame || isBusy}
                  onClick={handleCreateLobby}
                >
                  {pendingAction === "create" ? (
                    <>
                      <Loader2Icon className="size-4 animate-spin" />
                      Creating lobby...
                    </>
                  ) : (
                    <>
                      <SparklesIcon className="size-4" />
                      Create lobby
                    </>
                  )}
                </Button>

                {createError ? (
                  <p className="text-sm leading-6 text-destructive">
                    {createError}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="mt-6 rounded-3xl border border-foreground/10 bg-background/70 p-5">
                <p className="text-sm leading-6 text-foreground/80">
                  Guest accounts can join lobbies, but only durable
                  email/password accounts can create and host them.
                </p>
                <Button asChild className="mt-4 rounded-full" variant="outline">
                  <Link href="/auth">
                    Upgrade in auth
                    <ArrowRightIcon className="size-4" />
                  </Link>
                </Button>
              </div>
            )}
          </SurfaceCard>

          <SurfaceCard>
            <p className="font-mono text-[0.7rem] tracking-[0.24em] text-foreground/60 uppercase">
              Join by code
            </p>
            <h2 className="mt-4 font-display text-4xl leading-none text-foreground">
              Drop into an active room in any non-completed state.
            </h2>
            <p className="mt-4 text-sm leading-6 text-foreground/75 sm:text-base">
              Playing lobbies still accept late joiners. Completed lobbies need
              the host to reset before anyone can re-enter.
            </p>

            <form className="mt-6 space-y-4" onSubmit={handleJoinLobby}>
              <label className="block space-y-2" htmlFor="join-lobby-code">
                <span className="text-sm font-medium text-foreground/80">
                  Lobby code
                </span>
                <LobbyInput
                  autoComplete="off"
                  id="join-lobby-code"
                  inputMode="text"
                  maxLength={6}
                  onChange={(event) =>
                    setJoinCode(normalizeJoinCodeInput(event.target.value))
                  }
                  placeholder="ABC123"
                  spellCheck={false}
                  value={joinCode}
                />
              </label>

              <Button
                className="h-11 rounded-full px-6"
                disabled={normalizedJoinCode.length !== 6 || isBusy}
                type="submit"
              >
                {pendingAction === "join" ? (
                  <>
                    <Loader2Icon className="size-4 animate-spin" />
                    Joining lobby...
                  </>
                ) : (
                  "Join lobby"
                )}
              </Button>

              {joinError ? (
                <p className="text-sm leading-6 text-destructive">
                  {joinError}
                </p>
              ) : null}
            </form>
          </SurfaceCard>
        </div>

        <div className="space-y-6 lg:sticky lg:top-8">
          <SurfaceCard>
            <p className="font-mono text-[0.7rem] tracking-[0.24em] text-foreground/60 uppercase">
              Approved placeholder titles
            </p>
            <div className="mt-5 space-y-3">
              {games?.map((game, index) => (
                <div
                  key={game}
                  className="flex items-start gap-3 rounded-3xl border border-foreground/10 bg-background/70 p-4"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {index + 1}
                  </span>
                  <p className="pt-1 text-sm leading-6 text-foreground/85">
                    {game}
                  </p>
                </div>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <p className="font-mono text-[0.7rem] tracking-[0.24em] text-foreground/60 uppercase">
              Flow at a glance
            </p>
            <div className="mt-5 space-y-4">
              {[
                "Creation: host picks the placeholder game, can add AI players, and everyone can see the roster.",
                "Playing: the room becomes readied for a placeholder round, and late joiners still get in.",
                "Completion: a placeholder leaderboard appears with confetti and a host reset action.",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-3xl border border-foreground/10 bg-background/70 p-4 text-sm leading-6 text-foreground/80"
                >
                  {item}
                </div>
              ))}
            </div>
          </SurfaceCard>
        </div>
      </section>
    </main>
  );
}
