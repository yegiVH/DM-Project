import { assign, createActor, setup } from "xstate";
import type { Settings } from "speechstate";
import { speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY, NLU_KEY } from "./azure";
import type { DMContext, NLUObject, DMEvents } from "./types";


const inspector = createBrowserInspector();

/* ---------------- Azure settings ---------------- */
const azureCredentials = {
  endpoint: "https://swedencentral.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: KEY,
};

const azureLanguageCredentials = {
  endpoint: "https://lab-gusvahaye.cognitiveservices.azure.com/language/:analyze-conversations?api-version=2024-11-15-preview",
  key: NLU_KEY,
  deploymentName: "wordguess",
  projectName: "wordguess",
};

const settings: Settings = {
  azureLanguageCredentials,
  azureCredentials,
  azureRegion: "swedencentral",
  asrDefaultCompleteTimeout: 0,
  asrDefaultNoInputTimeout: 5000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-DavisNeural",
};

/* ---------------- Helper functions ---------------- */
function extractDifficulty(nlu: NLUObject | null): "easy" | "medium" | "hard" | null {
  if (!nlu) return null;
  for (const entity of nlu.entities) {
    if (entity.category === "difficulty") {
      const value = entity.text.trim().toLowerCase();
      if (value === "easy" || value === "medium" || value === "hard") {
        return value;
      }
    }
  }
  return null;
}

function getWord(nlu: NLUObject | null): string | null {
  if (nlu) {
    for (const entity of nlu.entities) {
      if (entity.category === "word_guess") {
        return entity.text;
      }
    }
  }
  return null;
}

const WORDS = {
  easy: [
    {
      word: "banana",
      clues: [
        "It is a fruit.",
        "It is yellow.",
        "Monkeys like it."
      ]
    },
    {
      word: "apple",
      clues: [
        "It grows on trees.",
        "It can be red or green.",
        "Doctors like it."
      ]
    }
  ],

  medium: [
    {
      word: "elephant",
      clues: [
        "It is an animal.",
        "It is very big.",
        "It has a trunk."
      ]
    },
    {
      word: "guitar",
      clues: [
        "It is a musical instrument.",
        "It has strings.",
        "It is used in many bands."
      ]
    }
  ],

  hard: [
    {
      word: "microscope",
      clues: [
        "It is a tool.",
        "It is used in science.",
        "It makes small things look bigger."
      ]
    },
    {
      word: "algorithm",
      clues: [
        "It is used in computer science.",
        "It is a set of steps.",
        "Programs follow it to solve problems."
      ]
    }
  ]
};

