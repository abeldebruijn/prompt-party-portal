import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { IMAGE_GAME_NAME } from "./lib/lobby";
import { createConvexTest } from "./test.setup";

process.env.IMAGE_GAME_MOCK = "1";

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
type TestClient = ReturnType<TestBackend["withIdentity"]>;

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

const TEST_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO9Ww2kAAAAASUVORK5CYII=";

async function storeTestImage(t: TestBackend): Promise<Id<"_storage">> {
  return await t.run(async (ctx) => {
    const blob = new Blob([Buffer.from(TEST_PNG_BASE64, "base64")], {
      type: "image/png",
    });
    return (await ctx.storage.store(blob)) as Id<"_storage">;
  });
}

async function submitPromptAsGeneratedImage(
  t: TestBackend,
  client: TestClient,
  args: { lobbyId: Id<"lobbies">; prompt: string },
) {
  const storageId = await storeTestImage(t);
  return await client.mutation(api.imageGame.submitGeneratedImage, {
    lobbyId: args.lobbyId,
    prompt: args.prompt,
    imageStorageId: storageId,
    imageMediaType: "image/png",
  });
}

async function createImageGameLobby(t: TestBackend) {
  const host = await createViewer(t, {
    name: "Host Person",
    hasPasswordAccount: true,
  });
  const created = await host.client.mutation(api.lobbies.createLobby, {
    selectedGame: IMAGE_GAME_NAME,
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
      .query("imageGameSessions")
      .withIndex("lobbyId", (query) => query.eq("lobbyId", lobbyId))
      .order("desc")
      .first();

    if (session === null) {
      throw new Error("Expected an active image game session.");
    }

    const round = await ctx.db
      .query("imageGameRounds")
      .withIndex("sessionIdAndRoundNumber", (query) =>
        query
          .eq("sessionId", session._id)
          .eq("roundNumber", session.currentRoundNumber),
      )
      .unique();

    if (round === null) {
      throw new Error("Expected a current image game round.");
    }

    await ctx.db.patch(round._id, {
      presentEndsAt: Date.now() - 1000,
    });
  });
}

