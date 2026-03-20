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
  FEED_IT_FORWARD_VISION_MODEL,
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

function decodeBase64(base64: string) {
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

const FEED_IT_FORWARD_ANIMALS = [
  "otter",
  "penguin",
  "fox",
  "raccoon",
  "flamingo",
  "koala",
  "octopus",
  "panther",
  "llama",
  "parrot",
  "hedgehog",
  "seal",
  "wolf",
  "peacock",
  "gecko",
  "yak",
  "lobster",
  "hamster",
  "meerkat",
  "toucan",
] as const;

const FEED_IT_FORWARD_OBJECTS = [
  "teapot",
  "lantern",
  "typewriter",
  "skateboard",
  "accordion",
  "telescope",
  "umbrella",
  "clock",
  "backpack",
  "crown",
  "rocket",
  "snow globe",
  "violin",
  "kettle",
  "helmet",
  "suitcase",
  "disco ball",
  "camera",
  "bookcase",
  "carousel",
] as const;

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
  const values = Array.from<number>({
    length: FEED_IT_FORWARD_EMBEDDING_DIMENSIONS,
  }).fill(0);
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
  const subjectPool = [...FEED_IT_FORWARD_ANIMALS, ...FEED_IT_FORWARD_OBJECTS];
  const subject = subjectPool[Math.floor(Math.random() * subjectPool.length)];

  if (process.env.FEED_IT_FORWARD_MOCK === "1") {
    return setupPromptPartsSchema.parse({
      subject: `A velvet ${subject}`,
      action: "sails across a lemon thunderstorm",
      detail1: "mirror-bright boots",
      detail2: "mint lanterns",
      detail3: "ribbons of stardust",
    });
  }

  const { output } = await generateText({
    model: FEED_IT_FORWARD_TEXT_MODEL,
    output: Output.object({
      schema: setupPromptPartsSchema.omit({ subject: true }),
    }),
    prompt: `${FEED_IT_FORWARD_PROMPT_WRITER_INSTRUCTIONS}

The subject has already been chosen. Use this exact subject phrase and do not replace it:
- subject: A whimsical ${subject}

Return an object with exactly these fields:
- action: what it does
- detail1
- detail2
- detail3

Keep the action and details compatible with the fixed subject.`,
  });

  return normalizeSetupPromptParts({
    subject: `A whimsical ${subject}`,
    ...output,
  });
}

async function generatePromptImage(prompt: string) {
  if (process.env.FEED_IT_FORWARD_MOCK === "1") {
    return {
      mediaType: "image/png",
      uint8Array: decodeBase64(TEST_PNG_BASE64),
    };
  }

  const result = await generateImage({
    model: FEED_IT_FORWARD_IMAGE_MODEL,
    prompt,
    size: "512x512",
  });

  return {
    mediaType: result.image.mediaType,
    uint8Array: new Uint8Array(result.image.uint8Array),
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
    body,
  });

  if (!response.ok) {
    throw new Error("Failed to upload the generated image to Convex.");
  }

  const json = (await response.json()) as { storageId: string };
  return json.storageId as Id<"_storage">;
}

async function storeGeneratedImage(
  ctx: ActionCtx,
  mediaType: string,
  body: Uint8Array,
) {
  if (process.env.FEED_IT_FORWARD_MOCK === "1") {
    return await ctx.storage.store(new Blob([body], { type: mediaType }));
  }

  const uploadUrl = await ctx.runMutation(
    internal.feedItForwardInternal.generateUploadUrl,
    {},
  );
  return await uploadGeneratedImage(uploadUrl, mediaType, body);
}

function buildAiPromptTone(
  personalityType: "roasting" | "complimenting" | "custom",
  customPrompt: string | null,
) {
  switch (personalityType) {
    case "roasting":
      return "Use a lightly teasing, smug tone, but keep the prompt usable for image generation.";
    case "custom":
      return customPrompt
        ? `Lightly reflect this personality without harming gameplay clarity: ${customPrompt}`
        : "Keep the tone lightly distinctive, but gameplay clarity comes first.";
    default:
      return "Use a lightly warm, delighted tone, but keep the prompt usable for image generation.";
  }
}

