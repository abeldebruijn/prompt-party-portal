"use client";

import { useMutation } from "convex/react";
import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { SurfaceCard, SurfaceCardTitle } from "@/components/ui/surface-card";
import { api } from "@/lib/convex";
import { normalizeJoinCodeInput } from "@/lib/lobby-ui";
import { LobbyInput } from "./lobby-ui";

export function JoinLobbyCard({
  disabled,
  onBusyChange,
}: {
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const router = useRouter();
  const joinLobbyByCode = useMutation(api.lobbies.joinLobbyByCode);

  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  const normalizedJoinCode = useMemo(
    () => normalizeJoinCodeInput(joinCode),
    [joinCode],
  );

  async function handleJoinLobby(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (normalizedJoinCode.length !== 6 || disabled || isJoining) {
      return;
    }

    onBusyChange(true);
    setIsJoining(true);
    setJoinError(null);

    try {
      const result = await joinLobbyByCode({ joinCode: normalizedJoinCode });
      router.push(`/lobby/${result.lobbyId}`);
    } catch (error) {
      onBusyChange(false);
      setIsJoining(false);
      setJoinError(
        error instanceof Error ? error.message : "Could not join that lobby.",
      );
    }
  }

  return (
    <SurfaceCard>
      <SurfaceCardTitle className="mt-4">
        Join into an active room
      </SurfaceCardTitle>
      <p className="mt-4 text-sm leading-6 text-foreground/75 sm:text-base">
        Playing lobbies still accept late joiners.
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
          disabled={normalizedJoinCode.length !== 6 || disabled || isJoining}
          type="submit"
        >
          {isJoining ? (
            <>
              <Loader2Icon className="size-4 animate-spin" />
              Joining lobby...
            </>
          ) : (
            "Join lobby"
          )}
        </Button>

        {joinError ? (
          <p className="text-sm leading-6 text-destructive">{joinError}</p>
        ) : null}
      </form>
    </SurfaceCard>
  );
}
