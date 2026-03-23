import { assign, createActor, setup } from "xstate";
import type { Settings } from "speechstate";
import { speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY, NLU_KEY } from "./azure";
import type { DMContext, NLUObject, DMEvents } from "./types";
import WORDS from "./words";

const inspector = createBrowserInspector();

/* ---------------- Azure settings ---------------- */

// Azure TTS/ASR credentials — used to synthesise speech and recognise voice input
const azureCredentials = {
  endpoint: "https://swedencentral.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: KEY,
};

// Azure Language (NLU) credentials — used to understand what the player said (intents & entities)
const azureLanguageCredentials = {
  endpoint: "https://lab-gusvahaye.cognitiveservices.azure.com/language/:analyze-conversations?api-version=2024-11-15-preview",
  key: NLU_KEY,
  deploymentName: "wordguess",
  projectName: "wordguess",
};

// Combined settings passed to SpeechState
const settings: Settings = {
  azureLanguageCredentials,
  azureCredentials,
  azureRegion: "swedencentral",
  asrDefaultCompleteTimeout: 0,       
  asrDefaultNoInputTimeout: 15000,    // trigger ASR_NOINPUT after 15 seconds of silence
  locale: "en-US",
  ttsDefaultVoice: "en-US-DavisNeural",
};

/* ---------------- Text input parser ---------------- */
// Converts typed text into a game intent (used by the TEXT_INPUT fallback)
function parseTextCommand(text: string): string {
  const t = text.toLowerCase().trim();
  if (t === "hint")                              
    return "ask_hint";
  if (t === "skip")                              
    return "skip_word";
  if (t === "give up" || t === "giveup")         
    return "give_up";
  if (t === "help")                              
    return "help";
  if (t === "repeat")                            
    return "repeat_clue";
  return "guess_word";
}

/* ---------------- Helper functions ---------------- */

// Reads the "difficulty" entity from the NLU result and returns one of easy/medium/hard, or null
function extractDifficulty(nlu: NLUObject | null): "easy" | "medium" | "hard" | null {
  if (!nlu) return null;
  for (const entity of nlu.entities) {
    if (entity.category === "difficulty") {
      const value = entity.text.trim().toLowerCase();
      if (value === "easy" || value === "medium" || value === "hard") 
        return value;
    }
  }
  return null;
}

// Reads the "word_guess" entity from the NLU result and returns the guessed word, or null
function getWord(nlu: NLUObject | null): string | null {
  if (!nlu) return null;
  for (const entity of nlu.entities) {
    if (entity.category === "word_guess") 
      return entity.text.trim().toLowerCase();
  }
  return null;
}

/**
 Shorthand for states that only speak something then move on.
 Accepts a static string or a function of context for dynamic utterances.
 Generates: entry -> speak, on SPEAK_COMPLETE -> next state.
 */
function speak(
  utterance: string | ((ctx: DMContext) => string),
  next: string
) {
  return {
    entry: {
      type: "spst.speak" as const,
      params: typeof utterance === "string"
        ? { utterance }
        : ({ context }: { context: DMContext }) => ({ utterance: utterance(context) }),
    },
    on: { SPEAK_COMPLETE: next },
  };
}

/* ---------------- Response variety ---------------- */

const CORRECT_PHRASES = [
  "Yes! That's it",
  "Nailed it",
  "Spot on",
  "Brilliant",
  "Well done",
  "There it is",
];

const INCORRECT_PHRASES = [
  "Not quite! That costs you a point",
  "Nope, not that one! Minus a point",
  "Close, but no! That's a point gone",
  "Wrong guess — that'll cost you a point",
  "Not this time! Minus a point",
];

function pick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

