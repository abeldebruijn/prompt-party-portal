"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Loader2Icon, SparklesIcon } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { SurfaceCard, SurfaceCardTitle } from "@/components/ui/surface-card";
import { api, type Id } from "@/lib/convex";
import { LobbyInput, LobbyTextarea } from "./lobby-ui";

type SetupSnapshot = FunctionReturnType<typeof api.feedItForward.getSetupState>;

export function FeedItForwardSetupCard({
  lobbyId,
  isHost,
  pendingAction,
  runAction,
}: {
  lobbyId: Id<"lobbies">;
  isHost: boolean;
  pendingAction: string | null;
  runAction: (
    actionKey: string,
    operation: () => Promise<void>,
  ) => Promise<void>;
}) {
  const snapshot = useQuery(api.feedItForward.getSetupState, { lobbyId });
  const updateSettings = useMutation(api.feedItForward.updateSettings);
  const generateSetupPrompt = useAction(
    api.feedItForwardNode.generateSetupPrompt,
  );
  const generateSetupImage = useAction(
    api.feedItForwardNode.generateSetupImage,
  );

  if (snapshot === undefined) {
    return (
      <SurfaceCard>
        <Loader2Icon className="size-5 animate-spin text-primary" />
      </SurfaceCard>
    );
  }

  return (
    <SurfaceCard>
      <SurfaceCardTitle className="text-2xl">
        Feed It Forward setup
      </SurfaceCardTitle>
      <p className="mt-3 text-sm leading-6 text-foreground/75">
        Each player seeds impossible scenes, then those images get passed around
        the circle for everyone else to describe.
      </p>

      {isHost ? (
        <HostSettings
          lobbyId={lobbyId}
          pendingAction={pendingAction}
          runAction={runAction}
          setupPromptCount={snapshot.settings.setupPromptCount}
          totalRounds={snapshot.settings.totalRounds}
          roundDurationSeconds={snapshot.settings.roundDurationSeconds}
          updateSettings={updateSettings}
        />
      ) : null}

      <div className="mt-6 rounded-3xl border border-foreground/10 bg-background/70 p-5">
        <p className="text-sm font-medium text-foreground/80">Setup progress</p>
        <div className="mt-3 space-y-2">
          {snapshot.players.map((player: SetupSnapshot["players"][number]) => (
            <div
              key={player.playerId}
              className="flex items-center justify-between gap-3 rounded-2xl border border-foreground/10 px-3 py-2 text-sm"
            >
              <span>{player.displayName}</span>
              <span className="font-mono text-foreground/65">
                {player.completedSlotCount}/{snapshot.settings.setupPromptCount}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {snapshot.viewerSlots.map(
          (slot: SetupSnapshot["viewerSlots"][number]) => (
            <SetupSlotCard
              key={slot.slotIndex}
              lobbyId={lobbyId}
              slot={slot}
              pendingAction={pendingAction}
              runAction={runAction}
              generateSetupPrompt={generateSetupPrompt}
              generateSetupImage={generateSetupImage}
            />
          ),
        )}
      </div>
    </SurfaceCard>
  );
}

function HostSettings({
  lobbyId,
  pendingAction,
  runAction,
  setupPromptCount,
  totalRounds,
  roundDurationSeconds,
  updateSettings,
}: {
  lobbyId: Id<"lobbies">;
  pendingAction: string | null;
  runAction: (
    actionKey: string,
    operation: () => Promise<void>,
  ) => Promise<void>;
  setupPromptCount: number;
  totalRounds: number;
  roundDurationSeconds: number;
  updateSettings: (args: {
    lobbyId: Id<"lobbies">;
    setupPromptCount: number;
    roundDurationSeconds: number;
  }) => Promise<unknown>;
}) {
  return (
    <div className="mt-6 grid gap-4 md:grid-cols-3">
      <label className="space-y-2" htmlFor="fitf-setup-count">
        <span className="text-sm font-medium text-foreground/80">
          Setup prompts/player
        </span>
        <LobbyInput
          id="fitf-setup-count"
          defaultValue={String(setupPromptCount)}
          inputMode="numeric"
          min={1}
          max={6}
          onBlur={(event) =>
            void runAction("fitf-settings", async () => {
              await updateSettings({
                lobbyId,
                setupPromptCount: Number(event.target.value),
                roundDurationSeconds,
              });
            })
          }
          type="number"
        />
      </label>

      <label className="space-y-2" htmlFor="fitf-round-seconds">
        <span className="text-sm font-medium text-foreground/80">
          Round seconds
        </span>
        <LobbyInput
          id="fitf-round-seconds"
          defaultValue={String(roundDurationSeconds)}
          inputMode="numeric"
          min={15}
          max={180}
          onBlur={(event) =>
            void runAction("fitf-settings", async () => {
              await updateSettings({
                lobbyId,
                setupPromptCount,
                roundDurationSeconds: Number(event.target.value),
              });
            })
          }
          type="number"
        />
      </label>

      <div className="rounded-3xl border border-foreground/10 bg-background/70 px-4 py-3">
        <p className="text-sm font-medium text-foreground/80">Dynamic rounds</p>
        <p className="mt-2 font-mono text-2xl">{totalRounds}</p>
        <p className="mt-1 text-xs text-foreground/65">
          Based on players × pass count
        </p>
      </div>

      {pendingAction === "fitf-settings" ? (
        <p className="text-sm text-foreground/65">Saving setup...</p>
      ) : null}
    </div>
  );
}

function SetupSlotCard({
  lobbyId,
  slot,
  pendingAction,
  runAction,
  generateSetupPrompt,
  generateSetupImage,
}: {
  lobbyId: Id<"lobbies">;
  slot: SetupSnapshot["viewerSlots"][number];
  pendingAction: string | null;
  runAction: (
    actionKey: string,
    operation: () => Promise<void>,
  ) => Promise<void>;
  generateSetupPrompt: () => Promise<{ prompt: string }>;
  generateSetupImage: (args: {
    lobbyId: Id<"lobbies">;
    slotIndex: number;
    prompt: string;
  }) => Promise<unknown>;
}) {
  const actionKey = `fitf-slot:${slot.slotIndex}`;
  return (
    <div className="rounded-3xl border border-foreground/10 bg-background/75 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium text-foreground">
            Setup slot #{slot.slotIndex + 1}
          </p>
          <p className="text-sm text-foreground/65">
            {slot.finalizedAt ? "Finalized" : slot.status}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-4 md:flex-row md:flex-wrap md:items-start">
        <div className="min-w-0 md:min-w-[24rem] md:flex-1">
          <LobbyTextarea
            defaultValue={slot.prompt}
            id={`fitf-slot-${slot.slotIndex}`}
            placeholder="Generate or write an impossible scene."
          />

          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              className="rounded-full"
              disabled={pendingAction === `${actionKey}:text`}
              onClick={() =>
                void runAction(`${actionKey}:text`, async () => {
                  const result = await generateSetupPrompt();
                  const element = document.getElementById(
                    `fitf-slot-${slot.slotIndex}`,
                  ) as HTMLTextAreaElement | null;

                  if (element) {
                    element.value = result.prompt;
                  }
                })
              }
              type="button"
              variant="outline"
            >
              <SparklesIcon className="size-4" />
              Generate prompt
            </Button>

            <Button
              className="rounded-full"
              disabled={pendingAction === `${actionKey}:image`}
              onClick={() =>
                void runAction(`${actionKey}:image`, async () => {
                  const element = document.getElementById(
                    `fitf-slot-${slot.slotIndex}`,
                  ) as HTMLTextAreaElement | null;

                  await generateSetupImage({
                    lobbyId,
                    slotIndex: slot.slotIndex,
                    prompt: element?.value ?? "",
                  });
                })
              }
              type="button"
            >
              Generate image
            </Button>
          </div>
        </div>

        {slot.imageUrl ? (
          <div className="overflow-hidden rounded-3xl border border-foreground/10 md:ml-auto md:w-80 md:max-w-full md:flex-none">
            <Image
              alt={`Setup slot ${slot.slotIndex + 1}`}
              className="aspect-square w-full object-cover"
              height={320}
              src={slot.imageUrl}
              width={320}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
