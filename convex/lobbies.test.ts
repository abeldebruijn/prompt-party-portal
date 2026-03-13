import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { PLACEHOLDER_GAMES } from "./lib/lobby";
import { createConvexTest } from "./test.setup";

type TestBackend = ReturnType<typeof createConvexTest>;
type ViewerClient = ReturnType<TestBackend["withIdentity"]>;
type ViewerFixture = {
  userId: Id<"users">;
  client: ViewerClient;
};

const [GAME_ONE, GAME_TWO, GAME_THREE] = PLACEHOLDER_GAMES;

let nextUserSeed = 0;

async function createViewer(
  t: TestBackend,
  options: {
    name?: string;
    isAnonymous?: boolean;
    hasPasswordAccount?: boolean;
  } = {},
): Promise<ViewerFixture> {
  nextUserSeed += 1;

  const userId = await t.run(async (ctx) => {
    const seededName = options.name ?? `User ${nextUserSeed}`;
    const insertedUserId = await ctx.db.insert("users", {
      name: seededName,
      isAnonymous: options.isAnonymous,
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

async function createLobbyFixture(t: TestBackend) {
  const host = await createViewer(t, {
    name: "  Host   Person  ",
    hasPasswordAccount: true,
  });
  const created = await host.client.mutation(api.lobbies.createLobby, {});

  return {
    host,
    ...created,
  };
}

describe("convex/lobbies", () => {
  it("covers the main lobby lifecycle and important side effects", async () => {
    const t = createConvexTest();
    const {
      host,
      lobbyId,
      playerId: hostPlayerId,
      joinCode,
    } = await createLobbyFixture(t);
    const alice = await createViewer(t, { name: "  Alice   Example  " });
    const bob = await createViewer(t, { name: "Bob Example" });

    const hostLobbyByCode = await host.client.query(
      api.lobbies.getLobbyByCode,
      {
        joinCode: ` ${joinCode.toLowerCase()} `,
      },
    );

    expect(hostLobbyByCode).toMatchObject({
      lobbyId,
      joinCode,
      selectedGame: GAME_ONE,
      state: "Creation",
      activePlayerCount: 1,
      isViewerJoined: true,
      isViewerHost: true,
    });

    const aliceJoin = await alice.client.mutation(api.lobbies.joinLobbyByCode, {
      joinCode: joinCode.toLowerCase(),
    });
    const bobJoin = await bob.client.mutation(api.lobbies.joinLobbyByCode, {
      joinCode,
    });
    const firstVote = await alice.client.mutation(api.lobbies.voteForGame, {
      lobbyId,
      game: GAME_TWO,
    });
    const updatedVote = await alice.client.mutation(api.lobbies.voteForGame, {
      lobbyId,
      game: GAME_THREE,
    });
    await bob.client.mutation(api.lobbies.voteForGame, {
      lobbyId,
      game: GAME_TWO,
    });
    const aiPlayer = await host.client.mutation(api.lobbies.addAiPlayer, {
      lobbyId,
      displayName: "  Bot   Prime  ",
      personalityType: "custom",
      customPrompt: "  Crack   gentle jokes  ",
    });
    await host.client.mutation(api.lobbies.selectGame, {
      lobbyId,
      game: GAME_TWO,
    });
    await host.client.mutation(api.lobbies.kickPlayer, {
      lobbyId,
      playerId: bobJoin.playerId,
    });

    expect(updatedVote).toEqual({ voteId: firstVote.voteId, game: GAME_THREE });
    await expect(
      bob.client.query(api.lobbies.getLobby, { lobbyId }),
    ).rejects.toThrow("You must be an active player in this lobby.");
    await expect(
      bob.client.mutation(api.lobbies.joinLobbyByCode, { joinCode }),
    ).rejects.toThrow("You were previously removed from this lobby.");

    const creationSnapshot = await host.client.query(api.lobbies.getLobby, {
      lobbyId,
    });

    expect(creationSnapshot.lobby).toMatchObject({
      _id: lobbyId,
      selectedGame: GAME_TWO,
      state: "Creation",
      activePlayerCount: 3,
    });
    expect(
      creationSnapshot.players.map((player) => player.displayName),
    ).toEqual(["Host Person", "Alice Example", "Bot Prime"]);
    expect(creationSnapshot.votes).toHaveLength(1);
    expect(creationSnapshot.votes[0]).toMatchObject({
      playerId: aliceJoin.playerId,
      game: GAME_THREE,
    });
    expect(
      creationSnapshot.voteSummary.find((entry) => entry.game === GAME_THREE),
    ).toMatchObject({ count: 1 });

    await host.client.mutation(api.lobbies.startRound, { lobbyId });
    await host.client.mutation(api.lobbies.pokePlayer, {
      lobbyId,
      playerId: aliceJoin.playerId,
    });

    const playingSnapshot = await alice.client.query(api.lobbies.getLobby, {
      lobbyId,
    });

    expect(playingSnapshot.submissionProgress).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          playerId: aliceJoin.playerId,
          state: "Pending",
          lastPoke: expect.objectContaining({
            pokedByDisplayName: "Host Person",
          }),
        }),
        expect.objectContaining({
          playerId: aiPlayer.playerId,
          state: "AiExcluded",
          lastPoke: null,
        }),
      ]),
    );

    const completion = await host.client.mutation(api.lobbies.completeLobby, {
      lobbyId,
      summary: "  Great   finish  ",
      leaderboard: [
        {
          playerId: hostPlayerId,
          displayName: "  Host   Person  ",
          rank: 1,
          score: 12,
          note: "  Kept   things moving  ",
        },
        {
          playerId: aliceJoin.playerId,
          displayName: " Alice  Example ",
          rank: 2,
          score: 8,
        },
        {
          playerId: aiPlayer.playerId,
          displayName: "  Bot   Prime ",
          rank: 3,
          score: 4,
          note: "  Very   dramatic  ",
        },
      ],
    });
    const completionSnapshot = await host.client.query(api.lobbies.getLobby, {
      lobbyId,
    });
    const dbStateAfterCompletion = await t.run(async (ctx) => {
      const lobby = await ctx.db.get(lobbyId);
      const pokes = await ctx.db
        .query("playerPokes")
        .withIndex("lobbyId", (query) => query.eq("lobbyId", lobbyId))
        .collect();
      const votes = await ctx.db
        .query("lobbyGameVotes")
        .withIndex("lobbyId", (query) => query.eq("lobbyId", lobbyId))
        .collect();
      const completionRecord = await ctx.db
        .query("lobbyCompletions")
        .withIndex("lobbyId", (query) => query.eq("lobbyId", lobbyId))
        .first();

      return { lobby, pokes, votes, completionRecord };
    });

    expect(completion).toMatchObject({
      lobbyId,
      completionId: completion.completionId,
      state: "Completion",
    });
    expect(completionSnapshot.completion).toMatchObject({
      _id: completion.completionId,
      completedByUserId: host.userId,
      selectedGame: GAME_TWO,
      summary: "Great finish",
    });
    expect(completionSnapshot.completion?.leaderboard).toEqual([
      {
        playerId: hostPlayerId,
        displayName: "Host Person",
        rank: 1,
        score: 12,
        note: "Kept things moving",
      },
      {
        playerId: aliceJoin.playerId,
        displayName: "Alice Example",
        rank: 2,
        score: 8,
      },
      {
        playerId: aiPlayer.playerId,
        displayName: "Bot Prime",
        rank: 3,
        score: 4,
        note: "Very dramatic",
      },
    ]);
    expect(dbStateAfterCompletion.lobby?.state).toBe("Completion");
    expect(dbStateAfterCompletion.pokes).toHaveLength(1);
    expect(dbStateAfterCompletion.votes).toHaveLength(1);
    expect(dbStateAfterCompletion.completionRecord?._id).toBe(
      completion.completionId,
    );
    expect(dbStateAfterCompletion.completionRecord?.leaderboard).toHaveLength(
      3,
    );

    await host.client.mutation(api.lobbies.resetLobby, { lobbyId });
    const resetSnapshot = await host.client.query(api.lobbies.getLobby, {
      lobbyId,
    });
    const dbStateAfterReset = await t.run(async (ctx) => {
      const lobby = await ctx.db.get(lobbyId);
      const pokes = await ctx.db
        .query("playerPokes")
        .withIndex("lobbyId", (query) => query.eq("lobbyId", lobbyId))
        .collect();
      const votes = await ctx.db
        .query("lobbyGameVotes")
        .withIndex("lobbyId", (query) => query.eq("lobbyId", lobbyId))
        .collect();

      return { lobby, pokes, votes };
    });

    expect(resetSnapshot.lobby).toMatchObject({
      _id: lobbyId,
      state: "Creation",
      currentRound: 0,
      activePlayerCount: 3,
    });
    expect(resetSnapshot.completion).toBeNull();
    expect(dbStateAfterReset.lobby?.state).toBe("Creation");
    expect(dbStateAfterReset.lobby?.currentRound).toBe(0);
    expect(dbStateAfterReset.lobby?.startedAt).toBeUndefined();
    expect(dbStateAfterReset.lobby?.completedAt).toBeUndefined();
    expect(dbStateAfterReset.pokes).toEqual([]);
    expect(dbStateAfterReset.votes).toEqual([]);
  });

  it("lists created lobbies separately from played lobbies", async () => {
    const t = createConvexTest();
    const owner = await createViewer(t, {
      name: "Owner",
      hasPasswordAccount: true,
    });
    const otherHost = await createViewer(t, {
      name: "Other Host",
      hasPasswordAccount: true,
    });

    const ownerCreated = await owner.client.mutation(
      api.lobbies.createLobby,
      {},
    );
    const otherCreated = await otherHost.client.mutation(
      api.lobbies.createLobby,
      {
        selectedGame: GAME_TWO,
      },
    );
    await owner.client.mutation(api.lobbies.joinLobbyByCode, {
      joinCode: otherCreated.joinCode,
    });

    const listed = await owner.client.query(api.lobbies.listViewerLobbies, {
      limit: 0,
    });

    expect(listed.created).toHaveLength(1);
    expect(listed.created[0]).toMatchObject({
      lobbyId: ownerCreated.lobbyId,
      joinCode: ownerCreated.joinCode,
      state: "Creation",
      activePlayerCount: 1,
    });
    expect(listed.played).toHaveLength(1);
    expect(listed.played[0]).toMatchObject({
      lobbyId: otherCreated.lobbyId,
      joinCode: otherCreated.joinCode,
      selectedGame: GAME_TWO,
      state: "Creation",
      activePlayerCount: 2,
    });
  });

  it("requires auth and a password-backed non-anonymous host to create lobbies", async () => {
    const t = createConvexTest();
    const guest = await createViewer(t, { isAnonymous: true });
    const signedInWithoutPassword = await createViewer(t);

    await expect(t.mutation(api.lobbies.createLobby, {})).rejects.toThrow(
      "You must be signed in to do that.",
    );
    await expect(
      guest.client.mutation(api.lobbies.createLobby, {}),
    ).rejects.toThrow("Only email/password accounts can create lobbies.");
    await expect(
      signedInWithoutPassword.client.mutation(api.lobbies.createLobby, {}),
    ).rejects.toThrow("Only email/password accounts can create lobbies.");
  });

  it("restricts host-only mutations to the lobby host", async () => {
    const t = createConvexTest();
    const { lobbyId, joinCode } = await createLobbyFixture(t);
    const member = await createViewer(t, { name: "Member" });
    const joined = await member.client.mutation(api.lobbies.joinLobbyByCode, {
      joinCode,
    });

    await expect(
      member.client.mutation(api.lobbies.selectGame, {
        lobbyId,
        game: GAME_TWO,
      }),
    ).rejects.toThrow("Only the lobby host can do that.");
    await expect(
      member.client.mutation(api.lobbies.addAiPlayer, {
        lobbyId,
        personalityType: "roasting",
      }),
    ).rejects.toThrow("Only the lobby host can do that.");
    await expect(
      member.client.mutation(api.lobbies.kickPlayer, {
        lobbyId,
        playerId: joined.playerId,
      }),
    ).rejects.toThrow("Only the lobby host can do that.");
    await expect(
      member.client.mutation(api.lobbies.startRound, { lobbyId }),
    ).rejects.toThrow("Only the lobby host can do that.");
    await expect(
      member.client.mutation(api.lobbies.completeLobby, {
        lobbyId,
        leaderboard: [{ displayName: "Member", rank: 1, score: 1 }],
      }),
    ).rejects.toThrow("Only the lobby host can do that.");
    await expect(
      member.client.mutation(api.lobbies.resetLobby, { lobbyId }),
    ).rejects.toThrow("Only the lobby host can do that.");
  });

  it("enforces membership and vote state rules", async () => {
    const t = createConvexTest();
    const { host, lobbyId, joinCode } = await createLobbyFixture(t);
    const member = await createViewer(t, { name: "Member" });
    const outsider = await createViewer(t, { name: "Outsider" });

    await expect(
      outsider.client.query(api.lobbies.getLobby, { lobbyId }),
    ).rejects.toThrow("You must be an active player in this lobby.");
    await expect(
      outsider.client.mutation(api.lobbies.voteForGame, {
        lobbyId,
        game: GAME_TWO,
      }),
    ).rejects.toThrow("You must be an active player in this lobby.");
    await expect(
      host.client.mutation(api.lobbies.voteForGame, {
        lobbyId,
        game: GAME_TWO,
      }),
    ).rejects.toThrow(
      "Hosts choose the active game directly instead of voting.",
    );

    await member.client.mutation(api.lobbies.joinLobbyByCode, { joinCode });
    await host.client.mutation(api.lobbies.startRound, { lobbyId });

    await expect(
      member.client.mutation(api.lobbies.voteForGame, {
        lobbyId,
        game: GAME_TWO,
      }),
    ).rejects.toThrow("Game votes are only advisory during lobby setup.");
    await expect(
      host.client.mutation(api.lobbies.selectGame, { lobbyId, game: GAME_TWO }),
    ).rejects.toThrow(
      "The host can only choose a game while the lobby is being set up.",
    );
    await expect(
      host.client.mutation(api.lobbies.addAiPlayer, {
        lobbyId,
        personalityType: "complimenting",
      }),
    ).rejects.toThrow(
      "AI players can only be added before the session starts.",
    );
  });

  it("guards joining, kicking, starting, and resetting in invalid states", async () => {
    const t = createConvexTest();
    const {
      host,
      lobbyId,
      joinCode,
      playerId: hostPlayerId,
    } = await createLobbyFixture(t);
    const member = await createViewer(t, { name: "Member" });
    const otherLobby = await createLobbyFixture(t);

    const joined = await member.client.mutation(api.lobbies.joinLobbyByCode, {
      joinCode,
    });
    const joinedAgain = await member.client.mutation(
      api.lobbies.joinLobbyByCode,
      {
        joinCode,
      },
    );

    expect(joinedAgain).toMatchObject({
      lobbyId,
      playerId: joined.playerId,
      joinCode,
      alreadyJoined: true,
      state: "Creation",
    });
    await expect(
      host.client.mutation(api.lobbies.kickPlayer, {
        lobbyId,
        playerId: otherLobby.playerId,
      }),
    ).rejects.toThrow("That player is not part of this lobby.");
    await expect(
      host.client.mutation(api.lobbies.kickPlayer, {
        lobbyId,
        playerId: hostPlayerId,
      }),
    ).rejects.toThrow("Hosts cannot remove themselves from their own lobby.");
    await expect(
      host.client.mutation(api.lobbies.kickPlayer, {
        lobbyId,
        playerId: joined.playerId,
      }),
    ).resolves.toEqual({ lobbyId, removedPlayerId: joined.playerId });
    await expect(
      host.client.mutation(api.lobbies.kickPlayer, {
        lobbyId,
        playerId: joined.playerId,
      }),
    ).rejects.toThrow("That player has already been removed.");

    const soloLobby = await createLobbyFixture(createConvexTest());

    await expect(
      soloLobby.host.client.mutation(api.lobbies.startRound, {
        lobbyId: soloLobby.lobbyId,
      }),
    ).rejects.toThrow(
      "At least two active players are required to start a round.",
    );
    await expect(
      host.client.mutation(api.lobbies.resetLobby, { lobbyId }),
    ).rejects.toThrow("Only a completed lobby can be reset.");
  });

  it("validates lobby completion payloads and blocks joining completed lobbies", async () => {
    const t = createConvexTest();
    const firstLobby = await createLobbyFixture(t);
    const firstMember = await createViewer(t, { name: "First Member" });
    await firstMember.client.mutation(api.lobbies.joinLobbyByCode, {
      joinCode: firstLobby.joinCode,
    });
    await firstLobby.host.client.mutation(api.lobbies.startRound, {
      lobbyId: firstLobby.lobbyId,
    });

    await expect(
      firstLobby.host.client.mutation(api.lobbies.completeLobby, {
        lobbyId: firstLobby.lobbyId,
        leaderboard: [],
      }),
    ).rejects.toThrow(
      "Completion results need at least one leaderboard entry.",
    );

    const secondLobby = await createLobbyFixture(t);
    const secondMember = await createViewer(t, { name: "Second Member" });
    const secondJoin = await secondMember.client.mutation(
      api.lobbies.joinLobbyByCode,
      {
        joinCode: secondLobby.joinCode,
      },
    );

    await expect(
      firstLobby.host.client.mutation(api.lobbies.completeLobby, {
        lobbyId: firstLobby.lobbyId,
        leaderboard: [
          {
            playerId: secondJoin.playerId,
            displayName: "Wrong Player",
            rank: 1,
            score: 99,
          },
        ],
      }),
    ).rejects.toThrow(
      "Leaderboard entries must reference players from the same lobby.",
    );

    const completed = await firstLobby.host.client.mutation(
      api.lobbies.completeLobby,
      {
        lobbyId: firstLobby.lobbyId,
        leaderboard: [
          {
            playerId: firstLobby.playerId,
            displayName: "Host",
            rank: 1,
            score: 10,
          },
        ],
      },
    );
    const outsider = await createViewer(t, { name: "Late Joiner" });

    expect(completed.state).toBe("Completion");
    await expect(
      outsider.client.mutation(api.lobbies.joinLobbyByCode, {
        joinCode: firstLobby.joinCode,
      }),
    ).rejects.toThrow(
      "This lobby has already wrapped up. Ask the host to reset it first.",
    );
  });

  it("only lets active players poke other human players during a live non-text round", async () => {
    const t = createConvexTest();
    const { host, lobbyId, joinCode } = await createLobbyFixture(t);
    const alice = await createViewer(t, { name: "Alice" });
    const bob = await createViewer(t, { name: "Bob" });

    const aliceJoin = await alice.client.mutation(api.lobbies.joinLobbyByCode, {
      joinCode,
    });
    const bobJoin = await bob.client.mutation(api.lobbies.joinLobbyByCode, {
      joinCode,
    });

    await expect(
      alice.client.mutation(api.lobbies.pokePlayer, {
        lobbyId,
        playerId: bobJoin.playerId,
      }),
    ).rejects.toThrow(
      "Players can only be poked while a round is in progress.",
    );

    await host.client.mutation(api.lobbies.startRound, { lobbyId });

    await expect(
      alice.client.mutation(api.lobbies.pokePlayer, {
        lobbyId,
        playerId: aliceJoin.playerId,
      }),
    ).rejects.toThrow("You cannot poke yourself.");

    const poke = await alice.client.mutation(api.lobbies.pokePlayer, {
      lobbyId,
      playerId: bobJoin.playerId,
    });

    expect(poke.playerId).toBe(bobJoin.playerId);
  });
});