/* ---------------- Dialogue Manager ---------------- */
const dmMachine = setup({
  types: {
    context: {} as DMContext,
    events: {} as DMEvents,
  },

  actions: {
    //sends a SPEAK command to SpeechState and also updates the on-screen text display
    "spst.speak": ({ context }, params: { utterance: string }) => {
      context.spstRef.send({ type: "SPEAK", value: { utterance: params.utterance } });
      const el = document.getElementById("system-text");
      if (el) el.textContent = params.utterance;
    },

    // Sends a LISTEN command to SpeechState with NLU enabled.
    // Skip if consecutiveFailures >= 3 — the text fallback is shown at that point,
    "spst.listen": ({ context }) => {
      if ((context.consecutiveFailures ?? 0) < 3) {
        context.spstRef.send({ type: "LISTEN", value: { nlu: true } });
      }
    },

    // Resets all game state to its initial values (used by WaitToStart and startNewGame)
    "resetGame": assign({
      difficulty: null,
      currentWord: null,
      clues: [],
      clueIndex: 0,
      roundsCompleted: 0,
      guessedWord: null,
      score: 0,
      usedWords: [],
      consecutiveFailures: 0,
    }),

    //Increments the rounds-completed counter by 1 (used by revealWord)
    "incrementRounds": assign({
      roundsCompleted: ({ context }) => (context.roundsCompleted ?? 0) + 1,
    }),

    //saves the NLU result from a RECOGNISED event into context (used by waitForGuess, listenPlayAgain)
    "storeNLU": assign(({ event }) => ({
      interpretation: (event as any).nluValue ?? null,
    })),
  },

  /* ---- Reusable guards ---- */
  guards: {
    // True when score drops to or below the minimum threshold -> triggers Game Over
    isGameOver: ({ context }) => (context.score ?? 0) <= (context.minScore ?? 0),

    // True when score reaches or exceeds the target -> triggers Victory
    isVictory: ({ context }) => (context.score ?? 0) >= (context.maxScore ?? 0),

    // True when all rounds have been completed
    isMaxRounds: ({ context }) => (context.roundsCompleted ?? 0) >= (context.maxRounds ?? 0),

    // True if there is at least one more unseen clue available in the current round
    hasMoreClues: ({ context }) => (context.clueIndex ?? 0) < (context.clues?.length ?? 0) - 1,

    // True when the player has requested hints past the last available clue
    cluesExhausted: ({ context }) => (context.clueIndex ?? 0) >= (context.clues?.length ?? 0),

    // True when the player's guessed word matches the current word (case-insensitive)
    correctGuess: ({ context }) =>
      context.guessedWord?.toLowerCase() === context.currentWord?.toLowerCase(),

    // True when a valid difficulty has been extracted from the NLU result
    hasDifficulty: ({ context }) => !!context.difficulty,

    // True when the NLU top intent matches the given intent string
    intentIs: ({ context }, { intent }: { intent: string }) =>
      context.interpretation?.topIntent === intent,
  },

}).createMachine({
  id: "DM",
  initial: "Prepare",

  //deferEvents: unhandled events are queued and replayed when a state that handles them is entered.
  deferEvents: true,

  // The game's memory 
  context: ({ spawn }) => ({
    spstRef: spawn(speechstate, { input: settings }), // the speech engine actor
    lastResult: null,       
    interpretation: null,   // NLU result (intents + entities) from the last RECOGNISED event
    difficulty: null,       // chosen difficulty: "easy" | "medium" | "hard"
    currentWord: null,      // the word the player is trying to guess this round
    clues: [],              // list of clue strings for the current word
    clueIndex: 0,           // index of the clue currently being shown (0 = first clue)
    roundsCompleted: 0,     // how many rounds have finished
    maxRounds: 5,           // total rounds per game
    guessedWord: null,      // the word extracted from the player's last guess
    score: 0,               // current score
    usedWords: [],          // words already used this game (prevents repeats)
    consecutiveFailures: 0, // counts consecutive ASR_NOINPUT events — shows text fallback at 3
    maxScore: 10,           // score needed to win
    minScore: -5,           // score floor — hitting this triggers Game Over
  }),

  states: {

    /* -------- PREPARE --------
       Initialises the SpeechState actor. Waits for ASRTTS_READY before proceeding. */
    Prepare: {
      entry: (
        { context }) => context.spstRef.send({ type: "PREPARE" }
        ),
      on: { ASRTTS_READY: "WaitToStart" },
    },

    /* -------- WAIT TO START --------
       Resets all game state and waits for the player to click the Start button. */
    WaitToStart: {
      entry: "resetGame",
      on: { CLICK: "intro" },
    },

    /* -------- START NEW GAME --------
       Resets state and goes straight to difficulty selection (skips the intro).
       Used when the player chooses to play again after Victory or Game Over. */
    startNewGame: {
      entry: "resetGame",
      always: "chooseDifficulty",
    },

    /* -------- INTRO --------
       Welcomes the player on first launch, then moves to difficulty selection. */
    intro: speak(
      "Hey, welcome to Mind Reader! I'll think of a word and drop some clues — your job is to guess it.", "chooseDifficulty"),

    /* -------- CHOOSE DIFFICULTY --------
       Nested states: ask -> listen -> confirm or retry. */
    chooseDifficulty: {
      initial: "AskDifficulty",
      states: {
        // Prompts the player to say a difficulty level
        AskDifficulty: speak("How hard do you want to play? Say easy, medium, or hard.", "ListenDifficulty"),

        // Listens for the player's choice and extracts the difficulty entity via NLU
        ListenDifficulty: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              // Store the raw result, NLU interpretation, and extracted difficulty in context
              actions: assign(({ event }) => ({
                lastResult: event.value,
                interpretation: event.nluValue,
                difficulty: extractDifficulty(event.nluValue),
              })),
            },
            ASR_NOINPUT: { actions: assign({ interpretation: null, difficulty: null }) },
            LISTEN_COMPLETE: [
              { guard: "hasDifficulty", target: "confirmDifficulty" },
              { target: "askDifficultyAgain" },
            ],
          },
        },

        // Confirms the chosen difficulty and explains the scoring rules
        confirmDifficulty: speak(
          ctx => `${ctx.difficulty === "hard" ? "Bold choice!" : "Nice!"} ${ctx.difficulty} it is. The sooner you guess, the more points you earn. Hints are free but shrink your potential reward. Wrong guesses lose you 1 point, and skipping costs 2. Let's go!`,
          "#DM.roundCount"
        ),

        // Reached when no difficulty was heard
        askDifficultyAgain: speak(
          "Sorry, I didn't catch that. Try saying easy, medium, or hard.",
          "ListenDifficulty"
        ),
      },
    },

    /* -------- ROUND START --------
       Picks a random word for the current difficulty,
       sets up clues, and immediately transitions to give the first clue. */
    round: {
      entry: assign(({ context }) => {
        const difficulty = context.difficulty as keyof typeof WORDS;
        const wordList = WORDS[difficulty];
        // Filter out words already used this game; fall back to full list if all exhausted
        const available = wordList.filter(w => !context.usedWords?.includes(w.word));
        const pool = available.length > 0 ? available : wordList;
        const randomWord = pool[Math.floor(Math.random() * pool.length)];

        return {
          currentWord : randomWord.word,
          clues : randomWord.clues,
          clueIndex : 0,
          usedWords: [...(context.usedWords ?? []), randomWord.word],
        };
      }),
      always: "giveClue",
    },

    /* -------- GIVE CLUE --------
       Speaks the current clue (indexed by clueIndex) and asks for a guess. */
    giveClue: speak(
      ctx => `Clue ${(ctx.clueIndex ?? 0) + 1}: ${ctx.clues?.[ctx.clueIndex ?? 0]} — what's your guess?`,
      "waitForGuess"
    ),

    /* -------- WAIT FOR GUESS -------- (THE CORE STATE)
       Listens for the player's response and routes
       to the appropriate state based on the NLU top intent. */
    waitForGuess: {
      entry: { type: "spst.listen" },
      on: {
        RECOGNISED: {
          actions: ["storeNLU", assign({ consecutiveFailures: 0 })],
        },

        ASR_NOINPUT: {
          actions: assign(({ context }) => ({
            interpretation: null,
            consecutiveFailures: (context.consecutiveFailures ?? 0) + 1,
          })),
        },

        LISTEN_COMPLETE: [
          {
            guard: { type: "intentIs", params: { intent: "guess_word" } },
            actions: assign(({ context }) => ({ guessedWord: getWord(context.interpretation)})),
            target: "checkGuess",
          },
          {
            guard: {type: "intentIs", params: {intent: "ask_hint"}}, 
            target: "hint"
          },
          {
            guard: {type: "intentIs", params: {intent: "give_up"}}, 
            target: "abandonRound" 
          },
          {
            guard: {type: "intentIs", params: {intent: "repeat_clue"}}, 
            target: "repeatClue"   
          },
          {
            guard: {type: "intentIs", params: {intent: "skip_word"}}, 
            target: "skipWord"     
          },
          {
            guard: {type: "intentIs", params: {intent: "help"}}, 
            target: "help"         
          },
          {
            guard: {type: "intentIs", params: {intent: "play_again"}}, 
            target: "abandonRound" 
          },
          {target: "unknown" }, //fallback: unrecognised intent
        ],

        // Text input fallback — shown after 3 consecutive ASR_NOINPUT events
        TEXT_INPUT: [
          {
            guard: ({ event }) => parseTextCommand(event.value) === "ask_hint",
            actions: assign({ consecutiveFailures: 0 }),
            target: "hint",
          },
          {
            guard: ({ event }) => parseTextCommand(event.value) === "skip_word",
            actions: assign({ consecutiveFailures: 0 }),
            target: "skipWord",
          },
          {
            guard: ({ event }) => parseTextCommand(event.value) === "give_up",
            actions: assign({ consecutiveFailures: 0 }),
            target: "abandonRound",
          },
          {
            guard: ({ event }) => parseTextCommand(event.value) === "help",
            actions: assign({ consecutiveFailures: 0 }),
            target: "help",
          },
          {
            guard: ({ event }) => parseTextCommand(event.value) === "repeat_clue",
            actions: assign({ consecutiveFailures: 0 }),
            target: "repeatClue",
          },
          {
            // Default: treat as a word guess
            actions: assign(({ event }) => ({
              guessedWord: event.value.toLowerCase().trim(),
              consecutiveFailures: 0,
            })),
            target: "checkGuess",
          },
        ],
      },
    },

    /* -------- CHECK GUESS --------
       Instant (eventless) routing — correct goes to celebration, wrong goes to penalty. */
    checkGuess: {
      always: [
        {guard: "correctGuess", target: "correct"},
        {target: "incorrect" },
      ],
    },

    /* -------- CORRECT --------
       Awards points (more points for guessing with fewer clues: 5 − clueIndex),
       increments rounds, announces the result, then checks win/continue conditions. */
    correct: {
      entry: [
        assign({
          roundsCompleted: ({ context }) => (context.roundsCompleted ?? 0) + 1,
          score: ({ context }) => (context.score ?? 0) + 5 - (context.clueIndex ?? 0),
        }),
        {
          type: "spst.speak",
          params: ({ context }) => ({
            utterance: `${pick(CORRECT_PHRASES)} — the word was ${context.currentWord}! Your score is now ${context.score}.`,
          }),
        },
      ],
      on: { SPEAK_COMPLETE: "checkAfterCorrect" },
    },

    /* -------- INCORRECT --------
       reduce 1 point, then auto-advances to the next clue (via checkAfterIncorrect -> hint)*/
    incorrect: {
      entry: [
        assign({ score: ({ context }) => (context.score ?? 0) - 1 }),
        {
          type: "spst.speak",
          params: ({ context }) => ({
            utterance: `${pick(INCORRECT_PHRASES)} — your score is now ${context.score}.`,
          }),
        },
      ],
      on: { SPEAK_COMPLETE: "checkAfterIncorrect" },
    },

    /* -------- CHECK AFTER CORRECT --------
       Priority order: game over -> victory -> max rounds -> continue. */
    checkAfterCorrect: {
      always: [
        {guard: "isGameOver", target: "GameOver"},
        {guard: "isVictory", target: "Victory"},
        {guard: "isMaxRounds", target: "Victory"},
        {target: "roundCount"},
      ],
    },

    /* -------- CHECK AFTER INCORRECT --------
       After a wrong guess: check game over, then check if there are clues left.
       If more clues exist, auto-advance via hint (updates clueIndex and progress dots).
       If no clues remain, reveal the word. */
    checkAfterIncorrect: {
      always: [
        {guard: "isGameOver", target: "GameOver"},
        {guard: "isVictory", target: "Victory"}, 
        {guard: "hasMoreClues", target: "hint"}, 
        {target: "revealWord"},
      ],
    },

    /* -------- CHECK AFTER SKIP --------
       Same as after correct but hitting max rounds ends in Game Over rather than Victory
       (since the player chose not to guess). */
    checkAfterSkip: {
      always: [
        {guard: "isGameOver", target: "GameOver"},
        {guard: "isVictory", target: "Victory"},
        { guard: "isMaxRounds", target: "GameOver"},
        {target: "roundCount"},
      ],
    },

    /* -------- REVEAL WORD --------
       this happens when clues were shown but the player still couldn't guess.
       Reveals the answer, increments rounds, then routes through checkAfterSkip
       so max-rounds and game-over conditions are still checked. */
    revealWord: {
      entry: [
        "incrementRounds",
        {
          type: "spst.speak",
          params: ({ context }) => ({
            utterance: `Out of clues! The word was ${context.currentWord}. Better luck next time — moving on.`,
          }),
        },
      ],
      on: { SPEAK_COMPLETE: "checkAfterSkip" },
    },

    /* -------- ROUND COUNT --------
       Announces the upcoming round number, then starts the round.*/
    roundCount: speak(
      ctx => `Round ${(ctx.roundsCompleted ?? 0) + 1} — I've got a new word. Let's see if you can get it!`,
      "round"
    ),

    /* -------- HINT --------
       Advances clueIndex by 1. Used both when the player explicitly asks for a hint
       and automatically after a wrong guess (via checkAfterIncorrect).
       If all clues are now exhausted, goes to noMoreClues; otherwise shows the next clue. */
    hint: {
      entry: assign(({ context }) => ({
        clueIndex: (context.clueIndex ?? 0) + 1,
      })),
      always: [
        {guard: "cluesExhausted", target: "noMoreClues"},
        {target: "giveClue"},
      ],
    },

    /* -------- NO MORE CLUES --------
       All clues have been shown; player must now guess without further help. */
    noMoreClues: speak("That's all the clues I've got! Give it your best guess.", "waitForGuess"),

    /* -------- REPEAT CLUE --------
       Re-reads the current clue without advancing clueIndex.*/
    repeatClue: speak(
      ctx => `Sure! Clue ${(ctx.clueIndex ?? 0) + 1} again: ${ctx.clues?.[ctx.clueIndex ?? 0]}`,
      "waitForGuess"
    ),

    /* -------- SKIP WORD --------
       Player chooses to skip the current word. Costs 2 points (more than a wrong guess)
       and increments rounds. Routes through checkAfterSkip for end-game checks. */
    skipWord: {
      entry: [
        assign({
          roundsCompleted: ({ context }) => (context.roundsCompleted ?? 0) + 1,
          score: ({ context }) => (context.score ?? 0) - 2,
        }),
        {
          type: "spst.speak",
          params: ({ context }) => ({
            utterance: `No problem! The word was ${context.currentWord}. Skipping costs 2 points, so your score is now ${context.score}. On to the next one!`,
          }),
        },
      ],
      on: { SPEAK_COMPLETE: "checkAfterSkip" },
    },

    /* -------- ABANDON ROUND --------
       Player gave up or asked to play again mid-round.
       Reveals the word and asks if they want to play again.*/
    abandonRound: speak(
      ctx => `Fair enough! The word was ${ctx.currentWord}. Want to play again?`,
      "listenPlayAgain"
    ),

    /* -------- HELP --------
       says the available voice commands, then returns to listening. */
    help: speak(
      "Here's what you can do: guess the word, say hint for another clue, say repeat to hear the clue again, say skip to move on to a new word, or say give up to abandon the round.",
      "waitForGuess"
    ),

    /* -------- VICTORY --------
       Player reached maxScore or completed all rounds with a positive result.
       Saves the best score to localStorage, announces the win, then listens for play-again. */
    Victory: {
      entry: [
        ({ context }) => {
          const prev = parseInt(localStorage.getItem("mindreader_best") ?? "0");
          if ((context.score ?? 0) > prev) {
            localStorage.setItem("mindreader_best", String(context.score));
          }
        },
        {
          type: "spst.speak",
          params: ({ context }) => ({
            utterance: `Amazing, you did it! You finished with ${context.score} points. That's a win! Want to play again?`,
          }),
        },
      ],
      on: { SPEAK_COMPLETE: "listenPlayAgain" },
    },

    /* -------- GAME OVER --------
       Score fell to minScore, or all rounds ended without enough points.
       Announces game over, then listens for play-again response. */
    GameOver: speak(
      ctx => `Oh no, game over! You ended with ${ctx.score} points. Want to give it another shot?`,
      "listenPlayAgain"
    ),

    /* -------- LISTEN PLAY AGAIN --------
       Listens for "yes" (play_again) or "no" (give_up) after Victory or Game Over. */
    listenPlayAgain: {
      entry: { type: "spst.listen" },
      on: {
        RECOGNISED:  {actions: "storeNLU"},
        ASR_NOINPUT: { actions: assign({ interpretation: null }) },
        LISTEN_COMPLETE: [
          {
            guard: {type: "intentIs", params: {intent: "play_again"}}, 
            target: "startNewGame"
          },
          {
            guard: {type: "intentIs", params: {intent: "give_up"}}, 
            target: "WaitToStart"
          },
          {target: "askPlayAgain"},
        ],
      },
    },

    /* -------- ASK PLAY AGAIN -------- */
    askPlayAgain: speak(
      "Sorry, I didn't catch that. Say yes to play again, or no to quit.",
      "listenPlayAgain"
    ),

    /* -------- UNKNOWN --------*/
    unknown: speak(
      "Hmm, I didn't catch that. Try guessing the word, or say hint, repeat, or skip.",
      "waitForGuess"
    ),
  },
});


