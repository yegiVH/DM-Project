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
  key: NLU_KEY ,
  deploymentName: "wrodguess",
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
function extractDifficulty(nlu?: NLUObject | null): "easy" | "medium" | "hard" | null {
  if (!nlu) return null;

  const ent = nlu.entities.find(e => e.category === "difficulty");
  if (!ent) return null;

  const value = ent.text.trim().toLowerCase();

  if (value === "easy" || value === "medium" || value === "hard") {
    return value;
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
    maxRounds: 3          // total rounds in the game
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
          roundsCompleted: 0
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
              guard: ({ event }) =>
                event.type === "RECOGNISED" &&
                event.nluValue?.topIntent === "choose_difficulty",

              actions: assign(({ event }) => ({
                difficulty: extractDifficulty(event.nluValue)
              })),

              target: "#DM.round"
            },

            LISTEN_COMPLETE: [
              {
                guard: ({ context }) => context.difficulty !== null,
                target: "#DM.round"
              },
              {
                target: "AskDifficulty"
              }
            ]
          }
        }
      }
    },

    /* -------- ROUND START -------- */
    round: {

    },


    /* -------- GIVE CLUE -------- */
    giveClue: {

    },


    /* -------- WAITE FOR GUESS -------- */
    waitForGuess: {

    },


    /* -------- CHECKGUESS -------- */
    checkGuess: {

    },


    /* -------- CORRECT -------- */
    correct: {

    },


    /* -------- INCORRECT -------- */
    incorrect: {

    },


    /* -------- HINT -------- */
    hint: {

    },


    /* -------- REPEAT CLUE -------- */
    repeatClue: {

    },


    /* -------- SKIP WORD -------- */
    skipWord: {

    },


    /* -------- HELP -------- */
    help: {

    },

    /* -------- VICTORY -------- */
    Victory: {
      entry: {
        type: "spst.speak",
        params: { utterance: "Victory" },
      },
      on: { CLICK: "WaitToStart" },
    },

    /* -------- GAME OVER -------- */
    GameOver: {
      entry: {
        type: "spst.speak",
        params: { utterance: "Game Over" },
      },
      on: { CLICK: "WaitToStart" },
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
