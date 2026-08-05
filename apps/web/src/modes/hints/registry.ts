import { importantPieceHint } from "./importantPieceHint";
import { squareControlHint } from "./squareControlHint";
import type { HintContext, HintModule } from "./types";
import { weakPieceHint } from "./weakPieceHint";

export const COACH_HINTS: HintModule[] = [
  importantPieceHint,
  weakPieceHint,
  squareControlHint,
  
];

export function pickCoachHint(ctx: HintContext): HintModule | null {
  const runnableHints = COACH_HINTS.filter((hint) => hint.canRun(ctx));
  if (runnableHints.length === 0) {
    return null;
  }
  return runnableHints[Math.floor(Math.random() * runnableHints.length)];
}