/* ---------------- Actor ---------------- */

const dmActor = createActor(dmMachine, {
  inspect: inspector.inspect,
}).start();

dmActor.subscribe((state) => {
  console.group("State update");
  console.log("State value:", state.value);
  console.log("State context:", state.context);
  console.groupEnd();
});


/* ---------------- Button + UI updates ---------------- */
export function setupButton(element: HTMLButtonElement) {
  // Grabbing all UI elements that need to be updated as the game progresses
  const listeningIndicator = document.getElementById("listening-indicator")!;
  const roundDisplay = document.getElementById("round-display")!;
  const scoreDisplay = document.getElementById("score-display")!;
  const difficultyDisplay = document.getElementById("difficulty-display")!;
  const bestScoreDisplay = document.getElementById("best-score-display")!;
  const clueDisplayEl = document.getElementById("clue-display")!;
  const clueDotsEl = document.getElementById("clue-dots")!;
  const gameStats = document.getElementById("game-stats")!;
  const textFallbackEl = document.getElementById("text-fallback")!;
  const fallbackInput = document.getElementById("fallback-input") as HTMLInputElement;
  const fallbackBtn = document.getElementById("fallback-btn") as HTMLButtonElement;

  //forward button clicks to the dialogue machine as a CLICK event
  element.addEventListener("click", () => dmActor.send({ type: "CLICK" }));

  // Text fallback submit — sends the typed text as a TEXT_INPUT event
  function submitFallbackText() {
    const text = fallbackInput.value.trim();
    if (!text) return;
    dmActor.send({type: "TEXT_INPUT", value: text});
    fallbackInput.value = "";
  }

  fallbackBtn.addEventListener("click", submitFallbackText);
  fallbackInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitFallbackText();
  });

  //flag to ensure we only subscribe to the SpeechState actor once
  let subscribedSpeech = false;

  // Re-run every time the DM transitions to a new state
  dmActor.subscribe((snapshot) => {
    const speechActor = snapshot.context.spstRef;
    if (!speechActor) return;

    // Read the speech actor's current state metadata to update the button label
    const speechSnapshot = speechActor.getSnapshot();
    const meta: {view?: string} = Object.values(speechSnapshot.getMeta())[0] || {};
    element.innerHTML = meta.view || "Start Game";

    /* --- Update game stats bar --- */
    const ctx = snapshot.context;
    const inGame = ctx.difficulty != null; // stats are only meaningful once difficulty is chosen

    // Fade the stats bar when no game is active
    gameStats.style.opacity = inGame ? "1" : "0.3";

    // Show text fallback after 3 consecutive ASR_NOINPUT events in waitForGuess
    const showFallback = snapshot.matches("waitForGuess") && (ctx.consecutiveFailures ?? 0) >= 3;
    textFallbackEl.classList.toggle("hidden", !showFallback);

    // Round display — cap at maxRounds so it never shows 
    const maxR = ctx.maxRounds ?? 5;
    roundDisplay.textContent = inGame
      ? `${Math.min((ctx.roundsCompleted ?? 0) + 1, maxR)} / ${maxR}`
      : "—";

    // Score display — colour: green if positive, red if negative, white if zero
    const score = ctx.score ?? 0;
    scoreDisplay.textContent = inGame ? String(score) : "—";
    scoreDisplay.className = "stat-value " + (
      !inGame ? "neutral" : score > 0 ? "positive" : score < 0 ? "negative" : "neutral"
    );

    // Best score 
    const best = localStorage.getItem("mindreader_best");
    bestScoreDisplay.textContent = best ?? "—";
    bestScoreDisplay.className = "stat-value " + (best ? "positive" : "neutral");

    // Difficulty level
    const diff = ctx.difficulty ?? null;
    difficultyDisplay.textContent = diff
      ? diff.charAt(0).toUpperCase() + diff.slice(1)
      : "—";
    difficultyDisplay.className = "stat-value " + (diff ? `difficulty-${diff}` : "");

    // Clue display 
    const clues = ctx.clues ?? [];
    const clueIdx = Math.min(ctx.clueIndex ?? 0, clues.length - 1);
    if (inGame && clues.length > 0) {
      clueDisplayEl.innerHTML = clues
        .slice(0, clueIdx + 1)
        .map((clue, i) =>
          i < clueIdx
            ? `<p class="clue-item clue-previous"><span class="clue-number">Clue ${i + 1}:</span> ${clue}</p>`
            : `<p class="clue-item clue-current"><span class="clue-number">Clue ${i + 1}:</span> ${clue}</p>`
        )
        .join("");
    } else {
      clueDisplayEl.innerHTML = "";
    }

    // Round-progress dots — one dot per round, filled as rounds are completed
    const maxRounds  = ctx.maxRounds ?? 5;
    const roundsDone = ctx.roundsCompleted ?? 0;
    clueDotsEl.innerHTML = Array.from({ length: maxRounds }, (_, i) =>
      `<span class="clue-dot ${i < roundsDone ? "revealed" : ""}"></span>`
    ).join("");

    /* --- Subscribe to SpeechState once to track microphone status --- */
    if (!subscribedSpeech) {
      subscribedSpeech = true;
      speechActor.subscribe((speechSnapshot) => {
        console.log("Speech state:", speechSnapshot.value);

        // Detect whether the ASR is actively recognising speech
        const isListening =
          speechSnapshot.matches("Active.AsrTtsManager.Ready.Recognising") ||
          speechSnapshot.matches("Active.AsrTtsManager.Ready.Recognising.Proceed");

        // Toggle the listening indicator and button colour/animation
        listeningIndicator.classList.toggle("on", isListening);
        listeningIndicator.classList.toggle("off", !isListening);
        listeningIndicator.textContent = isListening ? "🎤 Listening..." : "🎤 Not listening";
        element.classList.toggle("on", isListening);
      });
    }
  });
}
