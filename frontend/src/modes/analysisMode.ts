// Analysis mode. On every user move:
//   1. Kick off pre- and post-move engine analyses in parallel (high pri).
//   2. While they're pending, debounce a loading badge on the played square.
//   3. When both return, paint a severity badge on the played square and an
//      arrow for the engine's best move when the player's move wasn't strong.
//   4. Stale-result guard: discard paints if the user has navigated away.
//
// Severity is graded by how the user's move compares to the engine's best
// move at the same pre-position, not by absolute eval. In decisively-decided
// positions (already +3 or -3) the grading is lenient — best-equivalent
// moves that don't flip the outcome won't get a mistake/blunder badge.

import { useCallback, useRef } from "react";
import { engineService } from "../Stockfish/engineService";
import type { EngineAnalysis, Severity } from "../types";
import type { GameModeModule, ModeContext, ModeReturn } from "./types";

const DECISIVE_EVAL_PAWNS = 3.0;
const BEST_MOVE_TOLERANCE_PAWNS = 0.1;
const ENGINE_LOADING_BADGE_DELAY_MS = 120
const EVAL_LOSS_THRESHOLDS_PAWNS = {
  ok: 0.3,
  inaccuracy: 0.8,
  mistake: 1.5,
  blunder: 3.0,
} as const;

function downgradeOne(severity: Severity): Severity {
  switch (severity) {
    case "blunder":
      return "mistake";
    case "mistake":
      return "inaccuracy";
    case "inaccuracy":
      return "good";
    default:
      return severity;
  }
}

function classifyEvalLossPawns(evalLossPawns: number | null): Severity {
  if (typeof evalLossPawns !== "number" || !Number.isFinite(evalLossPawns)) {
    return "unscored";
  }
  if (evalLossPawns >= EVAL_LOSS_THRESHOLDS_PAWNS.blunder) return "blunder";
  if (evalLossPawns >= EVAL_LOSS_THRESHOLDS_PAWNS.mistake) return "mistake";
  if (evalLossPawns >= EVAL_LOSS_THRESHOLDS_PAWNS.inaccuracy) return "inaccuracy";
  if (evalLossPawns >= EVAL_LOSS_THRESHOLDS_PAWNS.ok) return "good";
  return "ok";
}



function parseUciSquares(
  uci: string,
): { from: string; to: string; promotion: string | null } | null {
  const match = String(uci || "").match(/^([a-h][1-8])([a-h][1-8])([nbrq])?$/);
  if (!match) {
    return null;
  }
  return {
    from: match[1],
    to: match[2],
    promotion: match[3] ?? null,
  };
}
// Severity classification: compare the engine's best-move evaluation (at the
// pre-position) to the eval after the user's actual move, both in the user's
// perspective. Equal = best. Otherwise the gap drives the tier — with a
// leniency cap in already-decided positions.
function classifyUserMove(pre: EngineAnalysis, post: EngineAnalysis, playedMoveUci: string): Severity {
  // Stockfish reports eval from the side-to-move's perspective. At `pre`,
  // side to move == user. At `post`, side to move == opponent. So user's
  // best-move-eval == pre.evaluationCp, user's actual-move-eval == -post.evaluationCp.
  const bestEvalPawns = pre.evaluationCp / 100;
  const userEvalPawns = -post.evaluationCp / 100;
  const evalLossPawns = Math.max(0, bestEvalPawns - userEvalPawns);

  // Treat exact UCI match OR near-zero gap as best. The fallback catches
  // ties when several moves share the engine's top eval and the user picked
  // a different but equally-good one.
  if ((pre.bestMove && playedMoveUci === pre.bestMove) || evalLossPawns < BEST_MOVE_TOLERANCE_PAWNS) {
    return "best";
  }

  const baseSeverity = classifyEvalLossPawns(evalLossPawns);

  // Decisive-position leniency. If the side-to-move was already decisively
  // winning or losing AND the user's move keeps the same direction, downgrade
  // the severity. Practical impact of small drifts is low when the result is
  // effectively settled — most importantly, a "best" move that the engine
  // re-evaluates 0.5 pawns differently between depths shouldn't surface as
  // mistake/blunder.
  const positionDecided = Math.abs(bestEvalPawns) >= DECISIVE_EVAL_PAWNS;
  const sameDirection = Math.sign(bestEvalPawns) === Math.sign(userEvalPawns);
  if (positionDecided && sameDirection) {
    return downgradeOne(baseSeverity);
  }

  return baseSeverity;
}

