import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { TEXT_GAME_NAME } from "./lib/lobby";
import { createConvexTest } from "./test.setup";

const PROMPTS = [
  "A sport that {person} would be good in",
  "Favourite dish of {person}",
  "Planet {person} would visit",
  "A historical era {person} would love to live in",
  "A super-power {person} would choose to have",
  "A favorite holiday destination for {person}",
  "A dream job {person} would pursue if money weren’t an issue",
  "A type of vehicle {person} would love to drive",
  "A hobby {person} would pick up during retirement",
  "A mythical creature {person} would keep as a companion",
  "A favorite type of art {person} would create or appreciate",
  "A supervillain {person} could be compared to",
  "A form of transportation {person} would invent",
  "A scientific discovery {person} would want to make",
  "A type of architecture {person} would design",
  "A business idea {person} would want to launch",
  "If {person} won the lottery, they would...",
  "If {person} had unlimited time, they would spend it on...",
  "If {person} could change one thing about the world, they would...",
  "If {person} had to teach a masterclass on something, they would teach...",
] as const;

type TestBackend = ReturnType<typeof createConvexTest>;

let nextUserSeed = 0;

async function createViewer(
  t: TestBackend,
  options: {
    name?: string;
    hasPasswordAccount?: boolean;
  } = {},
) {
  nextUserSeed += 1;

  const userId = await t.run(async (ctx) => {
    const insertedUserId = await ctx.db.insert("users", {
      name: options.name ?? `User ${nextUserSeed}`,
      isAnonymous: false,
    });

    if (options.hasPasswordAccount) {
      await ctx.db.insert("authAccounts", {
        userId: insertedUserId,
        provider: "password",
        providerAccountId: `user-${nextUserSeed}@example.com`,
      });
    }

    return insertedUserId;
  });

  return {
    userId,
    client: t.withIdentity({ subject: userId }),
  };
}

async function seedPrompts(t: TestBackend, count: number = PROMPTS.length) {
  await t.run(async (ctx) => {
    for (const [index, template] of PROMPTS.slice(0, count).entries()) {
      await ctx.db.insert("textGamePrompts", {
        slug: `prompt-${index + 1}`,
        template,
        order: index + 1,
        isActive: true,
      });
    }
  });
}

async function createTextGameLobby(t: TestBackend) {
  const host = await createViewer(t, {
    name: "Host Person",
    hasPasswordAccount: true,
  });
  const created = await host.client.mutation(api.lobbies.createLobby, {
    selectedGame: TEXT_GAME_NAME,
  });

  return {
    host,
    ...created,
  };
}

async function expireCurrentPresentRound(
  t: TestBackend,
  lobbyId: Id<"lobbies">,
) {
  await t.run(async (ctx) => {
    const session = await ctx.db
      .query("textGameSessions")
      .withIndex("lobbyId", (query) => query.eq("lobbyId", lobbyId))
      .order("desc")
      .first();

    if (session === null) {
      throw new Error("Expected an active text game session.");
    }

    const round = await ctx.db
      .query("textGameRounds")
      .withIndex("sessionIdAndRoundNumber", (query) =>
        query
          .eq("sessionId", session._id)
          .eq("roundNumber", session.currentRoundNumber),
      )
      .unique();

    if (round === null) {
      throw new Error("Expected a current text game round.");
    }

    await ctx.db.patch(round._id, {
      presentEndsAt: Date.now() - 1000,
    });
  });
}

