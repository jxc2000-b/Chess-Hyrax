// Puzzle mode. bryan
//
// When a new puzzle position loads the mode rewinds the board to the FEN
// *before* the opponent's last move and then animates that move forward, so
// the user sees the move that landed them here before they're allowed to
// respond.
//
// On submit:
//   - Pre/post engine analyses run at high priority (same shape as analysis
//     mode), then `isMoveCorrect` decides pass/fail.
//   - Correct → paint green markers on the from/to squares.
//   - Wrong   → paint red markers on the from/to squares and lock the board
//     via view.disableBoard until the user hits reset.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { engineService } from "../Stockfish/engineService";
import { minePuzzlePositions } from "../analysis/puzzleMiner";
import { ENGINE_LOADING_BADGE_DELAY_MS, parseUciSquares } from "../sessionHelpers";
import { DEFAULT_POSITION_FILTERS, type SessionData, type Severity } from "../types";
import type { HintContext } from "./hints/types";
import {
  HINT_PROGRESS_INTERVAL_MS,
  PREVIOUS_MOVE_ANIMATION_DELAY_MS,
  PUZZLE_HINT_REVEAL_DELAY_MS,
  clearAllPuzzleHints,
  getPuzzleHintModules,
  isMoveCorrect,
  sanToSquares,
} from "./puzzleModeHelpers";
import type { GameModeModule, ModeContext, ModeReturn } from "./types";

