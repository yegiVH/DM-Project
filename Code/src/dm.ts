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
    maxRounds: 3,          // total rounds in the game
    guessedWord: null,
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
        let word = "banana";
        let clues: string[] = [];

        // if user chooses easy
        if (context.difficulty === "easy") {
          word = "banana";
          clues = [
            "It is a fruit.",
            "It is yellow.",
            "Monkeys like it."
          ];
        }

        // if user chooses medium
        if (context.difficulty === "medium") {
          word = "elephant";
          clues = [
            "It is an animal.",
            "It is very big.",
            "It has a trunk."
          ];
        }

        // if user chooses hard
        if (context.difficulty === "hard") {
          word = "microscope";
          clues = [
            "It is a tool.",
            "It is used in science.",
            "It makes small things look bigger."
          ];
        }

        return {
          currentWord: word,
          clues,
          clueIndex: 0
        };
      }),
      always: "giveClue"
    },

    /* -------- GIVE CLUE -------- */
    giveClue: {
      entry: {
        type: "spst.speak",
        params: ({ context }) => ({
          utterance: context.clues[context.clueIndex]
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
            guessedWord: getWord(event.nluValue)
          }))
        },
        LISTEN_COMPLETE: [
          {
            guard: ({ context }) =>
              context.interpretation?.topIntent === "guess_word",
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
            target: "GameOver"
          },
          {
            target: "giveClue"
          }
        ]
      }
    },

    /* -------- CHECKGUESS -------- */
    checkGuess: {
      always: [
        {
          guard: ({ context }) =>
            context.guessedWord === context.currentWord,
          target: "correct"
        },
        { target: "incorrect" }
      ]
    },


    /* -------- CORRECT -------- */
    correct: {
      entry: [
        {
          type: "spst.speak",
          params: ({ context }) => ({
            utterance: `Correct! The word was ${context.currentWord}`
          })
        },

        assign({
          roundsCompleted: ({ context }) => context.roundsCompleted + 1
        })
      ],

      on: {
        SPEAK_COMPLETE: "checkVictory"
      }
    },


    /* -------- CHECK VICTORY -------- */
    checkVictory: {
      always: [
        {
          guard: ({ context }) =>
            context.roundsCompleted >= context.maxRounds,
          target: "Victory"
        },
        { target: "round" }
      ]
    },

    /* -------- INCORRECT -------- */
    incorrect: {
      entry: {
        type: "spst.speak",
        params: {
          utterance: "That is not correct. Try again or ask for a hint."
        }
      },

      on: {
        SPEAK_COMPLETE: "waitForGuess"
      }
    },


    /* -------- HINT -------- */
    hint: {
      entry: assign(({ context }) => {
        const nextIndex = context.clueIndex + 1;

        if (nextIndex >= context.clues.length) {
          return {};
        }

        return { clueIndex: nextIndex };
      }),

      always: [
        {
          guard: ({ context }) => context.clueIndex >= context.clues.length - 1,
          target: "repeatClue"
        },
        {
          target: "giveClue"
        }
      ]
    },


    /* -------- REPEAT CLUE -------- */
    repeatClue: {
      entry: {
        type: "spst.speak",
        params: ({ context }) => ({
          utterance: context.clues[context.clueIndex]
        })
      },

      on: {
        SPEAK_COMPLETE: "waitForGuess"
      }
    },


    /* -------- SKIP WORD -------- */
    skipWord: {
      entry: {
        type: "spst.speak",
        params: ({ context }) => ({
          utterance: `Skipping this word. The answer was ${context.currentWord}`
        })
      },

      on: {
        SPEAK_COMPLETE: "round"
      }
    },


    /* -------- HELP -------- */
    help: {
      entry: {
        type: "spst.speak",
        params: {
          utterance:
            "You can guess the word, ask for a hint, repeat the clue, or skip the word."
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
        params: {
          utterance: "Congratulations! You won the game."
        }
      },
      on: {
        SPEAK_COMPLETE: "WaitToStart"
      }
    },

    /* -------- GAME OVER -------- */
    GameOver: {
      entry: {
        type: "spst.speak",
        params: {
          utterance: "Game over. Better luck next time."
        }
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
