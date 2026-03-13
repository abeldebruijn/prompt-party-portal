"use server";

import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { generateImage, gateway } from "ai";

import { sanitizeImageGamePrompt } from "../../../../convex/lib/lobby";
import { api, type Id } from "@/lib/convex-server";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL as string;

if (!convexUrl) {
  throw new Error("NEXT_PUBLIC_CONVEX_URL is required for Convex.");
}

function sanitizePromptOrThrow(prompt: string) {
  const sanitized = sanitizeImageGamePrompt(prompt);

  if (sanitized.length < 1) {
    throw new Error("Submissions need at least one visible character.");
  }

  return sanitized;
}

async function createAuthenticatedClient() {
  const token = await convexAuthNextjsToken();
  if (!token) {
    throw new Error("You must be signed in to do that.");
  }

  const client = new ConvexHttpClient(convexUrl);
  client.setAuth(token);
  return client;
}

export async function generateImagePreview(args: {
  lobbyId: Id<"lobbies">;
  prompt: string;
}) {
  const client = await createAuthenticatedClient();
  const prompt = sanitizePromptOrThrow(args.prompt);

  const { image } = await generateImage({
    model: gateway.image("openai/gpt-image-1-mini"),
    prompt,
    size: "1024x1024",
  });

  const uploadUrl = await client.mutation(api.imageGame.generateUploadUrl, {
    lobbyId: args.lobbyId,
  });

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": image.mediaType,
    },
    body: Buffer.from(image.uint8Array),
  });

  if (!uploadResponse.ok) {
    throw new Error("Failed to upload generated image to Convex storage.");
  }

  const uploadJson = (await uploadResponse.json()) as { storageId: string };
  const storageId = uploadJson.storageId as unknown as Id<"_storage">;
  const imageUrl = await client.query(api.imageGame.getPreviewImageUrl, {
    lobbyId: args.lobbyId,
    storageId,
  });

  if (imageUrl === null) {
    throw new Error("The generated preview could not be loaded.");
  }

  return {
    prompt,
    mediaType: image.mediaType,
    storageId,
    imageUrl,
  };
}

export async function submitGeneratedPreview(args: {
  lobbyId: Id<"lobbies">;
  prompt: string;
  storageId: Id<"_storage">;
  mediaType: string;
}) {
  const client = await createAuthenticatedClient();
  const prompt = sanitizePromptOrThrow(args.prompt);

  if (!args.mediaType.startsWith("image/")) {
    throw new Error("The generated preview is not a valid image.");
  }

  return await client.mutation(api.imageGame.submitGeneratedImage, {
    lobbyId: args.lobbyId,
    prompt,
    imageStorageId: args.storageId,
    imageMediaType: args.mediaType,
  });
}