describe("convex/imageGame", () => {
  it("stores prompt-backed settings and starts the image game", async () => {
    const t = createConvexTest();
    const { host, lobbyId, joinCode } = await createImageGameLobby(t);
    const member = await createViewer(t, { name: "Alice Example" });

    await seedPrompts(t);
    await member.client.mutation(api.lobbies.joinLobbyByCode, { joinCode });
    await host.client.mutation(api.imageGame.updateSettings, {
      lobbyId,
      roundCount: 4,
    });
    await host.client.mutation(api.imageGame.startGame, { lobbyId });

    const gameState = await host.client.query(api.imageGame.getGameState, {
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
    const { host, lobbyId, joinCode } = await createImageGameLobby(t);
    const member = await createViewer(t, { name: "Member" });

    await member.client.mutation(api.lobbies.joinLobbyByCode, { joinCode });
    await seedPrompts(t, 1);
    await host.client.mutation(api.imageGame.updateSettings, {
      lobbyId,
      roundCount: 2,
    });

    await expect(
      host.client.mutation(api.imageGame.startGame, { lobbyId }),
    ).rejects.toThrow("Not enough active image-game prompts are stored yet.");

    const t2 = createConvexTest();
    const seededLobby = await createImageGameLobby(t2);
    const seededMember = await createViewer(t2, { name: "Member" });

    await seedPrompts(t2);
    await seededMember.client.mutation(api.lobbies.joinLobbyByCode, {
      joinCode: seededLobby.joinCode,
    });
    await seededLobby.host.client.mutation(api.imageGame.updateSettings, {
      lobbyId: seededLobby.lobbyId,
      roundCount: 2,
    });
    await seededLobby.host.client.mutation(api.imageGame.startGame, {
      lobbyId: seededLobby.lobbyId,
    });

    await expect(
      submitPromptAsGeneratedImage(t2, seededLobby.host.client, {
        lobbyId: seededLobby.lobbyId,
        prompt: "Host should not submit",
      }),
    ).rejects.toThrow(
      "The selected player judges this round and cannot submit.",
    );

    await submitPromptAsGeneratedImage(t2, seededMember.client, {
      lobbyId: seededLobby.lobbyId,
      prompt: "Competitive karaoke, neon lights, crowd cheering",
    });

    await expect(
      submitPromptAsGeneratedImage(t2, seededMember.client, {
        lobbyId: seededLobby.lobbyId,
        prompt: "Second try",
      }),
    ).rejects.toThrow("Prompts can only be submitted during Generate.");

    const judgeState = await seededLobby.host.client.query(
      api.imageGame.getGameState,
      {
        lobbyId: seededLobby.lobbyId,
      },
    );

    expect(judgeState.round?.stage).toBe("Judge");
    expect(judgeState.round?.judgeSubmissions).toHaveLength(1);
  });

  it("does not advance the round until a generated image is explicitly submitted", async () => {
    const t = createConvexTest();
    const { host, lobbyId, joinCode } = await createImageGameLobby(t);
    const member = await createViewer(t, { name: "Member" });

    await seedPrompts(t);
    await member.client.mutation(api.lobbies.joinLobbyByCode, { joinCode });
    await host.client.mutation(api.imageGame.updateSettings, {
      lobbyId,
      roundCount: 1,
    });
    await host.client.mutation(api.imageGame.startGame, { lobbyId });

    const uploadUrl = await member.client.mutation(
      api.imageGame.generateUploadUrl,
      {
        lobbyId,
      },
    );

    expect(uploadUrl).toContain("/api/storage/upload");

    const generateState = await host.client.query(api.imageGame.getGameState, {
      lobbyId,
    });

    expect(generateState.round?.stage).toBe("Generate");
    expect(generateState.round?.submissionCount).toBe(0);

    await submitPromptAsGeneratedImage(t, member.client, {
      lobbyId,
      prompt: "Colorful confetti exploding over a karaoke stage",
    });

    const judgeState = await host.client.query(api.imageGame.getGameState, {
      lobbyId,
    });

    expect(judgeState.round?.stage).toBe("Judge");
    expect(judgeState.round?.submissionCount).toBe(1);
  });

  it("stores the latest poker for pending players and blocks invalid image-game pokes", async () => {
    const t = createConvexTest();
    const { host, lobbyId, joinCode, playerId: hostPlayerId } =
      await createImageGameLobby(t);
    const alice = await createViewer(t, { name: "Alice" });
    const bob = await createViewer(t, { name: "Bob" });

    await seedPrompts(t);
    const aliceJoin = await alice.client.mutation(api.lobbies.joinLobbyByCode, {
      joinCode,
    });
    const bobJoin = await bob.client.mutation(api.lobbies.joinLobbyByCode, {
      joinCode,
    });
    await host.client.mutation(api.imageGame.updateSettings, {
      lobbyId,
      roundCount: 1,
    });
    await host.client.mutation(api.imageGame.startGame, { lobbyId });

    const initialState = await host.client.query(api.imageGame.getGameState, {
      lobbyId,
    });
    const pendingPlayer = initialState.round?.progress.find(
      (entry) => entry.state === "Pending",
    );
    const judgePlayer = initialState.round?.progress.find(
      (entry) => entry.state === "Target",
    );

    expect(pendingPlayer).toBeTruthy();
    expect(judgePlayer).toBeTruthy();

    await expect(
      alice.client.mutation(api.imageGame.pokePlayer, {
        lobbyId,
        playerId: aliceJoin.playerId,
      }),
    ).rejects.toThrow("You cannot poke yourself.");

    await expect(
      (
        judgePlayer?.playerId === hostPlayerId ? alice.client : host.client
      ).mutation(api.imageGame.pokePlayer, {
        lobbyId,
        playerId: judgePlayer?.playerId as Id<"lobbyPlayers">,
      }),
    ).rejects.toThrow("Only pending players can be poked.");

    const pokerClient =
      pendingPlayer?.playerId === aliceJoin.playerId
        ? bob.client
        : alice.client;
    const expectedPokerName =
      pendingPlayer?.playerId === aliceJoin.playerId ? "Bob" : "Alice";

    await pokerClient.mutation(api.imageGame.pokePlayer, {
      lobbyId,
      playerId: pendingPlayer?.playerId as Id<"lobbyPlayers">,
    });

    const pokedState = await host.client.query(api.imageGame.getGameState, {
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

    await submitPromptAsGeneratedImage(t, pokerClient, {
      lobbyId,
      prompt: "A bright retro arcade with confetti raining from the ceiling",
    });

    await expect(
      host.client.mutation(api.imageGame.pokePlayer, {
        lobbyId,
        playerId: (pendingPlayer?.playerId === aliceJoin.playerId
          ? bobJoin.playerId
          : aliceJoin.playerId) as Id<"lobbyPlayers">,
      }),
    ).rejects.toThrow("Only pending players can be poked.");

    const finisherClient =
      pendingPlayer?.playerId === hostPlayerId
        ? host.client
        : pendingPlayer?.playerId === aliceJoin.playerId
          ? alice.client
          : bob.client;

    await submitPromptAsGeneratedImage(t, finisherClient, {
      lobbyId,
      prompt: "A bright retro arcade with confetti raining from the ceiling",
    });

    await expect(
      host.client.mutation(api.imageGame.pokePlayer, {
        lobbyId,
        playerId: pendingPlayer?.playerId as Id<"lobbyPlayers">,
      }),
    ).rejects.toThrow("Players can only be poked during Generate.");

    await expect(
      pokerClient.mutation(api.imageGame.pokePlayer, {
        lobbyId,
        playerId: pendingPlayer?.playerId as Id<"lobbyPlayers">,
      }),
    ).rejects.toThrow("Players can only be poked during Generate.");
  });

  it("rejects poking players who already submitted during generate", async () => {
    const t = createConvexTest();
    const { host, lobbyId, joinCode } = await createImageGameLobby(t);
    const member = await createViewer(t, { name: "Member" });
    const thirdPlayer = await createViewer(t, { name: "Third" });

    await seedPrompts(t);
    const memberJoin = await member.client.mutation(
      api.lobbies.joinLobbyByCode,
      {
        joinCode,
      },
    );
    await thirdPlayer.client.mutation(api.lobbies.joinLobbyByCode, {
      joinCode,
    });
    await host.client.mutation(api.imageGame.startGame, { lobbyId });

    const gameState = await host.client.query(api.imageGame.getGameState, {
      lobbyId,
    });
    const judgePlayerId = gameState.round?.targetPlayer?.playerId;

    if (judgePlayerId === memberJoin.playerId) {
      await submitPromptAsGeneratedImage(t, thirdPlayer.client, {
        lobbyId,
        prompt: "Third player submission",
      });
      await expect(
        thirdPlayer.client.mutation(api.imageGame.pokePlayer, {
          lobbyId,
          playerId: memberJoin.playerId,
        }),
      ).rejects.toThrow("Only pending players can be poked.");
      return;
    }

    await submitPromptAsGeneratedImage(t, member.client, {
      lobbyId,
      prompt: "Member submission",
    });

    await expect(
      host.client.mutation(api.imageGame.pokePlayer, {
        lobbyId,
        playerId: memberJoin.playerId,
      }),
    ).rejects.toThrow("Only pending players can be poked.");
  });

  it("returns a preview URL for a stored generated image", async () => {
    const t = createConvexTest();
    const { host, lobbyId, joinCode } = await createImageGameLobby(t);
    const member = await createViewer(t, { name: "Member" });

    await seedPrompts(t);
    await member.client.mutation(api.lobbies.joinLobbyByCode, { joinCode });
    await host.client.mutation(api.imageGame.startGame, { lobbyId });

    const storageId = await storeTestImage(t);
    const previewUrl = await member.client.query(
      api.imageGame.getPreviewImageUrl,
      {
        lobbyId,
        storageId,
      },
    );

    expect(previewUrl).toBeTruthy();
  });

  it("can skip judge with zero submissions and complete idempotently after present", async () => {
    const t = createConvexTest();
    const { host, lobbyId, joinCode } = await createImageGameLobby(t);
    const member = await createViewer(t, { name: "Member" });

    await seedPrompts(t);
    await member.client.mutation(api.lobbies.joinLobbyByCode, { joinCode });
    await host.client.mutation(api.imageGame.updateSettings, {
      lobbyId,
      roundCount: 1,
    });
    await host.client.mutation(api.imageGame.startGame, { lobbyId });
    const transition = await host.client.mutation(
      api.imageGame.advanceToJudge,
      { lobbyId },
    );

    const presentState = await host.client.query(api.imageGame.getGameState, {
      lobbyId,
    });

    expect(transition.transition).toBe("present");
    expect(presentState.round?.stage).toBe("Present");
    expect(presentState.round?.winners).toEqual([]);

    await expireCurrentPresentRound(t, lobbyId);

    await member.client.mutation(api.imageGame.advanceAfterPresent, {
      lobbyId,
    });
    const secondAdvance = await member.client.mutation(
      api.imageGame.advanceAfterPresent,
      { lobbyId },
    );

    expect(secondAdvance.state).toBe("Completion");

    const completionState = await host.client.query(
      api.imageGame.getGameState,
      {
        lobbyId,
      },
    );

    expect(completionState.lobby.state).toBe("Completion");
    expect(completionState.leaderboard).toHaveLength(2);
  });

  it("lets the host skip to judge with partial submissions", async () => {
    const t = createConvexTest();
    const { host, lobbyId, joinCode, playerId: hostPlayerId } =
      await createImageGameLobby(t);
    const alice = await createViewer(t, { name: "Alice" });
    const bob = await createViewer(t, { name: "Bob" });

    await seedPrompts(t);
    const aliceJoin = await alice.client.mutation(api.lobbies.joinLobbyByCode, {
      joinCode,
    });
    const bobJoin = await bob.client.mutation(api.lobbies.joinLobbyByCode, {
      joinCode,
    });
    await host.client.mutation(api.imageGame.updateSettings, {
      lobbyId,
      roundCount: 1,
    });
    await host.client.mutation(api.imageGame.startGame, { lobbyId });

    const generateState = await host.client.query(api.imageGame.getGameState, {
      lobbyId,
    });
    const pendingPlayer = generateState.round?.progress.find(
      (entry) => entry.state === "Pending",
    );
    const targetPlayerId = generateState.round?.targetPlayer?.playerId;
    const clientByPlayerId = new Map<string, typeof host.client>([
      [hostPlayerId, host.client],
      [aliceJoin.playerId, alice.client],
      [bobJoin.playerId, bob.client],
    ]);
    const submittingClient = clientByPlayerId.get(pendingPlayer?.playerId ?? "");
    const judgingClient = clientByPlayerId.get(targetPlayerId ?? "");

    expect(generateState.round?.stage).toBe("Generate");
    expect(pendingPlayer).toBeTruthy();
    expect(targetPlayerId).toBeTruthy();
    expect(submittingClient).toBeTruthy();
    expect(judgingClient).toBeTruthy();

    await submitPromptAsGeneratedImage(t, submittingClient!, {
      lobbyId,
      prompt: "Partial image submission survives host skip",
    });

    const partialState = await host.client.query(api.imageGame.getGameState, {
      lobbyId,
    });

    expect(partialState.round?.stage).toBe("Generate");
    expect(partialState.round?.submissionCount).toBe(1);

    const transition = await host.client.mutation(
      api.imageGame.advanceToJudge,
      { lobbyId },
    );
    const judgeState = await judgingClient!.query(api.imageGame.getGameState, {
      lobbyId,
    });

    expect(transition.transition).toBe("judge");
    expect(judgeState.round?.stage).toBe("Judge");
    expect(judgeState.round?.judgeSubmissions).toHaveLength(1);
    expect(judgeState.round?.judgeSubmissions[0]?.prompt).toBe(
      "Partial image submission survives host skip",
    );
  });

  it("adds late joiners on the next round and writes the final leaderboard", async () => {
    const t = createConvexTest();
    const { host, lobbyId, joinCode } = await createImageGameLobby(t);
    const alice = await createViewer(t, { name: "Alice" });
    const bob = await createViewer(t, { name: "Bob" });

    await seedPrompts(t);
    await alice.client.mutation(api.lobbies.joinLobbyByCode, { joinCode });
    await host.client.mutation(api.imageGame.updateSettings, {
      lobbyId,
      roundCount: 2,
    });
    await host.client.mutation(api.imageGame.startGame, { lobbyId });
    await bob.client.mutation(api.lobbies.joinLobbyByCode, { joinCode });

    await expect(
      submitPromptAsGeneratedImage(t, bob.client, {
        lobbyId,
        prompt: "Late joiner prompt",
      }),
    ).rejects.toThrow("You are spectating this round and cannot submit.");

    await submitPromptAsGeneratedImage(t, alice.client, {
      lobbyId,
      prompt: "First prompt",
    });

    const firstJudgeState = await host.client.query(
      api.imageGame.getGameState,
      {
        lobbyId,
      },
    );
    const judgeSubmissionId =
      firstJudgeState.round?.judgeSubmissions[0]?.submissionId;
    if (!judgeSubmissionId) {
      throw new Error("Expected a judge submission.");
    }

    await host.client.mutation(api.imageGame.rateSubmission, {
      lobbyId,
      submissionId: judgeSubmissionId as Id<"imageGameSubmissions">,
      correctnessStars: 4,
      creativityStars: 3,
    });
    await host.client.mutation(api.imageGame.advanceToPresent, { lobbyId });

    await expireCurrentPresentRound(t, lobbyId);
    await bob.client.mutation(api.imageGame.advanceAfterPresent, { lobbyId });

    const secondRound = await bob.client.query(api.imageGame.getGameState, {
      lobbyId,
    });

    expect(secondRound.round?.roundNumber).toBe(2);
    expect(secondRound.round?.expectedSubmissionCount).toBe(2);
    expect(
      secondRound.round?.progress.some(
        (entry) => entry.displayName === "Bob" && entry.state === "Pending",
      ),
    ).toBe(true);

    await submitPromptAsGeneratedImage(t, host.client, {
      lobbyId,
      prompt: "Host prompt",
    });
    await submitPromptAsGeneratedImage(t, bob.client, {
      lobbyId,
      prompt: "Bob prompt",
    });

    const secondJudgeState = await alice.client.query(
      api.imageGame.getGameState,
      {
        lobbyId,
      },
    );
    const [firstSubmission, secondSubmission] =
      secondJudgeState.round?.judgeSubmissions ?? [];

    await alice.client.mutation(api.imageGame.rateSubmission, {
      lobbyId,
      submissionId: firstSubmission?.submissionId as Id<"imageGameSubmissions">,
      correctnessStars: 5,
      creativityStars: 5,
    });
    await alice.client.mutation(api.imageGame.rateSubmission, {
      lobbyId,
      submissionId:
        secondSubmission?.submissionId as Id<"imageGameSubmissions">,
      correctnessStars: 1,
      creativityStars: 1,
    });
    await alice.client.mutation(api.imageGame.advanceToPresent, { lobbyId });

    await expireCurrentPresentRound(t, lobbyId);
    await host.client.mutation(api.imageGame.advanceAfterPresent, { lobbyId });

    const completion = await host.client.query(api.imageGame.getGameState, {
      lobbyId,
    });

    expect(completion.lobby.state).toBe("Completion");
    expect(completion.leaderboard).toHaveLength(3);
  });
});
