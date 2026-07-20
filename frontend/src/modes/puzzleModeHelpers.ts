// Pure helpers + constants for puzzle-style training (train mode today, rush
// mode as it lands): move-grading, SAN→square resolution, hint-module
// selection, and the timing values for the prior-move replay and hint reveal.
// Kept out of the hooks so the mode files stay focused on state/effects.

import { type EngineAnalysis, type ShrunkTrainingPosition } from "../types";
import { Chess } from "chess.js";
import { importantPieceHint } from "./hints/importantPieceHint";
import { squareControlHint } from "./hints/squareControlHint";
import { weakPieceHint } from "./hints/weakPieceHint";
import type { HintContext, HintModule } from "./hints/types";

// Tighter bar than the multi-tier analysis grading: anything that loses more
// than this in pawns counts as a wrong answer. Tune later if puzzles feel
// too strict or too lenient.
const PUZZLE_CORRECT_THRESHOLD_PAWNS = 0.5;

// How long to dwell on the pre-move FEN before animating the prior move
// forward. cm-chessboard needs a tick to flush setPosition, and the human
// eye needs longer than that to register the rewound state — so the wait
// is intentionally generous, not just a timing safety margin.
export const PREVIOUS_MOVE_ANIMATION_DELAY_MS = 550;

// How long after a position loads before hints reveal, and how often the
// countdown bar ticks while waiting.
export const PUZZLE_HINT_REVEAL_DELAY_MS = 5000;
export const HINT_PROGRESS_INTERVAL_MS = 100;

export function isMoveCorrect(pre: EngineAnalysis, post: EngineAnalysis, playedMoveUci: string): boolean {
  const bestEvalPawns = pre.evaluationCp / 100;
  const userEvalPawns = -post.evaluationCp / 100;
  const evalLossPawns = Math.max(0, bestEvalPawns - userEvalPawns);

  if (pre.bestMove && playedMoveUci === pre.bestMove) {
    return true;
  }
  return evalLossPawns < PUZZLE_CORRECT_THRESHOLD_PAWNS;
}

// Resolve from/to squares for a SAN move at a given pre-move FEN. chess.js
// returns the full move record on a successful play, including the
// canonical from/to in absolute board coordinates.
export function sanToSquares(fen: string, san: string): { from: string; to: string } | null {
  try {
    const chess = new Chess(fen);
    const move = chess.move(san);
    return move ? { from: move.from, to: move.to } : null;
  } catch {
    return null;
  }
}

// Every puzzle hint module — used to defensively clear any active hint visuals
// regardless of which subset is currently showing.
const ALL_PUZZLE_HINTS: HintModule[] = [importantPieceHint, squareControlHint, weakPieceHint];

// Positional puzzles get the weak-piece + square-control pair; everything else
// (including "not-labeled") gets the important-piece hint.
export function getPuzzleHintModules(position: ShrunkTrainingPosition): HintModule[] {
  return position.puzzleTag?.includes("positional")
    ? [weakPieceHint, squareControlHint]
    : [importantPieceHint];
}

export function clearAllPuzzleHints(hintCtx: HintContext): void {
  for (const module of ALL_PUZZLE_HINTS) {
    module.clear(hintCtx);
  }
}
