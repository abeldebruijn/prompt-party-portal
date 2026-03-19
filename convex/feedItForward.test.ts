import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { FEED_IT_FORWARD_GAME_NAME } from "./lib/lobby";
import { createConvexTest } from "./test.setup";

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

async function createFeedLobby(t: TestBackend) {
  const host = await createViewer(t, {
    name: "Host Person",
    hasPasswordAccount: true,
  });
  const created = await host.client.mutation(api.lobbies.createLobby, {
    selectedGame: FEED_IT_FORWARD_GAME_NAME,
  });

  return {
    host,
    ...created,
  };
}

async function seedFinalizedSetupSlot(
  t: TestBackend,
  args: {
    lobbyId: Id<"lobbies">;
    playerId: Id<"lobbyPlayers">;
    slotIndex: number;
    prompt: string;
  },
) {
  const imageStorageId = await storeTestImage(t);
  const embedding = Array.from({ length: 1536 }, (_, index) =>
    index % 3 === 0 ? 0.1 : 0,
  );

  await t.run(async (ctx) => {
    await ctx.db.insert("feedItForwardSetupSlots", {
      lobbyId: args.lobbyId,
      playerId: args.playerId,
      slotIndex: args.slotIndex,
      sourceKey: `setup:${args.playerId}:${args.slotIndex}`,
      prompt: args.prompt,
      promptEmbedding: embedding,
      imageStorageId,
      imageMediaType: "image/png",
      status: "Ready",
      isAutoFilled: false,
      finalizedAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
}

describe("convex/feedItForward", () => {
  it("stores settings and starts from finalized setup slots", async () => {
    const t = createConvexTest();
    const {
      host,
      lobbyId,
      joinCode,
      playerId: hostPlayerId,
    } = await createFeedLobby(t);
    const member = await createViewer(t, { name: "Alice Example" });
    const joined = await member.client.mutation(api.lobbies.joinLobbyByCode, {
      joinCode,
    });

    await host.client.mutation(api.feedItForward.updateSettings, {
      lobbyId,
      setupPromptCount: 2,
      roundDurationSeconds: 45,
    });

    await seedFinalizedSetupSlot(t, {
      lobbyId,
      playerId: hostPlayerId,
      slotIndex: 0,
      prompt: "A moon fox conducts a choir of glowing umbrellas.",
    });
    await seedFinalizedSetupSlot(t, {
      lobbyId,
      playerId: hostPlayerId,
      slotIndex: 1,
      prompt: "A velvet whale paints rainbows in a teacup storm.",
    });
    await seedFinalizedSetupSlot(t, {
      lobbyId,
      playerId: joined.playerId,
      slotIndex: 0,
      prompt: "A brass owl surfs across a pancake eclipse.",
    });
    await seedFinalizedSetupSlot(t, {
      lobbyId,
      playerId: joined.playerId,
      slotIndex: 1,
      prompt: "A sapphire bear tends a garden of floating violins.",
    });

    await host.client.mutation(api.feedItForward.startGame, { lobbyId });

    const snapshot = await host.client.query(api.feedItForward.getGameState, {
      lobbyId,
    });

    expect(snapshot.settings.setupPromptCount).toBe(2);
    expect(snapshot.settings.roundDurationSeconds).toBe(45);
    expect(snapshot.settings.totalRounds).toBe(2);
    expect(snapshot.session?.status).toBe("Playing");
    expect(snapshot.round?.roundNumber).toBe(1);
    expect(snapshot.round?.sourceImageUrl).toBeTruthy();
  });
});
