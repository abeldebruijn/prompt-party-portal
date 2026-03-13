"use server";

import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { generateImage, gateway } from "ai";

import { api, type Id } from "@/lib/convex-server";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL as string;

if (!convexUrl) {
  throw new Error("NEXT_PUBLIC_CONVEX_URL is required for Convex.");
}

export async function submitPrompt(args: {
  lobbyId: Id<"lobbies">;
  prompt: string;
}) {
  const token = await convexAuthNextjsToken();
  if (!token) {
    throw new Error("You must be signed in to do that.");
  }

  const client = new ConvexHttpClient(convexUrl);
  client.setAuth(token);

  const uploadUrl = await client.mutation(api.imageGame.generateUploadUrl, {
    lobbyId: args.lobbyId,
  });

  const { image } = await generateImage({
    model: gateway.image("openai/gpt-image-1-mini"),
    prompt: args.prompt,
    size: "1024x1024",
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

  return await client.mutation(api.imageGame.submitGeneratedImage, {
    lobbyId: args.lobbyId,
    prompt: args.prompt,
    imageStorageId: uploadJson.storageId as unknown as Id<"_storage">,
    imageMediaType: image.mediaType,
  });
}
