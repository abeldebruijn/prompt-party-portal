"use client";

import { useConvexAuth, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ArrowRightIcon, Loader2Icon } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/convex";
import { cn } from "@/lib/utils";

type Viewer = FunctionReturnType<typeof api.users.viewer>;
type ViewerLobbies = FunctionReturnType<typeof api.lobbies.listViewerLobbies>;
type LobbySummary = ViewerLobbies["created"][number];

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

function formatActivity(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

function HistorySection({
  description,
  emptyMessage,
  lobbies,
  title,
}: {
  description: string;
  emptyMessage: string;
  lobbies: LobbySummary[];
  title: string;
}) {
  return (
    <SurfaceCard>
      <h2 className="font-display text-3xl leading-none text-foreground">
        {title}
      </h2>
      <p className="mt-3 text-sm leading-6 text-foreground/70">{description}</p>

      <div className="mt-6 space-y-3">
        {lobbies.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-foreground/15 bg-background/60 p-4 text-sm leading-6 text-foreground/65">
            {emptyMessage}
          </div>
        ) : (
          lobbies.map((lobby) => (
            <Link
              key={lobby.lobbyId}
              className="block rounded-3xl border border-foreground/10 bg-background/70 p-4 transition hover:border-primary/25 hover:bg-background/85"
              href={`/lobby/${lobby.lobbyId}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-foreground">
                    {lobby.selectedGame}
                  </p>
                  <p className="mt-1 font-mono text-xs tracking-[0.18em] text-foreground/60 uppercase">
                    Join code {lobby.joinCode}
                  </p>
                </div>
                <Badge className="rounded-full border border-foreground/15 bg-background/75 px-3 py-1 text-[0.65rem] tracking-[0.18em] text-foreground/70 uppercase hover:bg-background/75">
                  {lobby.state}
                </Badge>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-foreground/70">
                <span>{lobby.activePlayerCount} active players</span>
                <span>
                  Last activity {formatActivity(lobby.lastActivityAt)}
                </span>
              </div>
            </Link>
          ))
        )}
      </div>
    </SurfaceCard>
  );
}

function LobbiesLoading() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-6xl items-center px-4 py-10 sm:px-6 lg:px-8">
      <SurfaceCard className="w-full text-center">
        <Loader2Icon className="mx-auto size-6 animate-spin text-primary" />
        <h1 className="mt-5 font-display text-4xl leading-none text-foreground">
          Loading lobby history...
        </h1>
      </SurfaceCard>
    </main>
  );
}

function SignedOutLobbies() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-6xl flex-col justify-center px-4 py-10 sm:px-6 lg:px-8">
      <SurfaceCard className="sm:p-10">
        <Badge className="rounded-full border border-foreground/15 bg-background/70 px-3 py-1 font-mono text-[0.7rem] tracking-[0.24em] text-foreground/70 uppercase hover:bg-background/70">
          Lobby history
        </Badge>
        <h1 className="mt-6 font-display text-5xl leading-none text-foreground sm:text-6xl">
          Sign in to review your created and played lobbies.
        </h1>
        <p className="mt-6 max-w-2xl text-base leading-7 text-foreground/90 sm:text-lg sm:leading-8">
          Your homepage shows the latest five entries. This page expands that
          into full history once you have an active account session.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild className="rounded-full px-6">
            <Link href="/auth">
              Open auth
              <ArrowRightIcon className="size-4" />
            </Link>
          </Button>
          <Button asChild className="rounded-full px-6" variant="outline">
            <Link href="/">Back home</Link>
          </Button>
        </div>
      </SurfaceCard>
    </main>
  );
}

function AuthenticatedLobbies({
  lobbies,
  viewer,
}: {
  lobbies: ViewerLobbies;
  viewer: Viewer;
}) {
  const isGuest = !viewer.canCreateLobby;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col px-4 py-10 sm:px-6 lg:px-8">
      <section className="lg:items-start lg:gap-8">
        <SurfaceCard className="sm:p-10">
          <h1 className="font-display text-5xl leading-none text-foreground sm:text-6xl">
            All your recent rooms, in one place.
          </h1>

          <p className="mt-6 max-w-2xl text-base leading-7 text-foreground/90 sm:text-lg sm:leading-8">
            {isGuest
              ? "Guest accounts can review joined rooms here and jump back into active lobbies. Upgrade when you want durable hosting access and saved account management."
              : "Use this page when the homepage preview is not enough. It keeps your created and played lobbies together with direct links back into each room."}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild className="rounded-full px-6">
              <Link href="/lobby">
                {isGuest ? "Join from lobby hub" : "Create or join a lobby"}
                <ArrowRightIcon className="size-4" />
              </Link>
            </Button>
            <Button asChild className="rounded-full px-6" variant="outline">
              <Link href={isGuest ? "/auth" : "/settings"}>
                {isGuest ? "Upgrade to host account" : "Open settings"}
              </Link>
            </Button>
          </div>
        </SurfaceCard>
      </section>

      <section className="mt-6 grid gap-6">
        <HistorySection
          description="Every lobby you created, beyond the five-card homepage preview."
          emptyMessage="You have not created a lobby yet. Use the lobby hub to start your first room."
          lobbies={lobbies.created}
          title="Created lobbies"
        />
        <HistorySection
          description="Every room you joined as a player, beyond the homepage preview."
          emptyMessage="No played lobbies yet. Join a room with a code to have it show up here."
          lobbies={lobbies.played}
          title="Played lobbies"
        />
      </section>
    </main>
  );
}

export default function LobbiesPage() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const viewer = useQuery(api.users.viewer, isAuthenticated ? {} : "skip");
  const lobbies = useQuery(
    api.lobbies.listViewerLobbies,
    isAuthenticated ? { limit: 0 } : "skip",
  );

  if (isLoading) {
    return <LobbiesLoading />;
  }

  if (!isAuthenticated) {
    return <SignedOutLobbies />;
  }

  if (viewer === undefined || lobbies === undefined) {
    return <LobbiesLoading />;
  }

  return <AuthenticatedLobbies lobbies={lobbies} viewer={viewer} />;
}
