import type { Doc } from "@/lib/convex";

export const AI_PERSONALITY_OPTIONS = [
  {
    label: "Roasting",
    value: "roasting",
    description: "Playful trash-talk energy for a spicy table presence.",
  },
  {
    label: "Complimenting",
    value: "complimenting",
    description: "Cheerful hype-bot energy for a sweeter lobby vibe.",
  },
  {
    label: "Custom",
    value: "custom",
    description: "Bring your own one-line personality prompt.",
  },
] as const;

export function normalizeJoinCodeInput(joinCode: string) {
  return joinCode
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

export function getLobbyStateCopy(state: string) {
  switch (state) {
    case "Creation":
      return "Choose a game, tune the roster, and get everyone ready.";
    case "Playing":
      return "The lobby is in a round. Late joiners can still drop in.";
    case "Completion":
      return "The round is done. Celebrate the leaderboard and reset when ready.";
    default:
      return "Manage your prompt party lobby.";
  }
}

export function buildPlaceholderLeaderboard(
  players: Array<Doc<"lobbyPlayers">>,
) {
  return players.map((player, index) => ({
    playerId: player._id,
    displayName: player.displayName,
    rank: index + 1,
    score: Math.max(18, 100 - index * 14),
    note:
      index === 0
        ? "MVP"
        : player.kind === "ai"
          ? "AI guest energy"
          : "Strong crowd chemistry",
  }));
}
