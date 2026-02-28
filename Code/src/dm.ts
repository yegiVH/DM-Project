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
  endpoint: "https://lab-gusvahaye.cognitiveservices.azure.com/language/:analyze-conversations?api-version=2024-11-15-preview" /** your Azure CLU prediction URL */,
  key: NLU_KEY /** reference to your Azure CLU key */,
  deploymentName: "appointment" /** your Azure CLU deployment */,
  projectName: "appointment" /** your Azure CLU project name */,
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
      entry: assign({

      }),
      on: {
        CLICK: "A",
      },
    },

    /* -------- A -------- */
    A: {
      entry: {
        type: "spst.speak",
        params: { utterance: "Hi" }
      },
      on: { SPEAK_COMPLETE: "Done" }
    },

    /* -------- DONE -------- */
    Done: {
      entry: {
        type: "spst.speak",
        params: { utterance: "done" },
      },
      on: { CLICK: "WaitToStart" },
    },
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

/* ---------------- Button ---------------- */
export function setupButton(element: HTMLButtonElement) {
  element.addEventListener("click", () => {
    dmActor.send({ type: "CLICK" });
  });
  dmActor.subscribe((snapshot) => {
    const meta: { view?: string } = Object.values(
      snapshot.context.spstRef.getSnapshot().getMeta(),
    )[0] || {
      view: undefined,
    };
    element.innerHTML = `${meta.view}`;
  });
}
