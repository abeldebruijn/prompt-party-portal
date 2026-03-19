"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  BotIcon,
  ChevronLeft,
  CrownIcon,
  Loader2Icon,
  PartyPopperIcon,
  SparklesIcon,
  SwordsIcon,
  TrophyIcon,
  UserRoundCogIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { SubmissionProgressList } from "@/components/game/submission-progress-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { api, type Id } from "@/lib/convex";
import {
  AI_PERSONALITY_OPTIONS,
  buildPlaceholderLeaderboard,
} from "@/lib/lobby-ui";
import { cn } from "@/lib/utils";

type LobbySnapshot = FunctionReturnType<typeof api.lobbies.getLobby>;
type LobbyPlayer = LobbySnapshot["players"][number];
type LobbyViewer = NonNullable<LobbySnapshot["viewer"]>;
type LobbyVoteSummary = LobbySnapshot["voteSummary"][number];
type LobbyGame = LobbySnapshot["lobby"]["selectedGame"];
type AiPersonality = (typeof AI_PERSONALITY_OPTIONS)[number]["value"];

import { SurfaceCard, SurfaceCardTitle } from "@/components/ui/surface-card";
import { FeedItForwardSetupCard } from "../_components/feed-it-forward-setup-card";
import {
  LobbyInput,
  LobbySelect,
  LobbyTextarea,
} from "../_components/lobby-ui";

function LobbyLoading() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-10 sm:px-6 lg:px-8">
      <SurfaceCard className="w-full text-center">
        <Loader2Icon className="mx-auto size-6 animate-spin text-primary" />
        <SurfaceCardTitle className="mt-5">
          Loading your lobby...
        </SurfaceCardTitle>
        <p className="mt-3 text-sm leading-6 text-foreground/70 sm:text-base">
          Pulling the live roster, selected game, and room state from Convex.
        </p>
      </SurfaceCard>
    </main>
  );
}

function SignedOutRoomPrompt() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-4 py-10 sm:px-6 lg:px-8">
      <SurfaceCard className="w-full">
        <Badge className="rounded-full border border-foreground/15 bg-background/75 px-3 py-1 font-mono text-[0.7rem] tracking-[0.24em] text-foreground/70 uppercase hover:bg-background/75">
          Lobby access required
        </Badge>
        <SurfaceCardTitle className="mt-5 text-5xl">
          Sign in to keep managing this lobby.
        </SurfaceCardTitle>
        <p className="mt-4 max-w-2xl text-base leading-7 text-foreground/80 sm:text-lg sm:leading-8">
          Your lobby membership is tied to your active account session. Re-open
          auth, then come back here to continue.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild className="rounded-full px-6">
            <Link href="/auth">Open auth</Link>
          </Button>
          <Button asChild className="rounded-full px-6" variant="outline">
            <Link href="/lobby">
              <ChevronLeft className="size-4" /> Back to lobby hub
            </Link>
          </Button>
        </div>
      </SurfaceCard>
    </main>
  );
}

function describePlayer(player: LobbyPlayer, isViewer: boolean) {
  if (player.kind === "ai") {
    const option = AI_PERSONALITY_OPTIONS.find(
      (entry) => entry.value === player.aiPersonalityType,
    );

    return option?.label ?? "AI player";
  }

  if (player.isHost) {
    return isViewer ? "You are the host" : "Host";
  }

  if (player.joinedDuringState === "Playing") {
    return isViewer ? "You joined during play" : "Joined during play";
  }

  return isViewer ? "You are in the room" : "Player";
}

