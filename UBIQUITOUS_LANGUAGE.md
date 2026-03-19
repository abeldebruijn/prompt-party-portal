# Ubiquitous Language

## Session structure

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Lobby** | A pre-game room where players gather, choose a game mode, and start a session. | Room, match, channel |
| **Game Mode** | A distinct playable ruleset that can be selected in a lobby. | Game, variant, mini-game |
| **Session** | A full run of a single game mode inside a lobby. | Match, run, playthrough |
| **Round** | One timed unit of play inside a session. | Turn, question, phase |
| **Stage** | A session sub-phase such as setup, playing, waiting, or completion. | Step, screen, state |
| **Prompt (updated)** | Text that describes what should be generated or what a player inferred from an image. | Scenario, question, description |
| **Seed Prompt (new)** | The original prompt created during setup that starts a chain. | Setup question, starter prompt |
| **Setup Slot (new)** | One numbered prompt-and-image slot a player fills during setup. | Prompt slot, question slot |
| **Source Image (new)** | The image a player sees at the start of their turn. | Current image, shown image |

## People and roles

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Player** | A participant in a lobby, whether human or AI. | User, member |
| **Host** | The player who controls lobby setup and starts or resets a session. | Admin, owner |
| **Participant** | A Player eligible to submit an answer during a Round. | Responder, contestant |
| **Judge** | The selected Player who does not submit and instead evaluates anonymous submissions for the Round. | Target, chooser, scorer |
| **Target Player** | The Player the Prompt is about in a Round. | Subject, person |
| **Viewer** | The current authenticated person looking at the UI. | User, client |

## Core gameplay artifacts

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Submission (updated)** | A player's in-round prompt entry for the current source image. | Response, answer, pick |
| **Text Submission** | A submission whose content is a short written answer. | Text answer, phrase |
| **Image Submission (updated)** | A submission whose prompt produces a generated image artifact. | Generated image, picture |
| **Image Prompt (updated)** | The text a player writes to generate an image. | Description, image answer |
| **Preview** | A temporary generated image a player can inspect before finalizing. | Draft image, sample |
| **Similarity Score (new)** | One scored comparison between two prompts using vector similarity. | Match score, likeness |
| **Round Score (new)** | The sum of the two similarity scores awarded for one round. | Points, turn score |
| **Leaderboard** | The running ranking of players across a session. | Scoreboard, standings |
| **Completion Summary (new)** | The short session-ending text stored with lobby completion data. | End summary, recap text |

## Feed It Forward

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Feed It Forward (new)** | A game mode where players pass image chains by repeatedly describing source images with prompts. | Telephone game, image game |
| **Chain (new)** | The ordered sequence of prompts and generated images for one seed prompt. | Thread, lane, track |
| **Chain Owner (new)** | The player whose setup slot created a chain. | Prompt owner, slot owner |
| **Chain Step (new)** | One prompt-image pair inside a chain at a specific step number. | Hop result, chain item |
| **Player Circle (new)** | The fixed player order used to route turns around the table. | Rotation, seating order |
| **Hop (new)** | One pass of a chain from one player to the next inside a slot cycle. | Pass, handoff |
| **Waiting For Images (new)** | The session stage where locked submissions are still generating images. | Processing, loading stage |
| **Fallback Image (new)** | The last successfully generated image reused when a player times out. | Previous image, backup image |
| **Auto-Fill Seed (new)** | A system-generated seed prompt and image created for an unfinished setup slot. | Default prompt, filler seed |
| **Partial Recap (new)** | The per-round summary shown before the next round starts. | Round recap, personal recap |
| **Chain Gallery (new)** | The final completion view showing every step of every chain. | Final reveal, gallery |

## Active game modes

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Text Game (new)** | The judge-based mode where players submit text answers to a round prompt. | Writing game, answer game |
| **Image Game (new)** | The judge-based mode where players submit image prompts that generate images for judging. | Picture game, art game |
| **Feed It Forward (new)** | The chain-based mode where players infer prompts from images across multiple rounds. | Telephone game, image chain mode |

## Relationships

- A **Lobby** hosts zero or one active **Session** at a time.
- A **Game Mode** defines the rules for a **Session**.
- A **Session** contains one or more **Rounds**.
- A **Feed It Forward** **Session** contains one **Player Circle**.
- A **Player Circle** contains two or more **Players** in fixed order.
- A **Player** owns zero or more **Setup Slots**.
- A finalized **Setup Slot** creates exactly one **Seed Prompt** and one initial **Source Image**.
- A **Seed Prompt** starts exactly one **Chain**.
- A **Chain** belongs to exactly one **Chain Owner**.
- A **Chain** contains one or more **Chain Steps** ordered by step number.
- A **Submission** may create one new **Chain Step**.
- A timed-out turn creates no new **Chain Step** and falls back to the current **Fallback Image**.
- A **Round Score** is the sum of exactly two **Similarity Scores**.
- A **Leaderboard** aggregates **Round Score** across the **Session**.
- A **Chain Gallery** reveals the full set of **Chain Steps** after **Completion**.

## Example dialogue

> **Dev:** "In **Feed It Forward**, is the player reacting to the last **Prompt** or the last **Source Image**?"
> **Domain expert:** "They react to the **Source Image** only. The hidden **Prompt** exists for scoring and for generating the next **Chain Step**."
> **Dev:** "If someone misses the timer, do we break the **Chain**?"
> **Domain expert:** "No. That turn creates no **Submission**, and the next player sees the **Fallback Image**, which is the last successful image in that **Chain**."
> **Dev:** "So the final reveal is a **Leaderboard** plus a **Chain Gallery**?"
> **Domain expert:** "Exactly. The **Leaderboard** shows score outcomes, while the **Chain Gallery** shows how each **Seed Prompt** drifted across the session."

## Flagged ambiguities

- "game" was used to mean both the selectable ruleset and one live run. Use **Game Mode** for the ruleset and **Session** for one run.
- "prompt" was used for both the original setup text and later guessed text. Use **Seed Prompt** for the setup origin and **Submission** or **Prompt** for later in-round text.
- "image" was used for both the visible turn artifact and the hidden generated result. Use **Source Image** for the image shown to the current player and **Chain Step** when referring to the stored prompt-image result.
- "round" and "hop" are related but not equal. Use **Round** for the global timed phase and **Hop** for a chain's pass position within a slot cycle.
- "image game" could mean the existing judge-based mode or any image-based mode. Use **Image Game** for the current judge-based mode and **Feed It Forward** for the chain mode.
