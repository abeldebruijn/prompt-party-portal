"use client";

import { useConvexAuth, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/convex";

import { CreateLobbyCard } from "./_components/create-lobby-card";
import { JoinLobbyCard } from "./_components/join-lobby-card";
import { LobbyHubLoading } from "./_components/lobby-hub-loading";
import { SignedOutPrompt } from "./_components/signed-out-prompt";
import { SurfaceCard, SurfaceCardTitle } from "@/components/ui/surface-card";

export default function LobbyHubPage() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const viewer = useQuery(api.users.viewer, isAuthenticated ? {} : "skip");
  const games = useQuery(
    api.lobbies.listAvailableGames,
    isAuthenticated ? {} : "skip",
  );

  const [isBusy, setIsBusy] = useState(false);

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
      <section className="grid gap-6">
        <SurfaceCard>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Badge className="rounded-full border border-foreground/15 bg-background/75 px-3 py-1 font-mono text-[0.7rem] tracking-[0.24em] text-foreground/70 uppercase hover:bg-background/75">
              Lobby hub
            </Badge>

            <Button
              asChild
              className="rounded-full block md:hidden"
              size="sm"
              variant="outline"
            >
              <Link href="/">Back home</Link>
            </Button>
          </div>

          <SurfaceCardTitle className="mt-5 text-5xl sm:text-6xl">
            Create a room or jump in by code.
          </SurfaceCardTitle>

          <p className="mt-5 max-w-2xl text-base leading-7 text-foreground/85 sm:text-lg sm:leading-8">
            Hosts choose a game, players join with a 6-character code.
          </p>
        </SurfaceCard>

        <JoinLobbyCard disabled={isBusy} onBusyChange={setIsBusy} />

        <CreateLobbyCard
          canCreateLobby={viewer?.canCreateLobby ?? false}
          disabled={isBusy}
          games={games ?? []}
          onBusyChange={setIsBusy}
        />
      </section>
    </main>
  );
}