/* ---------------- Dialogue Manager ---------------- */
const dmMachine = setup({
  types: {
    context: {} as DMContext,
    events: {} as DMEvents,
  },

  actions: {
    // for speaking
    "spst.speak": ({ context }, params: { utterance: string }) => {
      context.spstRef.send({
        type: "SPEAK",
        value: { utterance: params.utterance },
      });

      const systemText = document.getElementById("system-text");
      if (systemText) {
        systemText.textContent = params.utterance;
      }
    },

    // for listening
    "spst.listen": ({ context }) => {
      context.spstRef.send({
        type: "LISTEN",
        value: { nlu: true }, /** Local activation of NLU */
      });
    },
  },
}).createMachine({
  // machine metadata
  id: "DM",
  initial: "Prepare",
  deferEvents: true,

  // memory of the dialogue context
  context: ({ spawn }) => ({
    spstRef: spawn(speechstate, { input: settings }),
    lastResult: null,
    interpretation: null,
    // game state
    difficulty: null,     // "easy" | "medium" | "hard"
    currentWord: null,    // e.g. "banana"
    clues: [],            //["It's a fruit", "It's yellow", ...]
    clueIndex: 0,         // which clue you're on
    roundsCompleted: 0,   // how many words solved
    maxRounds: 5,          // total rounds in the game
    guessedWord: null,
    score: 0,
    usedWords: [],
    maxScore: 5,
    minScore: -3,
  }),

  states: {

    /* -------- PREPARE -------- */
    Prepare: {
      entry: ({ context }) =>
        context.spstRef.send({ type: "PREPARE" }),
      on: { ASRTTS_READY: "WaitToStart" },
    },

    /* -------- START -------- */
    WaitToStart: {
      entry: [
        assign({
          difficulty: null,
          currentWord: null,
          clues: [],
          clueIndex: 0,
          roundsCompleted: 0,
          guessedWord: null,
          score: 0,
          usedWords: [],
        }),
        { type: "spst.speak", params: { utterance: "Click to start the game." } }
      ],
      on: {
        CLICK: "intro",
      },
    },


    /* -------- INTRO -------- */
    intro: {
      entry: {
        type: "spst.speak",
        params: {
          utterance: "Welcome to the Word Guessing Game!"
        }
      },
      on: { SPEAK_COMPLETE: "chooseDifficulty" }
    },


    /* -------- CHOOSE DIFFICULTY -------- */
    chooseDifficulty: {
      initial: "AskDifficulty",

      states: {
        AskDifficulty: {
          entry: {
            type: "spst.speak",
            params: {
              utterance: "Choose a difficulty: easy, medium, or hard."
            }
          },
          on: {
            SPEAK_COMPLETE: "ListenDifficulty"
          }
        },

        ListenDifficulty: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: assign(({ event }) => ({
                lastResult: event.value,
                interpretation: event.nluValue,
                difficulty: extractDifficulty(event.nluValue)
              }))
            },
            LISTEN_COMPLETE: [
              {
                target: "#DM.round",
                guard: ({ context }) => !!context.difficulty,
              },
              {
                target: "AskDifficulty"
              }
            ],
          },
        },
      }
    },


    /* -------- ROUND START -------- */
    round: {
      entry: assign(({ context }) => {

        const difficulty = context.difficulty as keyof typeof WORDS;

        const wordList = WORDS[difficulty]; // Retrieves the list of words associated with the chosen difficulty.

        const availableWords =
          wordList.filter(w => !context.usedWords?.includes(w.word));

        const pool = availableWords.length > 0 ? availableWords : wordList;

        const randomWord =
          pool[Math.floor(Math.random() * pool.length)];

        return {
          currentWord: randomWord.word,
          clues: randomWord.clues,
          clueIndex: 0,
          usedWords: [...(context.usedWords ?? []), randomWord.word]
        };
      }),

      always: "giveClue"
    },

    /* -------- GIVE CLUE -------- */
    giveClue: {
      entry: {
        type: "spst.speak",
        params: ({ context }) => ({
          utterance: `Clue ${(context.clueIndex ?? 0) + 1}: ${context.clues?.[context.clueIndex ?? 0]}. What is your guess?`
        })
      },
      on: {
        SPEAK_COMPLETE: "waitForGuess"
      }
    },


    /* -------- WAITE FOR GUESS -------- */
    waitForGuess: {
      entry: { type: "spst.listen" },
      on: {
        RECOGNISED: {
          actions: assign(({ event }) => ({
            interpretation: event.nluValue,
          }))
        },
        LISTEN_COMPLETE: [
          {
            guard: ({ context }) =>
              context.interpretation?.topIntent === "guess_word",
            actions: assign(({ context }) => ({
              guessedWord: getWord(context.interpretation)
            })),
            target: "checkGuess"
          },
          {
            guard: ({ context }) =>
              context.interpretation?.topIntent === "ask_hint",
            target: "hint"
          },
          {
            guard: ({ context }) =>
              context.interpretation?.topIntent === "give_up",
            target: "WaitToStart"
          },
          {
            guard: ({ context }) =>
              context.interpretation?.topIntent === "repeat_clue",
            target: "repeatClue"
          },
          {
            guard: ({ context }) =>
              context.interpretation?.topIntent === "skip_word",
            target: "skipWord"
          },
          {
            guard: ({ context }) =>
              context.interpretation?.topIntent === "help",
            target: "help"
          },
          {
            guard: ({ context }) =>
              context.interpretation?.topIntent === "play_again",
            target: "chooseDifficulty"
          },
          {
            target: "unknown"
          }
        ]
      }
    },

    /* -------- CHECKGUESS -------- */
    checkGuess: {
      always: [
        {
          guard: ({ context }) =>
            context.guessedWord?.toLowerCase() === context.currentWord?.toLowerCase(),
          target: "correct"
        },
        { target: "incorrect" }
      ]
    },


    /* -------- CORRECT -------- */
    correct: {
      entry: [
        assign({
          roundsCompleted: ({ context }) => (context.roundsCompleted ?? 0) + 1,
          score: ({ context }) => (context.score ?? 0) + (3 - (context.clueIndex ?? 0))
        }),
        {
          type: "spst.speak",
          params: ({ context }) => ({
            utterance: `Correct! The word was ${context.currentWord}. Your score is now ${context.score}`
          })
        }
      ],

      on: {
        SPEAK_COMPLETE: "checkAfterCorrect"
      }
    },

    /* -------- INCORRECT -------- */
    incorrect: {
      entry: [
        assign({
          score: ({ context }) => (context.score ?? 0) - 1
        }),
        {
          type: "spst.speak",
          params: ({ context }) => ({
            utterance: `That is not correct. Your score is now ${context.score}.`
          })
        }
      ],

      on: {
        SPEAK_COMPLETE: "checkAfterIncorrect"
      }
    },

    /* -------- CHECK AFTER CORRECT -------- */
    checkAfterCorrect: {
      always: [
        {
          guard: ({ context }) => (context.score ?? 0) <= (context.minScore ?? 0),
          target: "GameOver"
        },
        {
          guard: ({ context }) => (context.score ?? 0) >= (context.maxScore ?? 0),
          target: "Victory"
        },
        {
          guard: ({ context }) =>
            (context.roundsCompleted ?? 0) >= (context.maxRounds ?? 0),
          target: "Victory"
        },
        {
          target: "roundCount"
        }
      ]
    },

    /* -------- CHECK AFTER INCORRECT-------- */
    checkAfterIncorrect: {
      always: [
        {
          guard: ({ context }) => (context.score ?? 0) <= (context.minScore ?? 0),
          target: "GameOver"
        },
        {
          guard: ({ context }) =>
            (context.clueIndex ?? 0) < (context.clues?.length ?? 0) - 1,
          target: "moreGuess"
        },
        {
          guard: ({ context }) => (context.score ?? 0) >= (context.maxScore ?? 0),
          target: "Victory"
        },
        {
          target: "revealWord"
        }
      ]
    },

    /* --------  MOREGUESS -------- */
    moreGuess: {
      entry: {
        type: "spst.speak",
        params: {
          utterance: "You can guess again or ask for another hint."
        }
      },

      on: {
        SPEAK_COMPLETE: "waitForGuess"
      }
    },

    /* --------  REVEAL WORD -------- */
    revealWord: {
      entry: [
        assign({
          roundsCompleted: ({ context }) => (context.roundsCompleted ?? 0) + 1
        }),
        {
          type: "spst.speak",
          params: ({ context }) => ({
            utterance: `No more clues left. The correct word was ${context.currentWord}. Let's go to next round.`
          })
        }
      ],

      on: {
        SPEAK_COMPLETE: "roundCount"
      }
    },

    /* --------  ROUND COUNT -------- */
    roundCount: {
      entry: {
        type: "spst.speak",
        params: ({ context }) => ({
          utterance: `Round ${(context.roundsCompleted ?? 0) + 1}`
        })
      },
      on: {
        SPEAK_COMPLETE: "round"
      }
    },

    /* -------- HINT -------- */
    hint: {
      entry: assign(({ context }) => {
        const nextIndex = (context.clueIndex ?? 0) + 1;

        if (nextIndex >= (context.clues?.length ?? 0)) {
          return {};
        }

        return {
          clueIndex: nextIndex,
          score: (context.score ?? 0) - 0.5
        };
      }),

      always: [
        {
          guard: ({ context }) =>
            (context.clueIndex ?? 0) >= (context.clues?.length ?? 0) - 1,
          target: "noMoreClues"
        },
        {
          target: "giveClue"
        }
      ]
    },
    /* -------- REPEAT CLUE -------- */
    noMoreClues: {
      entry: {
        type: "spst.speak",
        params: {
          utterance: "You are out of clues. Try guessing the word."
        }
      },

      on: {
        SPEAK_COMPLETE: "waitForGuess"
      }
    },

    /* -------- REPEAT CLUE -------- */
    repeatClue: {
      entry: {
        type: "spst.speak",
        params: ({ context }) => ({
          utterance: `Clue ${(context.clueIndex ?? 0) + 1}: ${context.clues?.[context.clueIndex ?? 0]}`
        })
      },

      on: {
        SPEAK_COMPLETE: "waitForGuess"
      }
    },


    /* -------- SKIP WORD -------- */
    skipWord: {
      entry: [
        assign({
          roundsCompleted: ({ context }) => (context.roundsCompleted ?? 0) + 1
        }),
        {
          type: "spst.speak",
          params: ({ context }) => ({
            utterance: `Skipping this word. The answer was ${context.currentWord}`
          })
        }
      ],

      on: {
        SPEAK_COMPLETE: "checkAfterCorrect"
      }
    },

    /* -------- UNKNOWN -------- */
    unknown: {
      entry: {
        type: "spst.speak",
        params: {
          utterance: "Sorry, I didn't understand. You can guess the word, ask for a hint, or say skip."
        }
      },
      on: {
        SPEAK_COMPLETE: "waitForGuess"
      }
    },

    /* -------- HELP -------- */
    help: {
      entry: {
        type: "spst.speak",
        params: {
          utterance:
            "You can guess the word, say hint to get another clue, say repeat to hear the clue again, or say skip to move to the next word."
        }
      },
      on: {
        SPEAK_COMPLETE: "waitForGuess"
      }
    },


    /* -------- VICTORY -------- */
    Victory: {
      entry: {
        type: "spst.speak",
        params: ({ context }) => ({
          utterance: `Congratulations! You won the game with a score of ${context.score} points.`
        })
      },
      on: {
        SPEAK_COMPLETE: "WaitToStart"
      }
    },

    /* -------- GAME OVER -------- */
    GameOver: {
      entry: {
        type: "spst.speak",
        params: ({ context }) => ({
          utterance: `Game over. Your final score was ${context.score}. Better luck next time.`
        })
      },
      on: {
        SPEAK_COMPLETE: "WaitToStart"
      }
    },
  },
});

