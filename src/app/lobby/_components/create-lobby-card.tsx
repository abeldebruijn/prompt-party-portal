"use client";

import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ArrowRightIcon, Loader2Icon, SparklesIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/convex";
import { LobbySelect } from "./lobby-ui";
import { SurfaceCard, SurfaceCardTitle } from "@/components/ui/surface-card";

type LobbyGame = FunctionReturnType<
  typeof api.lobbies.listAvailableGames
>[number];

export function CreateLobbyCard({
  disabled,
  onBusyChange,
  games,
  canCreateLobby,
}: {
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  games: readonly LobbyGame[];
  canCreateLobby: boolean;
}) {
  const router = useRouter();
  const createLobby = useMutation(api.lobbies.createLobby);

  const [selectedGame, setSelectedGame] = useState<LobbyGame | "">("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (!selectedGame && games?.[0]) {
      setSelectedGame(games[0]);
    }
  }, [games, selectedGame]);

  async function handleCreateLobby() {
    if (!selectedGame || disabled || isCreating) {
      return;
    }

    onBusyChange(true);
    setIsCreating(true);
    setCreateError(null);

    try {
      const result = await createLobby({ selectedGame });
      router.push(`/lobby/${result.lobbyId}`);
    } catch (error) {
      onBusyChange(false);
      setIsCreating(false);
      setCreateError(
        error instanceof Error
          ? error.message
          : "Could not create a lobby right now.",
      );
    }
  }

  return (
    <SurfaceCard>
      <SurfaceCardTitle className="mt-4">Host a game</SurfaceCardTitle>
      <p className="mt-4 text-sm leading-6 text-foreground/75 sm:text-base">
        Pick one of the games now. You can still swap it later before the
        session starts.
      </p>

      {canCreateLobby ? (
        <div className="mt-6 space-y-4">
          <label className="block space-y-2" htmlFor="create-lobby-game">
            <span className="text-sm font-medium text-foreground/80">Game</span>
            <LobbySelect
              disabled={disabled || isCreating || !games?.length}
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
            disabled={!selectedGame || disabled || isCreating}
            onClick={handleCreateLobby}
          >
            {isCreating ? (
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
            <p className="text-sm leading-6 text-destructive">{createError}</p>
          ) : null}
        </div>
      ) : (
        <div className="mt-6 rounded-3xl border border-foreground/10 bg-background/70 p-5">
          <p className="text-sm leading-6 text-foreground/80">
            Guest accounts can join lobbies, but only email/password accounts
            can create and host them.
          </p>
          <Button asChild className="mt-4 rounded-full" variant="outline">
            <Link href="/link-email">
              Add email account
              <ArrowRightIcon className="size-4" />
            </Link>
          </Button>
        </div>
      )}
    </SurfaceCard>
  );
}
