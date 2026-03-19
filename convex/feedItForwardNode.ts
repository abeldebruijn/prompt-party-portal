"use node";

import { embed, gateway, generateImage, generateText, Output } from "ai";
import { v } from "convex/values";
import { z } from "zod";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { type ActionCtx, action, internalAction } from "./_generated/server";
import {
  FEED_IT_FORWARD_EMBEDDING_DIMENSIONS,
  FEED_IT_FORWARD_EMBEDDING_MODEL,
  FEED_IT_FORWARD_IMAGE_MODEL,
  FEED_IT_FORWARD_PROMPT_WRITER_INSTRUCTIONS,
  FEED_IT_FORWARD_TEXT_MODEL,
} from "./feed_it_forward/constants";
import { mapVectorScore } from "./feed_it_forward/helpers";

const TEST_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO9Ww2kAAAAASUVORK5CYII=";

const gatewayProvider = gateway as unknown as {
  embeddingModel: (modelId: string) => Parameters<typeof embed>[0]["model"];
  languageModel: (
    modelId: string,
  ) => Parameters<typeof generateText>[0]["model"];
  image: (modelId: string) => Parameters<typeof generateImage>[0]["model"];
};

const setupPromptPartsSchema = z.object({
  subject: z.string().trim().min(1).max(80),
  action: z.string().trim().min(1).max(120),
  detail1: z.string().trim().min(1).max(120),
  detail2: z.string().trim().min(1).max(120),
  detail3: z.string().trim().min(1).max(120),
});

type SetupPromptParts = z.infer<typeof setupPromptPartsSchema>;

function normalizePromptPart(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 120);
}

function normalizeSetupPromptParts(promptParts: SetupPromptParts) {
  return setupPromptPartsSchema.parse({
    subject: normalizePromptPart(promptParts.subject),
    action: normalizePromptPart(promptParts.action),
    detail1: normalizePromptPart(promptParts.detail1),
    detail2: normalizePromptPart(promptParts.detail2),
    detail3: normalizePromptPart(promptParts.detail3),
  });
}

function composeSetupPrompt(promptParts: SetupPromptParts) {
  const normalized = normalizeSetupPromptParts(promptParts);
  return `${normalized.subject} ${normalized.action}, with ${normalized.detail1}, ${normalized.detail2}, and ${normalized.detail3}.`;
}

function deterministicEmbedding(input: string) {
  const values = new Array<number>(FEED_IT_FORWARD_EMBEDDING_DIMENSIONS);
  let seed = 2166136261;

  for (const character of input) {
    seed ^= character.charCodeAt(0);
    seed = Math.imul(seed, 16777619) >>> 0;
  }

  for (let index = 0; index < values.length; index += 1) {
    seed = Math.imul(seed ^ (index + 1), 16777619) >>> 0;
    values[index] = ((seed % 2000) / 1000 - 1) * 0.25;
  }

  return values;
}

async function generatePromptEmbedding(prompt: string) {
  if (process.env.FEED_IT_FORWARD_MOCK === "1") {
    return deterministicEmbedding(prompt);
  }

  const result = await embed({
    model: gatewayProvider.embeddingModel(FEED_IT_FORWARD_EMBEDDING_MODEL),
    value: prompt,
  });

  return result.embedding;
}

async function generatePromptParts() {
  if (process.env.FEED_IT_FORWARD_MOCK === "1") {
    return setupPromptPartsSchema.parse({
      subject: "A velvet otter orchestra",
      action: "sails across a lemon thunderstorm",
      detail1: "mirror-bright boots",
      detail2: "mint lanterns",
      detail3: "ribbons of stardust",
    });
  }

  const { output } = await generateText({
    model: gatewayProvider.languageModel(FEED_IT_FORWARD_TEXT_MODEL),
    output: Output.object({
      schema: setupPromptPartsSchema,
    }),
    prompt: `${FEED_IT_FORWARD_PROMPT_WRITER_INSTRUCTIONS}

Return an object with exactly these fields:
- subject: the animal or object
- action: what it does
- detail1
- detail2
- detail3`,
  });

  return normalizeSetupPromptParts(output);
}

async function generatePromptImage(prompt: string) {
  if (process.env.FEED_IT_FORWARD_MOCK === "1") {
    return {
      mediaType: "image/png",
      uint8Array: Buffer.from(TEST_PNG_BASE64, "base64"),
    };
  }

  const result = await generateImage({
    model: gatewayProvider.image(FEED_IT_FORWARD_IMAGE_MODEL),
    prompt,
    size: "512x512",
  });

  return {
    mediaType: result.image.mediaType,
    uint8Array: Buffer.from(result.image.uint8Array),
  };
}

async function uploadGeneratedImage(
  uploadUrl: string,
  mediaType: string,
  body: Uint8Array,
) {
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": mediaType,
    },
    body: Buffer.from(body),
  });

  if (!response.ok) {
    throw new Error("Failed to upload the generated image to Convex.");
  }

  const json = (await response.json()) as { storageId: string };
  return json.storageId as Id<"_storage">;
}

export const generateSetupPrompt = action({
  args: {},
  handler: async () => {
    return {
      promptParts: await generatePromptParts(),
    };
  },
});

type SetupImageArgs = {
  lobbyId: Id<"lobbies">;
  slotIndex: number;
  promptParts: SetupPromptParts;
};