function PlayerList({
  pendingAction,
  players,
  viewerPlayerId,
  canKick,
  onKick,
}: {
  pendingAction: string | null;
  players: LobbySnapshot["players"];
  viewerPlayerId: LobbyViewer["playerId"];
  canKick: boolean;
  onKick: (playerId: LobbyPlayer["_id"]) => Promise<void>;
}) {
  return (
    <div className="space-y-2">
      {players.map((player) => {
        const isViewer = player._id === viewerPlayerId;

        return (
          <div
            key={player._id}
            className={cn(
              "rounded-2xl border px-4 py-3",
              isViewer
                ? "border-primary/30 bg-primary/10 shadow-sm shadow-primary/5"
                : "border-foreground/10 bg-background/70",
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-base font-semibold text-foreground">
                    {player.displayName}
                  </p>
                  {player.isHost ? (
                    <Badge className="rounded-full border border-foreground/15 bg-background/75 px-2.5 py-1 text-[0.65rem] uppercase tracking-[0.18em] text-foreground/70 hover:bg-background/75">
                      <CrownIcon className="size-3.5" />
                      Host
                    </Badge>
                  ) : null}
                  {player.kind === "ai" ? (
                    <Badge className="rounded-full border border-foreground/15 bg-background/75 px-2.5 py-1 text-[0.65rem] uppercase tracking-[0.18em] text-foreground/70 hover:bg-background/75">
                      AI
                    </Badge>
                  ) : null}
                </div>

                <p className="mt-1 text-sm leading-6 text-foreground/70">
                  {describePlayer(player, isViewer)}
                </p>

                {player.kind === "ai" &&
                player.aiPersonalityType === "custom" &&
                player.aiCustomPrompt ? (
                  <p className="mt-0.5 text-sm leading-6 text-foreground/65">
                    Personality: {player.aiCustomPrompt}
                  </p>
                ) : null}
              </div>

              {canKick && !player.isHost ? (
                <Button
                  className="rounded-full"
                  disabled={pendingAction === `kick:${player._id}`}
                  onClick={() => void onKick(player._id)}
                  size="sm"
                  variant="outline"
                >
                  {pendingAction === `kick:${player._id}` ? (
                    <>
                      <Loader2Icon className="size-4 animate-spin" />
                      Removing...
                    </>
                  ) : (
                    "Kick"
                  )}
                </Button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GameVoteGrid({
  isHost,
  pendingAction,
  selectedGame,
  voteSummary,
  viewerVote,
  onSelectGame,
  onVote,
}: {
  isHost: boolean;
  pendingAction: string | null;
  selectedGame: LobbyGame;
  voteSummary: LobbyVoteSummary[];
  viewerVote?: LobbyGame;
  onSelectGame: (game: LobbyGame) => Promise<void>;
  onVote: (game: LobbyGame) => Promise<void>;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {voteSummary.map((entry) => {
        const isSelected = selectedGame === entry.game;
        const isViewerVote = viewerVote === entry.game;

        return (
          <div
            key={entry.game}
            className={cn(
              "flex h-full flex-col rounded-3xl border bg-background/75 p-4",
              isSelected
                ? "border-primary/30 shadow-lg shadow-primary/10"
                : "border-foreground/10",
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-sm leading-6 text-foreground/90">
                {entry.game}
              </p>
              {isSelected ? (
                <Badge className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[0.65rem] uppercase tracking-[0.18em] text-foreground hover:bg-primary/10">
                  Active
                </Badge>
              ) : null}
            </div>

            <p className="mt-4 text-sm leading-6 text-foreground/65">
              Advisory votes: {entry.count}
              {isViewerVote ? " · Your vote" : ""}
            </p>

            <Button
              className="mt-4 rounded-full"
              disabled={
                pendingAction === `${isHost ? "select" : "vote"}:${entry.game}`
              }
              onClick={() =>
                void (isHost ? onSelectGame(entry.game) : onVote(entry.game))
              }
              size="sm"
              variant={isSelected ? "default" : "outline"}
            >
              {pendingAction ===
              `${isHost ? "select" : "vote"}:${entry.game}` ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" />
                  Saving...
                </>
              ) : isHost ? (
                isSelected ? (
                  "Selected"
                ) : (
                  "Make active"
                )
              ) : isViewerVote ? (
                "Voted"
              ) : (
                "Vote for this"
              )}
            </Button>
          </div>
        );
      })}
    </div>
  );
}

export default function LobbyRoomPage() {
  const params = useParams<{ lobbyId: string }>();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const router = useRouter();
  const lobbyId = params.lobbyId as Id<"lobbies">;
  const snapshot = useQuery(
    api.lobbies.getLobby,
    isAuthenticated ? { lobbyId } : "skip",
  );
  const updateUsername = useMutation(api.users.updateUsername);
  const selectGame = useMutation(api.lobbies.selectGame);
  const voteForGame = useMutation(api.lobbies.voteForGame);
  const addAiPlayer = useMutation(api.lobbies.addAiPlayer);
  const kickPlayer = useMutation(api.lobbies.kickPlayer);
  const pokePlayer = useMutation(api.lobbies.pokePlayer);
  const startRound = useMutation(api.lobbies.startRound);
  const completeLobby = useMutation(api.lobbies.completeLobby);
  const resetLobby = useMutation(api.lobbies.resetLobby);
  const updateTextGameSettings = useMutation(api.textGame.updateSettings);
  const updateImageGameSettings = useMutation(api.imageGame.updateSettings);
  const startFeedItForward = useMutation(api.feedItForward.startGame);
  const startTextGame = useMutation(api.textGame.startGame);
  const startImageGame = useMutation(api.imageGame.startGame);

  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [aiNameDraft, setAiNameDraft] = useState("");
  const [aiPersonality, setAiPersonality] = useState<AiPersonality>("roasting");
  const [aiCustomPrompt, setAiCustomPrompt] = useState("");
  const [completionSummary, setCompletionSummary] = useState(
    "Round results are in — celebrate and reset for another lobby setup.",
  );
  const [textGameRoundCountDraft, setTextGameRoundCountDraft] = useState("10");

  const viewerPlayer = useMemo(() => {
    if (!snapshot?.viewer) {
      return null;
    }

    return (
      snapshot.players.find(
        (player) => player._id === snapshot.viewer?.playerId,
      ) ?? null
    );
  }, [snapshot]);

  const viewerVote = useMemo(() => {
    if (!snapshot?.viewer) {
      return undefined;
    }

    return snapshot.votes.find(
      (vote) => vote.playerId === snapshot.viewer?.playerId,
    )?.game;
  }, [snapshot]);

  useEffect(() => {
    if (viewerPlayer) {
      setUsernameDraft(viewerPlayer.displayName);
    }
  }, [viewerPlayer]);

  useEffect(() => {
    if (
      snapshot?.lobby.selectedGame === "Pick text that suits a situation" ||
      snapshot?.lobby.selectedGame === "Pick image that suits a situation"
    ) {
      setTextGameRoundCountDraft(String(snapshot.lobby.textGameRoundCount));
    }
  }, [snapshot?.lobby.selectedGame, snapshot?.lobby.textGameRoundCount]);

  useEffect(() => {
    if (
      snapshot?.lobby.selectedGame === "Pick text that suits a situation" &&
      snapshot.lobby.state !== "Creation"
    ) {
      router.replace(`/game/text-game/${lobbyId}`);
    }
  }, [lobbyId, router, snapshot?.lobby.selectedGame, snapshot?.lobby.state]);

  useEffect(() => {
    if (
      snapshot?.lobby.selectedGame === "Pick image that suits a situation" &&
      snapshot.lobby.state !== "Creation"
    ) {
      router.replace(`/game/image-game/${lobbyId}`);
    }
  }, [lobbyId, router, snapshot?.lobby.selectedGame, snapshot?.lobby.state]);

  useEffect(() => {
    if (
      snapshot?.lobby.selectedGame === "Feed It Forward" &&
      snapshot.lobby.state !== "Creation"
    ) {
      router.replace(`/game/feed-it-forward/${lobbyId}`);
    }
  }, [lobbyId, router, snapshot?.lobby.selectedGame, snapshot?.lobby.state]);

  async function runAction(actionKey: string, operation: () => Promise<void>) {
    setPendingAction(actionKey);
    setActionError(null);

    try {
      await operation();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "That lobby action could not be completed.",
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function handleUsernameSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await runAction("username", async () => {
      await updateUsername({ username: usernameDraft });
    });
  }

  async function handleAddAiPlayer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await runAction("add-ai", async () => {
      await addAiPlayer({
        lobbyId,
        displayName: aiNameDraft || undefined,
        personalityType: aiPersonality,
        customPrompt: aiPersonality === "custom" ? aiCustomPrompt : undefined,
      });
      setAiNameDraft("");
      setAiCustomPrompt("");
      setAiPersonality("roasting");
    });
  }

  if (isLoading || (isAuthenticated && snapshot === undefined)) {
    return <LobbyLoading />;
  }

  if (!isAuthenticated) {
    return <SignedOutRoomPrompt />;
  }

  if (!snapshot || !snapshot.viewer || !viewerPlayer) {
    return <LobbyLoading />;
  }

  const isHost = snapshot.viewer.isHost;
  const canKickPlayers = isHost && snapshot.lobby.state === "Creation";
  const isTextGame =
    snapshot.lobby.selectedGame === "Pick text that suits a situation";
  const isImageGame =
    snapshot.lobby.selectedGame === "Pick image that suits a situation";
  const isFeedItForward = snapshot.lobby.selectedGame === "Feed It Forward";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col justify-center px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-6 xl:hidden">
        <SurfaceCard className="flex flex-col items-center justify-center p-6 sm:p-8">
          <p className="font-mono text-xs tracking-[0.25em] text-foreground/60 uppercase">
            Lobby Code
          </p>
          <p className="mt-3 font-mono text-5xl font-bold uppercase tracking-[0.2em] text-foreground">
            {snapshot.lobby.joinCode}
          </p>
        </SurfaceCard>
      </div>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr] xl:items-start xl:gap-8">
        <div className="space-y-6">
          <SurfaceCard>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-foreground/70">Current game:</span>
            </div>

            <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
              <div>
                <SurfaceCardTitle className="text-3xl sm:text-4xl">
                  {snapshot.lobby.selectedGame}
                </SurfaceCardTitle>
              </div>
            </div>

            {actionError ? (
              <p className="mt-6 text-sm leading-6 text-destructive">
                {actionError}
              </p>
            ) : null}
          </SurfaceCard>

          <SurfaceCard>
            <div>
              <div className="mt-4 flex items-start gap-3">
                {snapshot.lobby.state === "Creation" ? (
                  <SparklesIcon className="text-primary size-6" />
                ) : snapshot.lobby.state === "Playing" ? (
                  <SwordsIcon className="text-primary size-6" />
                ) : (
                  <TrophyIcon className="text-primary size-6" />
                )}
                <h2 className="font-display text-2xl leading-none text-foreground">
                  {snapshot.lobby.state === "Creation"
                    ? "Tune the setup before you start."
                    : snapshot.lobby.state === "Playing"
                      ? "Round in progress."
                      : "Results are locked in."}
                </h2>
              </div>
            </div>

            {snapshot.lobby.state === "Creation" ? (
              <div className="mt-6 space-y-6">
                <p className="text-sm leading-6 text-foreground/75 sm:text-base">
                  {isHost
                    ? "Choose the active game for this session. Everyone else can still cast advisory votes."
                    : "Vote for the game you want. The host still chooses the final active game."}
                </p>

                <GameVoteGrid
                  isHost={isHost}
                  onSelectGame={(game) =>
                    runAction(`select:${game}`, async () => {
                      await selectGame({ lobbyId, game });
                    })
                  }
                  onVote={(game) =>
                    runAction(`vote:${game}`, async () => {
                      await voteForGame({ lobbyId, game });
                    })
                  }
                  pendingAction={pendingAction}
                  selectedGame={snapshot.lobby.selectedGame}
                  viewerVote={viewerVote}
                  voteSummary={snapshot.voteSummary}
                />

                {isFeedItForward ? (
                  <FeedItForwardSetupCard
                    isHost={isHost}
                    lobbyId={lobbyId}
                    pendingAction={pendingAction}
                    runAction={runAction}
                  />
                ) : null}

                {isHost ? (
                  <div className="space-y-4">
                    {isTextGame ? (
                      <label
                        className="block max-w-xs space-y-2"
                        htmlFor="text-game-round-count"
                      >
                        <span className="text-sm font-medium text-foreground/80">
                          Text game rounds
                        </span>
                        <div className="flex items-center gap-3">
                          <LobbyInput
                            id="text-game-round-count"
                            inputMode="numeric"
                            onChange={(event) =>
                              setTextGameRoundCountDraft(event.target.value)
                            }
                            type="number"
                            min={1}
                            max={20}
                            value={textGameRoundCountDraft}
                          />
                          <Button
                            className="rounded-full px-5"
                            disabled={pendingAction === "text-settings"}
                            onClick={() =>
                              void runAction("text-settings", async () => {
                                await updateTextGameSettings({
                                  lobbyId,
                                  roundCount: Number(textGameRoundCountDraft),
                                });
                              })
                            }
                            type="button"
                            variant="outline"
                          >
                            {pendingAction === "text-settings" ? (
                              <>
                                <Loader2Icon className="size-4 animate-spin" />
                                Saving...
                              </>
                            ) : (
                              "Save"
                            )}
                          </Button>
                        </div>
                      </label>
                    ) : isImageGame ? (
                      <label
                        className="block max-w-xs space-y-2"
                        htmlFor="image-game-round-count"
                      >
                        <span className="text-sm font-medium text-foreground/80">
                          Image game rounds
                        </span>
                        <div className="flex items-center gap-3">
                          <LobbyInput
                            id="image-game-round-count"
                            inputMode="numeric"
                            onChange={(event) =>
                              setTextGameRoundCountDraft(event.target.value)
                            }
                            type="number"
                            min={1}
                            max={20}
                            value={textGameRoundCountDraft}
                          />
                          <Button
                            className="rounded-full px-5"
                            disabled={pendingAction === "image-settings"}
                            onClick={() =>
                              void runAction("image-settings", async () => {
                                await updateImageGameSettings({
                                  lobbyId,
                                  roundCount: Number(textGameRoundCountDraft),
                                });
                              })
                            }
                            type="button"
                            variant="outline"
                          >
                            {pendingAction === "image-settings" ? (
                              <>
                                <Loader2Icon className="size-4 animate-spin" />
                                Saving...
                              </>
                            ) : (
                              "Save"
                            )}
                          </Button>
                        </div>
                      </label>
                    ) : null}

                    <Button
                      className="rounded-full px-6"
                      disabled={pendingAction === "start"}
                      onClick={() =>
                        void runAction("start", async () => {
                          if (isTextGame) {
                            await startTextGame({ lobbyId });
                            return;
                          }

                          if (isImageGame) {
                            await startImageGame({ lobbyId });
                            return;
                          }

                          if (isFeedItForward) {
                            await startFeedItForward({ lobbyId });
                            return;
                          }

                          await startRound({ lobbyId });
                        })
                      }
                    >
                      {pendingAction === "start" ? (
                        <>
                          <Loader2Icon className="size-4 animate-spin" />
                          Starting...
                        </>
                      ) : isTextGame ? (
                        "Start text game"
                      ) : isImageGame ? (
                        "Start image game"
                      ) : isFeedItForward ? (
                        "Start Feed It Forward"
                      ) : (
                        "Start round"
                      )}
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {snapshot.lobby.state === "Playing" ? (
              <div className="mt-6 space-y-6">
                <div className="rounded-3xl border border-foreground/10 bg-background/70 p-5">
                  <p className="text-sm leading-6 text-foreground/80">
                    This room is intentionally showing gameplay only. The
                    selected title stays visible, the roster keeps updating, and
                    the host can trigger a mock completion leaderboard when
                    everyone is ready.
                  </p>
                </div>

                {isHost ? (
                  <div className="space-y-4">
                    {snapshot.submissionProgress ? (
                      <div className="rounded-3xl border border-foreground/10 bg-background/70 p-5">
                        <div className="flex items-center gap-3">
                          <UsersIcon className="size-5 text-primary" />
                          <h3 className="text-lg font-semibold text-foreground">
                            Submission progress
                          </h3>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-foreground/70">
                          Pending players can be poked to help move the round
                          along.
                        </p>
                        <div className="mt-4">
                          <SubmissionProgressList
                            onPoke={(playerId) =>
                              void runAction(`poke:${playerId}`, async () => {
                                await pokePlayer({
                                  lobbyId,
                                  playerId: playerId as Id<"lobbyPlayers">,
                                });
                              })
                            }
                            pendingAction={pendingAction}
                            progress={snapshot.submissionProgress}
                            viewerPlayerId={snapshot.viewer.playerId}
                          />
                        </div>
                      </div>
                    ) : null}

                    <label
                      className="block space-y-2"
                      htmlFor="completion-summary"
                    >
                      <span className="text-sm font-medium text-foreground/80">
                        Completion summary
                      </span>
                      <LobbyTextarea
                        id="completion-summary"
                        onChange={(event) =>
                          setCompletionSummary(event.target.value)
                        }
                        placeholder="Add a playful summary for the leaderboard."
                        value={completionSummary}
                      />
                    </label>

                    <Button
                      className="rounded-full px-6"
                      disabled={pendingAction === "complete"}
                      onClick={() =>
                        void runAction("complete", async () => {
                          await completeLobby({
                            lobbyId,
                            leaderboard: buildPlaceholderLeaderboard(
                              snapshot.players,
                            ),
                            summary: completionSummary,
                          });
                        })
                      }
                      type="button"
                    >
                      {pendingAction === "complete" ? (
                        <>
                          <Loader2Icon className="size-4 animate-spin" />
                          Finishing...
                        </>
                      ) : (
                        <>
                          <PartyPopperIcon className="size-4" />
                          Finish round
                        </>
                      )}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {snapshot.submissionProgress ? (
                      <div className="rounded-3xl border border-foreground/10 bg-background/70 p-5">
                        <div className="flex items-center gap-3">
                          <UsersIcon className="size-5 text-primary" />
                          <h3 className="text-lg font-semibold text-foreground">
                            Submission progress
                          </h3>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-foreground/70">
                          Pending players can be poked, and your row will show
                          who nudged you last.
                        </p>
                        <div className="mt-4">
                          <SubmissionProgressList
                            onPoke={(playerId) =>
                              void runAction(`poke:${playerId}`, async () => {
                                await pokePlayer({
                                  lobbyId,
                                  playerId: playerId as Id<"lobbyPlayers">,
                                });
                              })
                            }
                            pendingAction={pendingAction}
                            progress={snapshot.submissionProgress}
                            viewerPlayerId={snapshot.viewer.playerId}
                          />
                        </div>
                      </div>
                    ) : null}

                    <p className="text-sm leading-6 text-foreground/75">
                      The host controls when this round moves to the completion
                      board. You can still stay synced with the roster in real
                      time.
                    </p>
                  </div>
                )}
              </div>
            ) : null}

            {snapshot.lobby.state === "Completion" && snapshot.completion ? (
              <div className="mt-6 space-y-6">
                <div className="rounded-3xl border border-foreground/10 bg-background/70 p-5">
                  <p className="text-sm leading-6 text-foreground/80">
                    {snapshot.completion.summary ??
                      "The leaderboard is ready. Celebrate the standings, then let the host reset the lobby."}
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  {snapshot.completion.leaderboard.map((entry) => (
                    <div
                      key={`${entry.rank}-${entry.displayName}`}
                      className={cn(
                        "rounded-3xl border bg-background/75 p-5",
                        entry.rank === 1
                          ? "border-primary/30 shadow-lg shadow-primary/10"
                          : "border-foreground/10",
                      )}
                    >
                      <p className="font-mono text-[0.7rem] tracking-[0.22em] text-foreground/60 uppercase">
                        Place #{entry.rank}
                      </p>
                      <h3 className="mt-3 text-xl font-semibold text-foreground">
                        {entry.displayName}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-foreground/70">
                        Score: {entry.score}
                      </p>
                      {entry.note ? (
                        <p className="mt-2 text-sm leading-6 text-foreground/65">
                          {entry.note}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>

                {isHost ? (
                  <Button
                    className="rounded-full px-6"
                    disabled={pendingAction === "reset"}
                    onClick={() =>
                      void runAction("reset", async () => {
                        await resetLobby({ lobbyId });
                      })
                    }
                  >
                    {pendingAction === "reset" ? (
                      <>
                        <Loader2Icon className="size-4 animate-spin" />
                        Resetting...
                      </>
                    ) : (
                      "Reset lobby to Creation"
                    )}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </SurfaceCard>

          <SurfaceCard>
            <div className="flex items-start gap-3">
              <UsersIcon className="text-primary" />
              <SurfaceCardTitle className="text-2xl">
                Everyone currently in the lobby.
              </SurfaceCardTitle>
            </div>

            <div className="mt-6">
              <PlayerList
                canKick={canKickPlayers}
                onKick={(playerId) =>
                  runAction(`kick:${playerId}`, async () => {
                    await kickPlayer({ lobbyId, playerId });
                  })
                }
                pendingAction={pendingAction}
                players={snapshot.players}
                viewerPlayerId={snapshot.viewer.playerId}
              />
            </div>
          </SurfaceCard>
        </div>

        <div className="space-y-6 xl:sticky xl:top-16">
          <SurfaceCard className="hidden xl:flex flex-col items-center justify-center p-6 sm:p-8">
            <p className="font-mono text-xs tracking-[0.25em] text-foreground/60 uppercase">
              Lobby Code
            </p>
            <p className="mt-3 font-mono text-5xl font-bold uppercase tracking-[0.2em] text-foreground">
              {snapshot.lobby.joinCode}
            </p>
          </SurfaceCard>

          <SurfaceCard>
            <div className="flex items-start gap-3">
              <UserRoundCogIcon className="text-primary" />
              <SurfaceCardTitle className="text-2xl">
                Edit your username.
              </SurfaceCardTitle>
            </div>

            <form className="mt-6 space-y-4" onSubmit={handleUsernameSubmit}>
              <label className="block space-y-2" htmlFor="viewer-username">
                <span className="text-sm font-medium text-foreground/80">
                  Display name
                </span>
                <LobbyInput
                  id="viewer-username"
                  onChange={(event) => setUsernameDraft(event.target.value)}
                  placeholder="Enter a lobby name"
                  value={usernameDraft}
                />
              </label>

              <Button
                className="rounded-full px-6"
                disabled={pendingAction === "username"}
                type="submit"
              >
                {pendingAction === "username" ? (
                  <>
                    <Loader2Icon className="size-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save username"
                )}
              </Button>
            </form>
          </SurfaceCard>

          {isHost ? (
            <SurfaceCard>
              <div className="flex items-start gap-3">
                <BotIcon className="text-primary" />
                <SurfaceCardTitle className="text-2xl">
                  Manage AI guests.
                </SurfaceCardTitle>
              </div>
              <p className="mt-4 text-sm leading-6 text-foreground/75 sm:text-base">
                AI personalities are stored in the roster only.
              </p>

              {snapshot.lobby.state === "Creation" ? (
                <form className="mt-6 space-y-4" onSubmit={handleAddAiPlayer}>
                  <label className="block space-y-2" htmlFor="ai-display-name">
                    <span className="text-sm font-medium text-foreground/80">
                      AI display name (optional)
                    </span>
                    <LobbyInput
                      id="ai-display-name"
                      onChange={(event) => setAiNameDraft(event.target.value)}
                      placeholder="Auto-generate a funny name"
                      value={aiNameDraft}
                    />
                  </label>

                  <label className="block space-y-2" htmlFor="ai-personality">
                    <span className="text-sm font-medium text-foreground/80">
                      Personality style
                    </span>
                    <LobbySelect
                      id="ai-personality"
                      onChange={(event) =>
                        setAiPersonality(event.target.value as AiPersonality)
                      }
                      value={aiPersonality}
                    >
                      {AI_PERSONALITY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </LobbySelect>
                  </label>

                  <p className="text-sm leading-6 text-foreground/65">
                    {
                      AI_PERSONALITY_OPTIONS.find(
                        (option) => option.value === aiPersonality,
                      )?.description
                    }
                  </p>

                  {aiPersonality === "custom" ? (
                    <label
                      className="block space-y-2"
                      htmlFor="ai-custom-prompt"
                    >
                      <span className="text-sm font-medium text-foreground/80">
                        Custom personality prompt
                      </span>
                      <LobbyTextarea
                        id="ai-custom-prompt"
                        onChange={(event) =>
                          setAiCustomPrompt(event.target.value)
                        }
                        placeholder="One sentence describing this AI guest's personality."
                        value={aiCustomPrompt}
                      />
                    </label>
                  ) : null}

                  <Button
                    className="rounded-full px-6"
                    disabled={pendingAction === "add-ai"}
                    type="submit"
                  >
                    {pendingAction === "add-ai" ? (
                      <>
                        <Loader2Icon className="size-4 animate-spin" />
                        Adding AI...
                      </>
                    ) : (
                      "Add AI player"
                    )}
                  </Button>
                </form>
              ) : (
                <div className="mt-6 rounded-3xl border border-foreground/10 bg-background/70 p-5 text-sm leading-6 text-foreground/80">
                  AI player management is locked once the lobby leaves Creation
                  state.
                </div>
              )}
            </SurfaceCard>
          ) : null}
        </div>
      </section>
    </main>
  );
}