/* ---------------- Actor ---------------- */
const dmActor = createActor(dmMachine, {
  inspect: inspector.inspect,
}).start();

/* Global DM logging */
dmActor.subscribe((state) => {
  console.group("State update");
  console.log("State value:", state.value);
  console.log("State context:", state.context);
  console.groupEnd();
});

/* ---------------- Button ---------------- */
export function setupButton(element: HTMLButtonElement) {
  const systemText = document.getElementById("system-text")!;
  const listeningIndicator = document.getElementById("listening-indicator")!;

  /* Button click → send CLICK */
  element.addEventListener("click", () => {
    dmActor.send({ type: "CLICK" });
  });

  /* Update button label based on Speechstate meta */
  const unsubscribeDM = dmActor.subscribe((snapshot) => {
    const speechSnapshot = snapshot.context.spstRef?.getSnapshot();
    if (!speechSnapshot) return;

    const meta: { view?: string } =
      Object.values(speechSnapshot.getMeta())[0] || {};

    element.innerHTML = meta.view || "Start Game";
  });

  /* Subscribe to Speechstate for listening indicator */
  const speechActor = dmActor.getSnapshot().context.spstRef;
  if (speechActor) {
    speechActor.subscribe((speechSnapshot) => {
      const isListening =
        JSON.stringify(speechSnapshot.value).includes("Listening");

      // Update indicator
      listeningIndicator.classList.toggle("on", isListening);
      listeningIndicator.classList.toggle("off", !isListening);
      listeningIndicator.textContent = isListening
        ? "🎤 Listening..."
        : "🎤 Not listening";

      // Update button
      element.classList.toggle("on", isListening);
    });
  }
}
