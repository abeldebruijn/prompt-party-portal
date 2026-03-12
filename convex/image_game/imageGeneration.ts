import { generateImage, gateway } from "ai";

const MOCK_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO9Ww2kAAAAASUVORK5CYII=";

export async function generateImageBytesForPrompt(prompt: string): Promise<{
  bytes: Uint8Array;
  mediaType: string;
}> {
  if (process.env.IMAGE_GAME_MOCK === "1") {
    return {
      bytes: Uint8Array.from(Buffer.from(MOCK_PNG_BASE64, "base64")),
      mediaType: "image/png",
    };
  }

  const { image } = await generateImage({
    model: gateway.image("openai/gpt-image-1-mini"),
    prompt,
  });

  return {
    bytes: new Uint8Array(image.uint8Array),
    mediaType: image.mediaType,
  };
}
