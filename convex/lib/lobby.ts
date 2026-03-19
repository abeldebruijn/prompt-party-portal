import { v } from "convex/values";

export const DEPRECATED_IMAGE_GENERATION_GAME_NAME =
  "Generate image that fits" as const;
export const IMAGE_GAME_NAME = "Pick image that suits a situation" as const;
export const TEXT_GAME_NAME = "Pick text that suits a situation" as const;
export const FEED_IT_FORWARD_GAME_NAME = "Feed It Forward" as const;
export const PLACEHOLDER_GAMES = [
  IMAGE_GAME_NAME,
  TEXT_GAME_NAME,
  FEED_IT_FORWARD_GAME_NAME,
] as const;
export const DEFAULT_LOBBY_GAME = IMAGE_GAME_NAME;
export const DEFAULT_TEXT_GAME_ROUND_COUNT = 10;
export const MAX_TEXT_GAME_ROUND_COUNT = 20;
export const DEFAULT_FEED_IT_FORWARD_SETUP_PROMPTS = 2;
export const MAX_FEED_IT_FORWARD_SETUP_PROMPTS = 6;
export const DEFAULT_FEED_IT_FORWARD_ROUND_DURATION_SECONDS = 60;
export const MIN_FEED_IT_FORWARD_ROUND_DURATION_SECONDS = 15;
export const MAX_FEED_IT_FORWARD_ROUND_DURATION_SECONDS = 180;

export const LOBBY_STATES = ["Creation", "Playing", "Completion"] as const;

export const AI_PERSONALITY_TYPES = [
  "roasting",
  "complimenting",
  "custom",
] as const;

export type PlaceholderGame = (typeof PLACEHOLDER_GAMES)[number];
export type LobbyState = (typeof LOBBY_STATES)[number];
export type AiPersonalityType = (typeof AI_PERSONALITY_TYPES)[number];

export const lobbyGameValidator = v.union(
  v.literal(IMAGE_GAME_NAME),
  v.literal(TEXT_GAME_NAME),
  v.literal(FEED_IT_FORWARD_GAME_NAME),
);

export const lobbyStateValidator = v.union(
  v.literal("Creation"),
  v.literal("Playing"),
  v.literal("Completion"),
);

export const aiPersonalityTypeValidator = v.union(
  v.literal("roasting"),
  v.literal("complimenting"),
  v.literal("custom"),
);

const JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ADJECTIVES = [
  "Bouncy",
  "Cheeky",
  "Cosmic",
  "Dizzy",
  "Electric",
  "Fizzy",
  "Glitter",
  "Jazzy",
  "Mischief",
  "Nibble",
  "Peppy",
  "Quirky",
  "Sassy",
  "Snazzy",
  "Spicy",
  "Zippy",
] as const;
const NOUNS = [
  "Badger",
  "Banana",
  "Comet",
  "Dolphin",
  "Ferret",
  "Flamingo",
  "Giraffe",
  "Koala",
  "Lobster",
  "Muffin",
  "Otter",
  "Pancake",
  "Parrot",
  "Pickle",
  "Rocket",
  "Wombat",
] as const;

export function normalizeJoinCode(joinCode: string) {
  return joinCode
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

export function sanitizeUsername(username: string) {
  const trimmed = username.trim().replace(/\s+/g, " ");
  return trimmed.slice(0, 32);
}

export function sanitizeSummary(summary: string) {
  return summary.trim().replace(/\s+/g, " ").slice(0, 240);
}

export function sanitizeTextGameAnswer(answer: string) {
  return answer.trim().replace(/\s+/g, " ").slice(0, 160);
}

export function sanitizeImageGamePrompt(prompt: string) {
  return prompt.trim().replace(/\s+/g, " ").slice(0, 240);
}

export function sanitizeFeedItForwardPrompt(prompt: string) {
  return prompt.trim().replace(/\s+/g, " ").slice(0, 240);
}

export function deriveJoinCode(seed: string, attempt = 0) {
  return buildToken(`${seed}:${attempt}:join`, JOIN_CODE_ALPHABET, 6);
}

export function generateFunnyUsername(seed: string) {
  const adjective =
    ADJECTIVES[stableHash(`${seed}:adjective`) % ADJECTIVES.length];
  const noun = NOUNS[stableHash(`${seed}:noun`) % NOUNS.length];
  const suffix = ((stableHash(`${seed}:suffix`) % 90) + 10).toString();
  return `${adjective}${noun}${suffix}`;
}

function buildToken(seed: string, alphabet: string, length: number) {
  let value = stableHash(seed);
  let token = "";

  for (let index = 0; index < length; index += 1) {
    value = Math.imul(value ^ (index + 1), 16777619) >>> 0;
    token += alphabet[value % alphabet.length];
  }

  return token;
}

function stableHash(input: string) {
  let hash = 2166136261;

  for (const character of input) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}