async function generateAiRoundPrompt(args: {
  imageData: Uint8Array;
  mediaType: string;
  sourcePrompt: string;
  playerDisplayName: string;
  personalityType: "roasting" | "complimenting" | "custom";
  customPrompt: string | null;
}) {
  if (process.env.FEED_IT_FORWARD_MOCK === "1") {
    const tonePrefix =
      args.personalityType === "roasting"
        ? "A cheeky"
        : args.personalityType === "custom"
          ? "A curious"
          : "A delightful";
    return `${tonePrefix} impossible scene guessed by ${args.playerDisplayName}: ${args.sourcePrompt}`;
  }

  const { text } = await generateText({
    model: FEED_IT_FORWARD_VISION_MODEL,
    system: `You are playing Feed It Forward as an AI Player.
Infer the original image-generation prompt from the source image.
Return exactly one vivid sentence between 12 and 40 words.
Describe an impossible, whimsical scene suitable for image generation.
Do not mention ratings, games, prompts, judges, players, or that you are looking at an image.
${buildAiPromptTone(args.personalityType, args.customPrompt)}`,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Guess the hidden prompt for this source image. Preserve the core scene if possible, but it is okay if details drift. Keep it concise and visual.`,
          },
          {
            type: "image",
            image: args.imageData,
            mediaType: args.mediaType,
          },
        ],
      },
    ],
  });

  return text.trim().replace(/\s+/g, " ").slice(0, 240);
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
): Promise<{ storageId: Id<"_storage">; updatedAt: number }> => {
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
  const storageId = await storeGeneratedImage(
    ctx,
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
    const storageId = await storeGeneratedImage(
      ctx,
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

export const generateCreationAiSetupSlot = internalAction({
  args: {
    lobbyId: v.id("lobbies"),
    playerId: v.id("lobbyPlayers"),
    slotIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const payload = await ctx.runQuery(
      internal.feedItForwardInternal.getCreationAiSetupPayload,
      args,
    );

    if (payload === null) {
      return;
    }

    const promptParts = await generatePromptParts();
    const prompt = composeSetupPrompt(promptParts);
    const [image, embedding] = await Promise.all([
      generatePromptImage(prompt),
      generatePromptEmbedding(prompt),
    ]);
    const storageId = await storeGeneratedImage(
      ctx,
      image.mediaType,
      image.uint8Array,
    );

    await ctx.runMutation(
      internal.feedItForwardInternal.storeSetupGenerationResult,
      {
        lobbyId: payload.lobbyId,
        playerId: payload.playerId,
        slotIndex: payload.slotIndex,
        prompt,
        promptParts,
        promptEmbedding: embedding,
        imageStorageId: storageId,
        imageMediaType: image.mediaType,
        isAutoFilled: true,
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
  const storageId = await storeGeneratedImage(
    ctx,
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

export const generateAiRoundSubmission = internalAction({
  args: {
    lobbyId: v.id("lobbies"),
    roundId: v.id("feedItForwardRounds"),
    playerId: v.id("lobbyPlayers"),
  },
  handler: async (ctx, args) => {
    const payload = await ctx.runQuery(
      internal.feedItForwardInternal.getAiRoundSubmissionPayload,
      args,
    );

    if (payload === null) {
      return;
    }

    const sourceImage = await ctx.storage.get(payload.sourceImageStorageId);

    if (sourceImage === null) {
      return;
    }

    const prompt = await generateAiRoundPrompt({
      imageData: new Uint8Array(await sourceImage.arrayBuffer()),
      mediaType: payload.sourceImageMediaType,
      sourcePrompt: payload.sourcePrompt,
      playerDisplayName: payload.playerDisplayName,
      personalityType: payload.personalityType,
      customPrompt: payload.customPrompt,
    });

    await ctx.runMutation(internal.feedItForwardInternal.submitPromptAsPlayer, {
      lobbyId: payload.lobbyId,
      playerId: payload.playerId,
      prompt,
    });
  },
});
