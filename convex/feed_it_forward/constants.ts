import type { ImageModel, LanguageModel } from "ai";

export const FEED_IT_FORWARD_EMBEDDING_DIMENSIONS = 1536;
export const FEED_IT_FORWARD_MINIMUM_INTER_ROUND_WAIT_MS = 15_000;
export const FEED_IT_FORWARD_PROMPT_WRITER_INSTRUCTIONS = `You are a whimsical prompt‑writer for the game **Feed It Forward**.
Create a single, vivid description of an *impossible* scene that could never happen in real life, but is full of fun, creativity, and a touch of nonsense.

Guidelines

1. **Impossible scenario** – the core idea must be something that cannot exist in reality (e.g., a flying fish market, a dancing mountain).
2. **Subject & Action** – start with a clear subject (character, creature, object) and what it is doing.
3. **Details & Adjectives** – add at least three eye‑catching details (colors, textures, accessories, lighting, whimsical elements).
4. **Style cue (optional)** – you may mention a visual style (e.g., “in a cartoon‑style illustration”, “as a pastel‑colored dreamscape”).
5. **Length** – keep the whole prompt between 30‑80 words so the image stays focused yet rich.

**Template example**

> *A [adjective] [creature/object] [verb] [preposition] a [fantastical setting], wearing/holding/covered in [detail 1], [detail 2] and [detail 3].*

**Now write a new prompt that follows the template and satisfies the “impossible, fun, creative, nonsense” criteria.**
`;

export const FEED_IT_FORWARD_IMAGE_MODEL: ImageModel =
  "prodia/flux-fast-schnell";
export const FEED_IT_FORWARD_TEXT_MODEL: LanguageModel = "openai/gpt-oss-120b";
export const FEED_IT_FORWARD_EMBEDDING_MODEL: LanguageModel =
  "openai/text-embedding-3-small";