function usePuzzleMode(ctx: ModeContext): ModeReturn {
  const latestRequestRef = useRef(0);
  const latestMiningRunRef = useRef(0);
  const minedGamesRef = useRef<{ games: SessionData["games"]; filterKey: string } | null>(null);
  const hintRunRef = useRef(0);
  const hintTimeoutRef = useRef<number | null>(null);
  const hintProgressIntervalRef = useRef<number | null>(null);
  const solvedPositionIdsRef = useRef<Set<string>>(new Set());
  const getCurrentPositionIdRef = useRef(ctx.getCurrentPositionId);
  const [locked, setLocked] = useState(false);
  const [replayCount, setReplayCount] = useState(0);
  const [hintProgress, setHintProgress] = useState(0);
  const [flashTarget, setFlashTarget] = useState<"reset" | "next" | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [hintSuppressedPositionId, setHintSuppressedPositionId] = useState<string | null>(null);
  const hintsEnabled = ctx.sessionData?.hintsEnabled ?? true;
  const positionFilters = ctx.sessionData?.positionFilters ?? DEFAULT_POSITION_FILTERS;
  const positionFilterKey = positionFilters.join("|");
  const totalPuzzles = ctx.sessionData?.trainingPositions?.length ?? 0;
  getCurrentPositionIdRef.current = ctx.getCurrentPositionId;

  const clearHintTimers = useCallback(() => {
    hintRunRef.current += 1;

    if (hintTimeoutRef.current !== null) {
      window.clearTimeout(hintTimeoutRef.current);
      hintTimeoutRef.current = null;
    }
    if (hintProgressIntervalRef.current !== null) {
      window.clearInterval(hintProgressIntervalRef.current);
      hintProgressIntervalRef.current = null;
    }

    setHintProgress(0);
  }, []);

  const clearHintVisuals = useCallback(() => {
    const hintCtx: HintContext = {
      fen: ctx.currentPosition?.fen || ctx.boardFen,
      position: ctx.currentPosition,
      boardRef: ctx.boardRef,
    };

    clearAllPuzzleHints(hintCtx);
  }, [ctx.boardFen, ctx.boardRef, ctx.currentPosition]);

  const clearPuzzleVisualState = useCallback(() => {
    clearHintTimers();
    setFlashTarget(null);
    ctx.boardRef.current?.clearAnnotations();
  }, [clearHintTimers, ctx.boardRef]);

  const minePuzzles = useCallback(
    async (runId: number) => {
      const games = ctx.sessionData?.games;
      if (!games || games.length === 0) {
        return;
      }

      ctx.updateSessionData({ puzzleMiningCompleted: false, gamesAnalyzed: 0, gamesTotal: games.length });

      try {
        await minePuzzlePositions(
          games,
          (position) => {
            if (runId === latestMiningRunRef.current) {
              ctx.appendTrainingPosition(position);
            }
          },
          {
            filters: [...positionFilters],
            onProgress: (analyzedGames, totalGames) => {
              if (runId === latestMiningRunRef.current) {
                ctx.updateSessionData({ gamesAnalyzed: analyzedGames, gamesTotal: totalGames });
              }
            },
          },
        );
      } finally {
        if (runId === latestMiningRunRef.current) {
          ctx.updateSessionData({ puzzleMiningCompleted: true });
        }
      }
    },
    [ctx.appendTrainingPosition, ctx.sessionData?.games, ctx.updateSessionData, positionFilterKey],
  );

  useEffect(() => {
    const games = ctx.sessionData?.games;
    const minedGames = minedGamesRef.current;
    if (
      !games ||
      games.length === 0 ||
      (minedGames?.games === games && minedGames.filterKey === positionFilterKey)
    ) {
      return;
    }

    minedGamesRef.current = { games, filterKey: positionFilterKey };
    const runId = ++latestMiningRunRef.current;
    solvedPositionIdsRef.current.clear();
    setScore(0);
    setStreak(0);

    void minePuzzles(runId).catch((error) => {
      console.error("Puzzle mining failed:", error);
    });

    return () => {
      if (runId === latestMiningRunRef.current) {
        latestMiningRunRef.current += 1;
        minedGamesRef.current = null;
      }
    };
  }, [ctx.sessionData?.games, minePuzzles, positionFilterKey]);

  // Reset the lock whenever the active position changes — moving forward to
  // the next puzzle should never inherit a previous fail-state.
  useEffect(() => {
    setLocked(false);
    setFlashTarget(null);
    setHintSuppressedPositionId(null);
  }, [ctx.currentPosition?.id]);

  useEffect(() => {
    const position = ctx.currentPosition;
    clearPuzzleVisualState();

    if (!position || !hintsEnabled || position.id === hintSuppressedPositionId) {
      return;
    }

    const hintCtx: HintContext = {
      fen: position.fen,
      position,
      boardRef: ctx.boardRef,
    };
    const modules = getPuzzleHintModules(position).filter((module) => module.canRun(hintCtx));

    if (modules.length === 0) {
      return;
    }

    const runId = ++hintRunRef.current;
    const startedAt = window.performance.now();

    setHintProgress(1);
    hintProgressIntervalRef.current = window.setInterval(() => {
      if (runId !== hintRunRef.current) {
        return;
      }
      const elapsed = window.performance.now() - startedAt;
      setHintProgress(Math.max(0, 1 - elapsed / PUZZLE_HINT_REVEAL_DELAY_MS));
    }, HINT_PROGRESS_INTERVAL_MS);

    const delayPromise = new Promise<void>((resolve) => {
      hintTimeoutRef.current = window.setTimeout(resolve, PUZZLE_HINT_REVEAL_DELAY_MS);
    });
    const preparedHintsPromise = Promise.all(
      modules.map(async (module) => {
        try {
          return {
            module,
            prepared: await module.prepare(hintCtx),
          };
        } catch (error) {
          console.error(`Puzzle hint "${module.id}" failed:`, error);
          return null;
        }
      }),
    );

    void Promise.all([preparedHintsPromise, delayPromise]).then(([preparedHints]) => {
      if (
        runId !== hintRunRef.current ||
        position.id !== getCurrentPositionIdRef.current() ||
        !ctx.boardRef.current
      ) {
        return;
      }

      if (hintProgressIntervalRef.current !== null) {
        window.clearInterval(hintProgressIntervalRef.current);
        hintProgressIntervalRef.current = null;
      }
      hintTimeoutRef.current = null;
      setHintProgress(0);

      for (const preparedHint of preparedHints) {
        preparedHint?.module.apply(hintCtx, preparedHint.prepared);
      }
    });

    return () => {
      if (runId === hintRunRef.current) {
        clearHintTimers();
      }
      for (const module of modules) {
        module.clear(hintCtx);
      }
    };
  }, [clearHintTimers, clearPuzzleVisualState, ctx.boardRef, ctx.currentPosition, hintSuppressedPositionId, hintsEnabled]);

  // Replay the prior move with animation. The shell now renders the board
  // with previousMoveFen directly (via view.initialBoardFen), so the rewind
  // is already on screen by the time this effect fires — no need to call
  // setBoardPosition ourselves. We just schedule the animated move forward.
  useLayoutEffect(() => {
    const position = ctx.currentPosition;
    if (!position || !position.previousMove || !position.previousMoveFen) {
      return;
    }
    const squares = sanToSquares(position.previousMoveFen, position.previousMove);
    if (!squares) {
      return;
    }
    const board = ctx.boardRef.current;
    if (!board) {
      return;
    }

    const animationTimer = window.setTimeout(() => {
      ctx.boardRef.current?.movePieceAnimated(squares.from, squares.to);
    }, PREVIOUS_MOVE_ANIMATION_DELAY_MS);

    return () => {
      window.clearTimeout(animationTimer);
    };
  }, [ctx.currentPosition?.id, ctx.boardRef, replayCount]);

  const onMoveSubmit = useCallback(
    async (uci: string, fenAfterMove: string) => {
      const position = ctx.currentPosition;
      if (!position || locked) {
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

      // Wipe any prior square markers from a previous attempt or carry-over.
      clearHintTimers();
      clearHintVisuals();
      ctx.boardRef.current?.clearSquareMarkers();
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

        const correct = isMoveCorrect(pre, post, uci);
        const kind = correct ? "correct" : "wrong";
        const severity: Severity = correct ? "correct" : "incorrect";
        ctx.boardRef.current?.showAccuracyBadge(playedSquares.to, severity);
        ctx.boardRef.current?.addSquareMarker(playedSquares.from, kind);
        ctx.boardRef.current?.addSquareMarker(playedSquares.to, kind);

        if (!correct) {
          const bestSquares = parseUciSquares(pre.bestMove);
          if (bestSquares) {
            ctx.boardRef.current?.drawBestMoveArrow(bestSquares.from, bestSquares.to);
          }
          setLocked(true);
          setFlashTarget("reset");
          setStreak(0);
        } else {
          if (!solvedPositionIdsRef.current.has(positionId)) {
            solvedPositionIdsRef.current.add(positionId);
            setScore((previous) => previous + 1);
            setStreak((previous) => previous + 1);
          }
          setFlashTarget("next");
        }
      } catch (error) {
        window.clearTimeout(spinnerTimer);
        console.error("Puzzle mode engine call failed:", error);
        if (isStillRelevant()) {
          ctx.boardRef.current?.clearLoadingBadge();
        }
      }
    },
    [clearHintTimers, clearHintVisuals, ctx.boardRef, ctx.currentPosition, ctx.getCurrentPositionId, locked],
  );

  const onReset = useCallback(() => {
    latestRequestRef.current += 1;
    setHintSuppressedPositionId(ctx.currentPosition?.id ?? null);
    setLocked(false);
    setReplayCount((previous) => previous + 1);
    clearHintVisuals();
    clearPuzzleVisualState();
  }, [clearHintVisuals, clearPuzzleVisualState, ctx.currentPosition?.id]);

  const onBeforeNavigate = useCallback(() => {
    latestRequestRef.current += 1;
    setHintSuppressedPositionId(null);
    setLocked(false);
    clearPuzzleVisualState();
  }, [clearPuzzleVisualState]);

  // Tell the shell to render the board with the pre-move FEN on initial
  // commit. Falls back to undefined for position 0 (no prior move), letting
  // the shell use the normal displayPosition.fen path.
  const initialBoardFen = ctx.currentPosition?.previousMoveFen;

  return {
    view: {
      showHeader: true,
      showSidebar: true,
      showNavigation: true,
      showEval: false,
      enableBadges: false,
      enableArrows: false,
      disableBoard: locked,
      scoreHud: { score, streak, total: totalPuzzles },
      hintHud: { progress: hintProgress },
      controlFlash: {
        reset: flashTarget === "reset",
        next: flashTarget === "next",
      },
      promptText: locked
        ? "Wrong move - reset to try again."
        : "Find the best move.",
      onReset,
      onBeforeNavigate,
      initialBoardFen,
    },
    onMoveSubmit,
  };
}

export const puzzleMode: GameModeModule = {
  id: "puzzle",
  label: "Puzzle",
  useMode: usePuzzleMode,
};
