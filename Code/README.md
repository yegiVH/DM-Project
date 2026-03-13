# Mind Reader

A voice-driven word-guessing game built with TypeScript, XState, and Azure Cognitive Services. The system thinks of a secret word and drops clues one at a time — you speak your guess out loud.

## How It Works

Each game consists of **5 rounds**. At the start of each round the system picks a secret word (matched to your chosen difficulty) and reads the first clue aloud. You can then:

| What you say | What happens |
|---|---|
| Your guess | Checked immediately — correct earns points, wrong costs 1 point and advances to the next clue |
| *"hint"* | Reveals the next clue (no point penalty) |
| *"repeat"* | Re-reads the current clue |
| *"skip"* | Skips the word, costs 2 points |
| *"give up"* | Ends the current game and returns to the start screen |
| *"help"* | Lists available commands |

### Scoring

- **Correct guess**: `5 − clueIndex` points (guess on the first clue → 5 pts, second clue → 4 pts, etc.)
- **Wrong guess**: −1 point; the game automatically advances to the next clue
- **Skip**: −2 points
- **Victory** when score reaches **10**
- **Game Over** when score drops to **−5**

### Difficulty

| Level | Words |
|---|---|
| Easy | Everyday objects and nature (banana, kite, mirror…) |
| Medium | Places, events, and concepts (lighthouse, marathon, submarine…) |
| Hard | Abstract or technical terms (paradox, fermentation, archipelago…) |

Each difficulty has 10 words; already-used words are skipped so you never see the same word twice in a game.

## Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript (ES2022, strict) |
| Bundler | Vite |
| State machine | XState v5 |
| Speech I/O | [SpeechState](https://github.com/GusGul/speechstate) |
| ASR / TTS | Azure Cognitive Services (Sweden Central) |
| NLU | Azure Language — Conversational Language Understanding |
| Inspector | @statelyai/inspect (browser) |

## Project Structure

```
src/
  dm.ts        # Dialogue manager — XState machine, UI updates, button wiring
  words.ts     # Word bank (easy / medium / hard, 10 words each with 5 clues)
  types.ts     # TypeScript interfaces (DMContext, DMEvents, NLUObject, …)
  main.ts      # HTML scaffold and entry point
  style.css    # Game UI styles
  azure.ts     # API keys (not committed)
```

## Dialogue State Machine

The XState machine drives the entire game flow:

```
Prepare → WaitToStart → intro → chooseDifficulty → roundCount → round
  → giveClue → waitForGuess → checkGuess → correct / incorrect
                                         → hint / repeatClue / skipWord
                                         → abandonRound / help / unknown
→ Victory / GameOver → listenPlayAgain → startNewGame / WaitToStart
```

Key design decisions:
- **`deferEvents: true`** — unhandled events are queued and replayed when a matching state is reached, preventing race conditions between ASR and state transitions.
- **`ASR_NOINPUT` + `LISTEN_COMPLETE` pattern** — silence clears interpretation immediately but routing only happens on `LISTEN_COMPLETE` (after the ASR session fully closes), so the machine never tries to speak while ASR is still active.
- **`speak()` helper** — generates a standard entry-speak / `SPEAK_COMPLETE`→next pattern to eliminate boilerplate across simple states.

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Add Azure credentials**

   Create `src/azure.ts` (not committed):

   ```ts
   export const KEY = "your-azure-speech-key";
   export const NLU_KEY = "your-azure-language-key";
   ```

3. **Run the dev server**

   ```bash
   npm run dev
   ```

4. **Open in browser**, click **Start Game**, and say your difficulty level (`easy`, `medium`, or `hard`).

## NLU Intents

The Azure CLU project (`wordguess`) must recognise the following intents:

| Intent | Example utterances |
|---|---|
| `guess_word` | "I think it's banana", "my answer is clock" |
| `ask_hint` | "hint please", "give me a clue" |
| `repeat_clue` | "say that again", "repeat" |
| `skip_word` | "skip", "next word" |
| `give_up` | "I give up", "stop" |
| `play_again` | "yes", "play again" |
| `help` | "help", "what can I say" |

The entity `word_guess` (category) must extract the guessed word from `guess_word` utterances, and `difficulty` must extract `easy` / `medium` / `hard` from difficulty-selection utterances.
