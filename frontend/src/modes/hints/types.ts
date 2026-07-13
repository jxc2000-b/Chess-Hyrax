import type { RefObject } from "react";
import type { TrainingBoardHandle, ShrunkTrainingPosition } from "../../types";

export type HintContext = {
  fen: string;
  position: ShrunkTrainingPosition | null;
  boardRef: RefObject<TrainingBoardHandle | null>;
};

export type HintModule = {
  id: string;
  label: string;
  canRun: (ctx: HintContext) => boolean;
  prepare: (ctx: HintContext) => unknown | Promise<unknown>;
  apply: (ctx: HintContext, prepared: unknown) => void;
  clear: (ctx: HintContext) => void;
};
