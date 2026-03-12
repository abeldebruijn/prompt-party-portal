import { v } from "convex/values";

export const PLACEHOLDER_GAMES = [
  "Generate image that fits",
  "Pick image that suits a situation",
  "Pick text that suits a situation",
] as const;
export const TEXT_GAME_NAME = "Pick text that suits a situation" as const;
export const DEFAULT_TEXT_GAME_ROUND_COUNT = 10;
export const MAX_TEXT_GAME_ROUND_COUNT = 20;

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
  v.literal("Generate image that fits"),
  v.literal("Pick image that suits a situation"),
  v.literal("Pick text that suits a situation"),
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