function paintAnalysisResult(
  boardRef: ModeContext["boardRef"],
  pre: EngineAnalysis,
  post: EngineAnalysis,
  playedMoveUci: string,
  playedToSquare: string,
) {
  // Always wipe any prior best-move arrow before re-painting — otherwise a
  // strong follow-up move (which doesn't draw a new arrow) leaves the old
  // arrow stuck on the board.
  boardRef.current?.clearBestMoveArrow();

  const severity = classifyUserMove(pre, post, playedMoveUci);
  boardRef.current?.showAccuracyBadge(playedToSquare, severity);

  // Only surface the engine's best-move arrow when the user's move clears
  // the "good" bar — otherwise the badge alone communicates accuracy.
  if (severity !== "best" && severity !== "good" && severity !== "ok") {
    const bestSquares = parseUciSquares(pre.bestMove);
    if (bestSquares) {
      boardRef.current?.drawBestMoveArrow(bestSquares.from, bestSquares.to);
    }
  }
}

function useAnalysisMode(ctx: ModeContext): ModeReturn {
  // Per-submission counter — lets us discard stale paints if the user has
  // navigated to another position before the engine returned.
  const latestRequestRef = useRef(0);

  const onMoveSubmit = useCallback(
    async (uci: string, fenAfterMove: string) => {
      const position = ctx.currentPosition;
      if (!position) {
        return;
      }

      const playedSquares = parseUciSquares(uci);
      if (!playedSquares) {
        return;
      }

      const requestId = ++latestRequestRef.current;
      const positionId = position.id;
      const isStillRelevant = (): boolean =>
        requestId === latestRequestRef.current &&
        ctx.boardRef.current !== null &&
        positionId === ctx.getCurrentPositionId();

      // Wipe any stale arrow from the previous move right away — visually
      // signals "new move in progress" while the engine grinds.
      ctx.boardRef.current?.clearBestMoveArrow();

      const spinnerTimer = window.setTimeout(() => {
        if (isStillRelevant()) {
          ctx.boardRef.current?.showLoadingBadge(playedSquares.to);
        }
      }, ENGINE_LOADING_BADGE_DELAY_MS);

      try {
        const [pre, post] = await Promise.all([
          engineService.analyze(position.fen, { priority: "high" }),
          engineService.analyze(fenAfterMove, { priority: "high" }),
        ]);
        window.clearTimeout(spinnerTimer);

        if (!isStillRelevant()) {
          return;
        }

        ctx.boardRef.current?.clearLoadingBadge();
        paintAnalysisResult(ctx.boardRef, pre, post, uci, playedSquares.to);
      } catch (error) {
        window.clearTimeout(spinnerTimer);
        console.error("Analysis mode engine call failed:", error);
        if (isStillRelevant()) {
          ctx.boardRef.current?.clearLoadingBadge();
        }
      }
    },
    [ctx.boardRef, ctx.currentPosition, ctx.getCurrentPositionId],
  );

  return {
    view: {
      showHeader: true,
      showSidebar: true,
      showNavigation: true,
      enableBadges: true,
      enableArrows: true,
    },
    onMoveSubmit,
  };
}

export const analysisMode: GameModeModule = {
  id: "analysis",
  label: "Analysis",
  useMode: useAnalysisMode,
};