const generateSetupImageHandler = async (
  ctx: ActionCtx,
  args: SetupImageArgs,
) => {
  const membership = (await ctx.runQuery(
    internal.feedItForwardInternal.getSetupSlotPayload,
    {
      lobbyId: args.lobbyId,
      slotIndex: args.slotIndex,
    },
  )) as { playerId: Id<"lobbyPlayers"> };
  const promptParts = normalizeSetupPromptParts(args.promptParts);
  const prompt = composeSetupPrompt(promptParts).slice(0, 240);

  await ctx.runMutation(internal.feedItForwardInternal.markSetupGenerating, {
    lobbyId: args.lobbyId,
    playerId: membership.playerId,
    slotIndex: args.slotIndex,
    isAutoFilled: false,
  });

  const [image, embedding] = await Promise.all([
    generatePromptImage(prompt),
    generatePromptEmbedding(prompt),
  ]);
  const uploadUrl = await ctx.runMutation(
    internal.feedItForwardInternal.generateUploadUrl,
    {},
  );
  const storageId = await uploadGeneratedImage(
    uploadUrl,
    image.mediaType,
    image.uint8Array,
  );

  return await ctx.runMutation(
    internal.feedItForwardInternal.storeSetupGenerationResult,
    {
      lobbyId: args.lobbyId,
      playerId: membership.playerId,
      slotIndex: args.slotIndex,
      prompt,
      promptParts,
      promptEmbedding: embedding,
      imageStorageId: storageId,
      imageMediaType: image.mediaType,
      isAutoFilled: false,
    },
  );
};

export const generateSetupImage = action({
  args: {
    lobbyId: v.id("lobbies"),
    slotIndex: v.number(),
    promptParts: v.object({
      subject: v.string(),
      action: v.string(),
      detail1: v.string(),
      detail2: v.string(),
      detail3: v.string(),
    }),
  },
  handler: generateSetupImageHandler,
});

export const generateAutoFillSetupSlot = internalAction({
  args: {
    sessionId: v.id("feedItForwardSessions"),
    lobbyId: v.id("lobbies"),
    playerId: v.id("lobbyPlayers"),
    slotIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const promptParts = await generatePromptParts();
    const prompt = composeSetupPrompt(promptParts);
    const [image, embedding] = await Promise.all([
      generatePromptImage(prompt),
      generatePromptEmbedding(prompt),
    ]);
    const uploadUrl = await ctx.runMutation(
      internal.feedItForwardInternal.generateUploadUrl,
      {},
    );
    const storageId = await uploadGeneratedImage(
      uploadUrl,
      image.mediaType,
      image.uint8Array,
    );

    await ctx.runMutation(
      internal.feedItForwardInternal.storeSetupGenerationResult,
      {
        lobbyId: args.lobbyId,
        playerId: args.playerId,
        slotIndex: args.slotIndex,
        prompt,
        promptParts,
        promptEmbedding: embedding,
        imageStorageId: storageId,
        imageMediaType: image.mediaType,
        isAutoFilled: true,
      },
    );
    await ctx.runMutation(
      internal.feedItForwardInternal.finalizeSetupSlotForSession,
      {
        sessionId: args.sessionId,
        playerId: args.playerId,
        slotIndex: args.slotIndex,
      },
    );
  },
});

type RoundSubmissionArgs = {
  submissionId: Id<"feedItForwardSubmissions">;
  generationNonce: number;
};

const generateRoundSubmissionImageHandler = async (
  ctx: ActionCtx,
  args: RoundSubmissionArgs,
) => {
  const payload = await ctx.runQuery(
    internal.feedItForwardInternal.getSubmissionGenerationPayload,
    {
      submissionId: args.submissionId,
    },
  );

  if (
    payload === null ||
    payload.latestGenerationNonce !== args.generationNonce
  ) {
    return;
  }

  const [image, embedding] = await Promise.all([
    generatePromptImage(payload.prompt),
    generatePromptEmbedding(payload.prompt),
  ]);
  const uploadUrl = await ctx.runMutation(
    internal.feedItForwardInternal.generateUploadUrl,
    {},
  );
  const storageId = await uploadGeneratedImage(
    uploadUrl,
    image.mediaType,
    image.uint8Array,
  );
  const [previousMatch, originalMatch] = await Promise.all([
    ctx.vectorSearch("feedItForwardChainSteps", "by_prompt_embedding", {
      vector: embedding,
      limit: 1,
      filter: (q) => q.eq("sourceKey", payload.previousSourceKey),
    }),
    ctx.vectorSearch("feedItForwardChainSteps", "by_prompt_embedding", {
      vector: embedding,
      limit: 1,
      filter: (q) => q.eq("sourceKey", payload.originalSourceKey),
    }),
  ]);

  await ctx.runMutation(
    internal.feedItForwardInternal.finalizeRoundSubmission,
    {
      submissionId: args.submissionId,
      generationNonce: args.generationNonce,
      promptEmbedding: embedding,
      imageStorageId: storageId,
      imageMediaType: image.mediaType,
      previousSimilarity: previousMatch[0]?._score ?? 0,
      originalSimilarity: originalMatch[0]?._score ?? 0,
      previousScore: mapVectorScore(previousMatch[0]?._score ?? 0),
      originalScore: mapVectorScore(originalMatch[0]?._score ?? 0),
    },
  );
};

export const generateRoundSubmissionImage = internalAction({
  args: {
    submissionId: v.id("feedItForwardSubmissions"),
    generationNonce: v.number(),
  },
  handler: generateRoundSubmissionImageHandler,
});
