"use node";

import { v } from "convex/values";

import type { Id } from "../_generated/dataModel";
import { internal as internalApi } from "../_generated/api";
import { action } from "../_generated/server";
import { generateImageBytesForPrompt } from "./imageGeneration";

// Avoid a type-level self-import cycle (this module is part of the generated API).
const internal = internalApi as any;

export const submitPrompt = action({
  args: {
    lobbyId: v.id("lobbies"),
    prompt: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.image_game.eligibility.getSubmitPromptContext, {
      lobbyId: args.lobbyId,
    });

    const { bytes, mediaType } = await generateImageBytesForPrompt(args.prompt);
    const storageId = await ctx.storage.store(
      new Blob([Buffer.from(bytes)], { type: mediaType }),
    );

    return await ctx.runMutation(
      internal.image_game.mutations.submitGeneratedImage,
      {
        lobbyId: args.lobbyId,
        prompt: args.prompt,
        imageStorageId: storageId as Id<"_storage">,
        imageMediaType: mediaType,
      },
    );
  },
});
