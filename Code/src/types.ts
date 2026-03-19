import type { Hypothesis, SpeechStateExternalEvent } from "speechstate";
import type { ActorRef } from "xstate";

export interface DMContext {
  spstRef: ActorRef<any, any>;
  lastResult: Hypothesis[] | null;

  interpretation: NLUObject | null;

  // game-specific context
  difficulty?: "easy" | "medium" | "hard" | null;
  currentWord?: string | null;
  clues?: string[];
  clueIndex?: number;
  roundsCompleted?: number;
  maxRounds?: number;
  score?: number;
  guessedWord?: string | null;
  usedWords?: string[];
  maxScore?: number;
  minScore?: number;
  consecutiveFailures?: number;
}

export type DMEvents =
  | SpeechStateExternalEvent
  | { type: "CLICK" }
  | { type: "DONE" }
  | { type: "ASRTTS_READY" }
  | { type: "RECOGNISED"; value: any; nluValue?: NLUObject }
  | { type: "LISTEN_COMPLETE" }
  | { type: "SPEAK_COMPLETE" }
  | { type: "ASR_NOINPUT" }
  | { type: "TEXT_INPUT"; value: string };


export interface Entity {
  category: string;
  text: string;
  confidenceScore: number;
  offset: number;
  length: number;
}

export interface Intent {
  category: string;
  confidenceScore: number;
}

export interface NLUObject {
  entities: Entity[];
  intents: Intent[];
  projectKind: string;
  topIntent: string;
}


