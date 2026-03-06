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
type LobbySummary = FunctionReturnType<
  typeof api.lobbies.listViewerLobbies
>["created"][number];

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

function LobbyList({
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
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl leading-none text-foreground">
            {title}
          </h2>
          <p className="mt-3 text-sm leading-6 text-foreground/70">
            {description}
          </p>
        </div>
        <Button asChild className="rounded-full" size="sm" variant="outline">
          <Link href="/lobbies">Open full history</Link>
        </Button>
      </div>

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

function SignedOutHome() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-6xl flex-col justify-center px-4 py-10 sm:px-6 lg:px-8">
      <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-start lg:gap-8">
        <SurfaceCard className="sm:p-10">
          <Badge className="rounded-full border border-foreground/15 bg-background/70 px-3 py-1 font-mono text-[0.7rem] tracking-[0.24em] text-foreground/70 uppercase hover:bg-background/70">
            Prompt party portal
          </Badge>

          <h1 className="mt-6 font-display text-5xl leading-none text-foreground sm:text-6xl">
            Host a lobby, join in fast, and keep party setup simple.
          </h1>

          <div className="mt-6 space-y-4">
            <p className="max-w-2xl text-base leading-7 text-foreground/90 sm:text-lg sm:leading-8">
              Email/password accounts unlock hosting and account management.
              Guest sessions keep the join flow lightweight when someone just
              needs a quick seat at the table.
            </p>
            <p className="text-sm leading-6 text-foreground/70 sm:text-base">
              Sign in to create lobbies, revisit recent rooms, and manage your
              account settings without leaving the shared Prompt Party theme.
            </p>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild className="rounded-full px-6">
              <Link href="/auth">
                Open auth
                <ArrowRightIcon className="size-4" />
              </Link>
            </Button>
            <Button asChild className="rounded-full px-6" variant="outline">
              <Link href="/lobbies">Browse lobby entry points</Link>
            </Button>
          </div>
        </SurfaceCard>

        <SurfaceCard className="space-y-4">
          <p className="font-mono text-[0.7rem] tracking-[0.24em] text-foreground/60 uppercase">
            What changes after sign-in
          </p>
          {[
            "Email/password users can create and host placeholder game lobbies.",
            "Guests can still join active rooms with a code, then upgrade later.",
            "Returning users see their most recent created and played lobbies on the homepage.",
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

function AuthenticatedHome({
  recentLobbies,
  viewer,
}: {
  recentLobbies: FunctionReturnType<typeof api.lobbies.listViewerLobbies>;
  viewer: Viewer;
}) {
  const isGuest = !viewer.canCreateLobby;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col px-4 py-10 sm:px-6 lg:px-8">
      <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-start lg:gap-8">
        <SurfaceCard className="sm:p-10">
          <div className="flex flex-wrap items-center gap-3">
            <Badge className="rounded-full border border-foreground/15 bg-background/70 px-3 py-1 font-mono text-[0.7rem] tracking-[0.24em] text-foreground/70 uppercase hover:bg-background/70">
              Dashboard
            </Badge>
            <Badge className="rounded-full border border-foreground/15 bg-background/70 px-3 py-1 font-mono text-[0.7rem] tracking-[0.24em] text-foreground/70 uppercase hover:bg-background/70">
              {viewer.authType === "anonymous"
                ? "Guest account"
                : "Email + password"}
            </Badge>
          </div>

          <h1 className="mt-6 font-display text-5xl leading-none text-foreground sm:text-6xl">
            Welcome back, {viewer.username}.
          </h1>

          <p className="mt-6 max-w-2xl text-base leading-7 text-foreground/90 sm:text-lg sm:leading-8">
            {isGuest
              ? "You can join active lobbies and review the rooms you recently touched. Upgrade to an email/password account when you want durable host powers and account settings."
              : "Your home base now shows recent room activity, direct paths back into live lobbies, and account controls for the next hosting session."}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            {isGuest ? (
              <>
                <Button asChild className="rounded-full px-6">
                  <Link href="/auth">
                    Upgrade to host account
                    <ArrowRightIcon className="size-4" />
                  </Link>
                </Button>
                <Button asChild className="rounded-full px-6" variant="outline">
                  <Link href="/lobbies">Join from lobby hub</Link>
                </Button>
              </>
            ) : (
              <>
                <Button asChild className="rounded-full px-6">
                  <Link href="/lobbies">
                    Create or join a lobby
                    <ArrowRightIcon className="size-4" />
                  </Link>
                </Button>
                <Button asChild className="rounded-full px-6" variant="outline">
                  <Link href="/settings">Open settings</Link>
                </Button>
              </>
            )}
          </div>
        </SurfaceCard>

        <SurfaceCard className="space-y-4">
          <p className="font-mono text-[0.7rem] tracking-[0.24em] text-foreground/60 uppercase">
            Account snapshot
          </p>
          <div className="rounded-3xl border border-foreground/10 bg-background/70 p-4">
            <p className="text-sm font-medium text-foreground/75">
              Signed in as
            </p>
            <p className="mt-2 text-lg font-semibold text-foreground">
              {viewer.email ?? "Guest session"}
            </p>
          </div>
          <div className="rounded-3xl border border-foreground/10 bg-background/70 p-4">
            <p className="text-sm font-medium text-foreground/75">
              Created rooms
            </p>
            <p className="mt-2 text-3xl font-display text-foreground">
              {recentLobbies.created.length}
            </p>
          </div>
          <div className="rounded-3xl border border-foreground/10 bg-background/70 p-4">
            <p className="text-sm font-medium text-foreground/75">
              Recently played
            </p>
            <p className="mt-2 text-3xl font-display text-foreground">
              {recentLobbies.played.length}
            </p>
          </div>
          {isGuest ? (
            <div className="rounded-3xl border border-primary/20 bg-primary/8 p-4 text-sm leading-6 text-foreground/80">
              Guest accounts cannot create lobbies or manage saved account data.
              Register with email + password when you want durable hosting
              access.
            </div>
          ) : (
            <div className="rounded-3xl border border-chart-2/20 bg-chart-2/10 p-4 text-sm leading-6 text-foreground/80">
              Email/password accounts can create lobbies, revisit old rooms, and
              update both username and email from settings.
            </div>
          )}
        </SurfaceCard>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <LobbyList
          description="Up to five lobbies you created most recently."
          emptyMessage="You have not created a lobby yet. Use the lobby hub to start your first room."
          lobbies={recentLobbies.created}
          title="Recently created"
        />
        <LobbyList
          description="Up to five rooms where you joined as a player."
          emptyMessage="No played lobbies yet. Join a room with a code to have it show up here."
          lobbies={recentLobbies.played}
          title="Recently played"
        />
      </section>
    </main>
  );
}

function HomeLoading() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-6xl items-center px-4 py-10 sm:px-6 lg:px-8">
      <SurfaceCard className="w-full text-center">
        <Loader2Icon className="mx-auto size-6 animate-spin text-primary" />
        <h1 className="mt-5 font-display text-4xl leading-none text-foreground">
          Loading your homepage...
        </h1>
        <p className="mt-3 text-sm leading-6 text-foreground/70 sm:text-base">
          Checking your account type and recent lobby activity.
        </p>
      </SurfaceCard>
    </main>
  );
}

export default function Home() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const viewer = useQuery(api.users.viewer, isAuthenticated ? {} : "skip");
  const recentLobbies = useQuery(
    api.lobbies.listViewerLobbies,
    isAuthenticated ? { limit: 5 } : "skip",
  );

  if (isLoading) {
    return <HomeLoading />;
  }

  if (!isAuthenticated) {
    return <SignedOutHome />;
  }

  if (viewer === undefined || recentLobbies === undefined) {
    return <HomeLoading />;
  }

  return <AuthenticatedHome recentLobbies={recentLobbies} viewer={viewer} />;
}