describe("convex/textGame", () => {
  it("stores prompt-backed settings and starts the text game", async () => {
    const t = createConvexTest();
    const { host, lobbyId, joinCode } = await createTextGameLobby(t);
    const member = await createViewer(t, { name: "Alice Example" });

    await seedPrompts(t);
    await member.client.mutation(api.lobbies.joinLobbyByCode, { joinCode });
    await host.client.mutation(api.textGame.updateSettings, {
      lobbyId,
      roundCount: 4,
    });
    await host.client.mutation(api.textGame.startGame, { lobbyId });

    const gameState = await host.client.query(api.textGame.getGameState, {
      lobbyId,
    });

    expect(gameState.settings.roundCount).toBe(4);
    expect(gameState.lobby.state).toBe("Playing");
    expect(gameState.session?.roundCount).toBe(4);
    expect(gameState.round?.roundNumber).toBe(1);
    expect(gameState.round?.promptText).toContain("Host Person");
  });

  it("requires enough stored prompts and enforces submission rules", async () => {
    const t = createConvexTest();
    const { host, lobbyId, joinCode } = await createTextGameLobby(t);
    const member = await createViewer(t, { name: "Member" });

    await member.client.mutation(api.lobbies.joinLobbyByCode, { joinCode });
    await seedPrompts(t, 1);
    await host.client.mutation(api.textGame.updateSettings, {
      lobbyId,
      roundCount: 2,
    });

    await expect(
      host.client.mutation(api.textGame.startGame, { lobbyId }),
    ).rejects.toThrow("Not enough active text-game prompts are stored yet.");

    const t2 = createConvexTest();
    const seededLobby = await createTextGameLobby(t2);
    const seededMember = await createViewer(t2, { name: "Member" });

    await seedPrompts(t2);
    await seededMember.client.mutation(api.lobbies.joinLobbyByCode, {
      joinCode: seededLobby.joinCode,
    });
    await seededLobby.host.client.mutation(api.textGame.updateSettings, {
      lobbyId: seededLobby.lobbyId,
      roundCount: 2,
    });
    await seededLobby.host.client.mutation(api.textGame.startGame, {
      lobbyId: seededLobby.lobbyId,
    });

    await expect(
      seededLobby.host.client.mutation(api.textGame.submitAnswer, {
        lobbyId: seededLobby.lobbyId,
        answer: "Host should not submit",
      }),
    ).rejects.toThrow(
      "The selected player judges this round and cannot submit.",
    );

    await seededMember.client.mutation(api.textGame.submitAnswer, {
      lobbyId: seededLobby.lobbyId,
      answer: "Competitive karaoke",
    });

    await expect(
      seededMember.client.mutation(api.textGame.submitAnswer, {
        lobbyId: seededLobby.lobbyId,
        answer: "Second try",
      }),
    ).rejects.toThrow("Answers can only be submitted during Generate.");

    const judgeState = await seededLobby.host.client.query(
      api.textGame.getGameState,
      {
        lobbyId: seededLobby.lobbyId,
      },
    );

    expect(judgeState.round?.stage).toBe("Judge");
    expect(judgeState.round?.judgeSubmissions).toHaveLength(1);
  });

  it("stores the latest poker for pending players and blocks invalid text-game pokes", async () => {
    const t = createConvexTest();
    const { host, lobbyId, joinCode } = await createTextGameLobby(t);
    const alice = await createViewer(t, { name: "Alice" });
    const bob = await createViewer(t, { name: "Bob" });

    await seedPrompts(t);
    const aliceJoin = await alice.client.mutation(api.lobbies.joinLobbyByCode, {
      joinCode,
    });
    await bob.client.mutation(api.lobbies.joinLobbyByCode, { joinCode });
    await host.client.mutation(api.textGame.updateSettings, {
      lobbyId,
      roundCount: 1,
    });
    await host.client.mutation(api.textGame.startGame, { lobbyId });

    const initialState = await host.client.query(api.textGame.getGameState, {
      lobbyId,
    });
    const pendingPlayer = initialState.round?.progress.find(
      (entry) => entry.state === "Pending",
    );

    expect(pendingPlayer).toBeTruthy();

    await expect(
      alice.client.mutation(api.textGame.pokePlayer, {
        lobbyId,
        playerId: aliceJoin.playerId,
      }),
    ).rejects.toThrow("You cannot poke yourself.");

    const pokerClient =
      pendingPlayer?.playerId === aliceJoin.playerId
        ? bob.client
        : alice.client;
    const expectedPokerName =
      pendingPlayer?.playerId === aliceJoin.playerId ? "Bob" : "Alice";

    await pokerClient.mutation(api.textGame.pokePlayer, {
      lobbyId,
      playerId: pendingPlayer?.playerId as Id<"lobbyPlayers">,
    });

    const pokedState = await host.client.query(api.textGame.getGameState, {
      lobbyId,
    });
    const pokedEntry = pokedState.round?.progress.find(
      (entry) => entry.playerId === pendingPlayer?.playerId,
    );

    expect(pokedEntry?.lastPoke).toEqual(
      expect.objectContaining({
        pokedByDisplayName: expectedPokerName,
      }),
    );
  });

  it("can skip judge with zero submissions and complete idempotently after present", async () => {
    const t = createConvexTest();
    const { host, lobbyId, joinCode } = await createTextGameLobby(t);
    const member = await createViewer(t, { name: "Member" });

    await seedPrompts(t);
    await member.client.mutation(api.lobbies.joinLobbyByCode, { joinCode });
    await host.client.mutation(api.textGame.updateSettings, {
      lobbyId,
      roundCount: 1,
    });
    await host.client.mutation(api.textGame.startGame, { lobbyId });
    await host.client.mutation(api.textGame.advanceToJudge, { lobbyId });

    const presentState = await host.client.query(api.textGame.getGameState, {
      lobbyId,
    });

    expect(presentState.round?.stage).toBe("Present");
    expect(presentState.round?.winners).toEqual([]);

    await expireCurrentPresentRound(t, lobbyId);

    await member.client.mutation(api.textGame.advanceAfterPresent, { lobbyId });
    const secondAdvance = await member.client.mutation(
      api.textGame.advanceAfterPresent,
      { lobbyId },
    );

    expect(secondAdvance.state).toBe("Completion");

    const completionState = await host.client.query(api.textGame.getGameState, {
      lobbyId,
    });

    expect(completionState.lobby.state).toBe("Completion");
    expect(completionState.leaderboard).toHaveLength(2);
  });

  it("adds late joiners on the next round and writes the final leaderboard", async () => {
    const t = createConvexTest();
    const { host, lobbyId, joinCode } = await createTextGameLobby(t);
    const alice = await createViewer(t, { name: "Alice" });
    const bob = await createViewer(t, { name: "Bob" });

    await seedPrompts(t);
    await alice.client.mutation(api.lobbies.joinLobbyByCode, { joinCode });
    await host.client.mutation(api.textGame.updateSettings, {
      lobbyId,
      roundCount: 2,
    });
    await host.client.mutation(api.textGame.startGame, { lobbyId });
    await bob.client.mutation(api.lobbies.joinLobbyByCode, { joinCode });

    await expect(
      bob.client.mutation(api.textGame.submitAnswer, {
        lobbyId,
        answer: "Late joiner answer",
      }),
    ).rejects.toThrow("You are spectating this round and cannot submit.");

    await alice.client.mutation(api.textGame.submitAnswer, {
      lobbyId,
      answer: "Ice sculpting champion",
    });

    const firstJudgeState = await host.client.query(api.textGame.getGameState, {
      lobbyId,
    });

    await host.client.mutation(api.textGame.rateSubmission, {
      lobbyId,
      submissionId: firstJudgeState.round?.judgeSubmissions[0]
        ?.submissionId as Id<"textGameSubmissions">,
      correctnessStars: 4,
      creativityStars: 3,
    });
    await host.client.mutation(api.textGame.advanceToPresent, { lobbyId });

    await expireCurrentPresentRound(t, lobbyId);
    await bob.client.mutation(api.textGame.advanceAfterPresent, { lobbyId });

    const secondRound = await bob.client.query(api.textGame.getGameState, {
      lobbyId,
    });

    expect(secondRound.round?.roundNumber).toBe(2);
    expect(secondRound.round?.expectedSubmissionCount).toBe(2);
    expect(
      secondRound.round?.progress.some(
        (entry) => entry.displayName === "Bob" && entry.state === "Pending",
      ),
    ).toBe(true);

    await host.client.mutation(api.textGame.submitAnswer, {
      lobbyId,
      answer: "Build a moon train",
    });
    await bob.client.mutation(api.textGame.submitAnswer, {
      lobbyId,
      answer: "Open a sandwich museum",
    });

    const secondJudgeState = await alice.client.query(
      api.textGame.getGameState,
      {
        lobbyId,
      },
    );
    const [firstSubmission, secondSubmission] =
      secondJudgeState.round?.judgeSubmissions ?? [];

    await alice.client.mutation(api.textGame.rateSubmission, {
      lobbyId,
      submissionId: firstSubmission?.submissionId as Id<"textGameSubmissions">,
      correctnessStars: 5,
      creativityStars: 5,
    });
    await alice.client.mutation(api.textGame.rateSubmission, {
      lobbyId,
      submissionId: secondSubmission?.submissionId as Id<"textGameSubmissions">,
      correctnessStars: 1,
      creativityStars: 1,
    });
    await alice.client.mutation(api.textGame.advanceToPresent, { lobbyId });

    await expireCurrentPresentRound(t, lobbyId);
    await host.client.mutation(api.textGame.advanceAfterPresent, { lobbyId });

    const finalState = await host.client.query(api.textGame.getGameState, {
      lobbyId,
    });

    expect(finalState.lobby.state).toBe("Completion");
    expect(finalState.leaderboard).toEqual([
      expect.objectContaining({
        displayName: "Host Person",
        rank: 1,
        score: 10,
      }),
      expect.objectContaining({ displayName: "Alice", rank: 2, score: 7 }),
      expect.objectContaining({ displayName: "Bob", rank: 3, score: 2 }),
    ]);
  });
});
