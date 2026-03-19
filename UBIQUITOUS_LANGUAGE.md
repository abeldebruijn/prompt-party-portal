# Ubiquitous Language

## Session structure

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Lobby** | A pre-game room where players gather, choose a game, and start a session. | Room, match, channel |
| **Game Mode** | A distinct playable ruleset that can be selected in a Lobby. | Game, variant, mini-game |
| **Session** | A full run of a single Game Mode inside a Lobby. | Match, run, playthrough |
| **Round** | One prompt-driven unit of play within a Session. | Turn, question, phase |
| **Stage** | A sub-phase inside a Round such as Generate, Judge, or Present. | Step, screen, state |
| **Prompt** | The situation or template shown to players for a Round. | Scenario, question, challenge |
| **Prompt Set** | The reusable library of stored prompt templates used to create Rounds. | Deck, bank, list |

## People and roles

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Player** | A participant in a Lobby, whether human or AI. | User, member |
| **Host** | The Player who controls Lobby setup and starts or resets a Session. | Admin, owner |
| **Participant** | A Player eligible to submit an answer during a Round. | Responder, contestant |
| **Judge** | The selected Player who does not submit and instead evaluates anonymous submissions for the Round. | Target, chooser, scorer |
| **Target Player** | The Player the Prompt is about in a Round. | Subject, person |
| **Viewer** | The current authenticated person looking at the UI. | User, client |

## Core gameplay artifacts

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Submission** | A player's anonymous entry for a Round. | Response, pick, item |
| **Text Submission** | A Submission whose content is a short written answer. | Text answer, phrase |
| **Image Submission** | A Submission whose content is a generated image plus its source prompt. | Generated image, picture |
| **Image Prompt** | The text a player writes to generate an image for an Image Submission. | Description, image answer |
| **Preview** | A temporary generated image a player can inspect before submitting. | Draft image, sample |
| **Rating** | A judge's score for a Submission on one scoring axis. | Vote, mark, grade |
| **Correctness Score** | The score representing how well a Submission fits the Target Player and Prompt. | Accuracy, fit score |
| **Creativity Score** | The score representing how original or entertaining a Submission is. | Style score, fun score |
| **Total Score** | The combined score assigned to a Submission after judging. | Points, final rating |
| **Winner** | The highest-scoring Submission for a Round. | Best answer, top pick |
| **Leaderboard** | The running ranking of Players across a Session. | Scoreboard, standings |

## Candidate game modes

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Consensus Vote Mode** | A Game Mode where the room votes on the best anonymous Submission instead of using a single Judge. | Poll game, audience judge |
| **Caption Mode** | A Game Mode where all players caption the same shared image with text submissions. | Meme caption game, react-to-image |
| **Reveal-and-Guess Mode** | A Game Mode where one real Submission is mixed with decoys and the room tries to identify the real one. | Bluff mode, decoy game, social deduction mode |
| **Decoy Submission** | A fake Submission included to make the real Submission harder to identify. | Bluff, fake answer |
| **Guesser** | A Player trying to identify the real Submission in Reveal-and-Guess Mode. | Voter, detective |

## Relationships

- A **Lobby** hosts zero or one active **Session** at a time.
- A **Game Mode** defines the rules for a **Session**.
- A **Session** contains one or more **Rounds**.
- A **Round** is created from exactly one **Prompt**.
- A **Round** contains one or more **Stages**.
- A **Judge** is a **Player** role within a single **Round**.
- A **Target Player** is the person a **Prompt** refers to within a **Round**.
- A **Participant** creates at most one **Submission** per **Round**.
- A **Submission** receives zero or more **Ratings** and may produce a **Total Score**.
- A **Winner** is selected from the **Submissions** of a **Round**.
- A **Leaderboard** aggregates **Total Score** across the **Session**.
- **Consensus Vote Mode**, **Caption Mode**, and **Reveal-and-Guess Mode** are all **Game Modes**.
- A **Decoy Submission** exists only inside **Reveal-and-Guess Mode**.

## Example dialogue

> **Dev:** "In **Caption Mode**, is the shared image the **Prompt**, or do we still need a separate **Prompt**?"
> **Domain expert:** "The shared image is the main prompt artifact for that **Round**, but we should still call the round input a **Prompt** so the structure stays consistent across **Game Modes**."
> **Dev:** "In **Consensus Vote Mode**, do we still have a **Judge**?"
> **Domain expert:** "No. That mode replaces the **Judge** with room-wide voting, so the room produces the winning **Submission** collectively."
> **Dev:** "And in **Reveal-and-Guess Mode**, the fake entries are **Decoy Submissions**, not normal **Submissions**?"
> **Domain expert:** "Right. A **Decoy Submission** is a specialized kind of round artifact used only to disguise the real **Submission**."

## Flagged ambiguities

- "game" was used to mean both the overall product feature and a specific **Game Mode**. Use **Game Mode** for a selectable ruleset and **Session** for one live run.
- "judge" and "target player" are close but distinct. The **Judge** evaluates submissions; the **Target Player** is the person the prompt is about.
- "image game" could mean the currently implemented judge-based image mode or any future image-based mode. Use **Image Game** only for the current mode and **Caption Mode** for the proposed shared-image text mode.
- "poll", "vote", and "guess" describe different actions. Use **Consensus Vote** when choosing the best submission, and **Guess** only when identifying the real submission among decoys.
