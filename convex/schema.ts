import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const schema = defineSchema({
  ...authTables,

  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),

  lobbies: defineTable({
    joinCode: v.string(),
    hostUserId: v.id("users"),
    selectedGame: v.union(
      v.literal("Generate image that fits"),
      v.literal("Pick image that suits a situation"),
      v.literal("Pick text that suits a situation"),
    ),
    state: v.union(
      v.literal("Creation"),
      v.literal("Playing"),
      v.literal("Completion"),
    ),
    textGameRoundCount: v.optional(v.number()),
    currentRound: v.number(),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    lastActivityAt: v.number(),
  })
    .index("joinCode", ["joinCode"])
    .index("hostUserId", ["hostUserId"]),

  lobbyPlayers: defineTable({
    lobbyId: v.id("lobbies"),
    userId: v.optional(v.id("users")),
    kind: v.union(v.literal("human"), v.literal("ai")),
    displayName: v.string(),
    isHost: v.boolean(),
    isActive: v.boolean(),
    joinedAt: v.number(),
    joinedDuringState: v.union(
      v.literal("Creation"),
      v.literal("Playing"),
      v.literal("Completion"),
    ),
    aiPersonalityType: v.optional(
      v.union(
        v.literal("roasting"),
        v.literal("complimenting"),
        v.literal("custom"),
      ),
    ),
    aiCustomPrompt: v.optional(v.string()),
    kickedAt: v.optional(v.number()),
    kickedByUserId: v.optional(v.id("users")),
  })
    .index("lobbyId", ["lobbyId"])
    .index("userId", ["userId"])
    .index("lobbyIdAndUserId", ["lobbyId", "userId"])
    .index("lobbyIdAndIsActive", ["lobbyId", "isActive"]),

  lobbyGameVotes: defineTable({
    lobbyId: v.id("lobbies"),
    playerId: v.id("lobbyPlayers"),
    game: v.union(
      v.literal("Generate image that fits"),
      v.literal("Pick image that suits a situation"),
      v.literal("Pick text that suits a situation"),
    ),
    updatedAt: v.number(),
  })
    .index("lobbyId", ["lobbyId"])
    .index("lobbyIdAndPlayerId", ["lobbyId", "playerId"]),

  lobbyCompletions: defineTable({
    lobbyId: v.id("lobbies"),
    completedByUserId: v.id("users"),
    selectedGame: v.union(
      v.literal("Generate image that fits"),
      v.literal("Pick image that suits a situation"),
      v.literal("Pick text that suits a situation"),
    ),
    completedAt: v.number(),
    summary: v.optional(v.string()),
    leaderboard: v.array(
      v.object({
        playerId: v.optional(v.id("lobbyPlayers")),
        displayName: v.string(),
        rank: v.number(),
        score: v.number(),
        note: v.optional(v.string()),
      }),
    ),
  })
    .index("lobbyId", ["lobbyId"])
    .index("completedByUserId", ["completedByUserId"]),

  playerPokes: defineTable({
    lobbyId: v.id("lobbies"),
    targetPlayerId: v.id("lobbyPlayers"),
    pokedByPlayerId: v.id("lobbyPlayers"),
    lobbyRoundNumber: v.optional(v.number()),
    textRoundId: v.optional(v.id("textGameRounds")),
    createdAt: v.number(),
  })
    .index("lobbyId", ["lobbyId"])
    .index("lobbyIdAndLobbyRoundNumber", ["lobbyId", "lobbyRoundNumber"])
    .index("lobbyIdAndTextRoundId", ["lobbyId", "textRoundId"]),

  textGamePrompts: defineTable({
    slug: v.string(),
    template: v.string(),
    order: v.number(),
    isActive: v.boolean(),
  })
    .index("slug", ["slug"])
    .index("order", ["order"])
    .index("isActive", ["isActive"]),

  textGameSessions: defineTable({
    lobbyId: v.id("lobbies"),
    roundCount: v.number(),
    promptIds: v.array(v.id("textGamePrompts")),
    currentRoundNumber: v.number(),
    status: v.union(v.literal("InProgress"), v.literal("Completed")),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  }).index("lobbyId", ["lobbyId"]),

  textGameRounds: defineTable({
    sessionId: v.id("textGameSessions"),
    lobbyId: v.id("lobbies"),
    roundNumber: v.number(),
    promptId: v.id("textGamePrompts"),
    promptText: v.string(),
    targetPlayerId: v.id("lobbyPlayers"),
    eligiblePlayerIds: v.array(v.id("lobbyPlayers")),
    stage: v.union(
      v.literal("Generate"),
      v.literal("Judge"),
      v.literal("Present"),
    ),
    stageStartedAt: v.number(),
    presentEndsAt: v.optional(v.number()),
  })
    .index("sessionId", ["sessionId"])
    .index("sessionIdAndRoundNumber", ["sessionId", "roundNumber"])
    .index("lobbyId", ["lobbyId"]),

  textGameSubmissions: defineTable({
    roundId: v.id("textGameRounds"),
    authorPlayerId: v.id("lobbyPlayers"),
    answer: v.string(),
    submittedAt: v.number(),
    correctnessStars: v.optional(v.number()),
    creativityStars: v.optional(v.number()),
    totalScore: v.optional(v.number()),
    judgedAt: v.optional(v.number()),
  })
    .index("roundId", ["roundId"])
    .index("roundIdAndAuthorPlayerId", ["roundId", "authorPlayerId"]),
});

export default schema;
