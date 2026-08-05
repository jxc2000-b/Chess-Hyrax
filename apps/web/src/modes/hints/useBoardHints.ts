import { useCallback, useEffect, useRef } from "react";
import { pickCoachHint } from "./registry";
import type { HintContext, HintModule } from "./types";

const BOARD_HINT_REVEAL_DELAY_MS = 2500;

type ClearOptions = {
  invalidatePendingWork?: boolean;
};

export type BoardHintsController = {
  showBoardHints: (hintCtx: HintContext) => void;
  clearBoardHints: (hintCtx?: HintContext) => void;
  cancelBoardHints: () => void;
};

export function useBoardHints(): BoardHintsController {
  const requestIdRef = useRef(0);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeHintRef = useRef<HintModule | null>(null);
  const activeHintContextRef = useRef<HintContext | null>(null);

  const clearRevealTimer = useCallback(() => {
    if (revealTimerRef.current !== null) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
  }, []);

  const clearActiveHint = useCallback(
    (hintCtx?: HintContext, options: ClearOptions = {}) => {
      if (options.invalidatePendingWork !== false) {
        requestIdRef.current += 1;
      }

      const contextToClear = hintCtx ?? activeHintContextRef.current;
      clearRevealTimer();

      if (contextToClear) {
        activeHintRef.current?.clear(contextToClear);
        contextToClear.boardRef.current?.clearCoachSquareMarkers();
        contextToClear.boardRef.current?.clearDimPieces();
      }

      activeHintRef.current = null;
      activeHintContextRef.current = null;
    },
    [clearRevealTimer],
  );

  const showBoardHints = useCallback(
    (hintCtx: HintContext) => {
      const requestId = ++requestIdRef.current;
      const hint = pickCoachHint(hintCtx);

      clearActiveHint(hintCtx, { invalidatePendingWork: false });
      if (!hint) {
        return;
      }

      const selectedHint = hint;
      activeHintRef.current = selectedHint;
      activeHintContextRef.current = hintCtx;

      let revealElapsed = false;
      let prepared = false;
      let preparedHint: unknown = null;

      function isCurrentHint(): boolean {
        return requestId === requestIdRef.current && activeHintRef.current === selectedHint;
      }

      function applyPreparedHint() {
        if (!isCurrentHint() || !prepared) {
          return;
        }
        selectedHint.clear(hintCtx);
        selectedHint.apply(hintCtx, preparedHint);
      }

      void Promise.resolve(selectedHint.prepare(hintCtx))
        .then((result) => {
          if (!isCurrentHint()) {
            return;
          }
          preparedHint = result;
          prepared = true;
          if (revealElapsed) {
            applyPreparedHint();
          }
        })
        .catch((error) => {
          if (isCurrentHint()) {
            console.error(`Board hint "${selectedHint.id}" failed:`, error);
          }
        });

      revealTimerRef.current = setTimeout(() => {
        revealTimerRef.current = null;
        if (!isCurrentHint()) {
          return;
        }
        revealElapsed = true;
        applyPreparedHint();
      }, BOARD_HINT_REVEAL_DELAY_MS);
    },
    [clearActiveHint],
  );

  const clearBoardHints = useCallback(
    (hintCtx?: HintContext) => {
      clearActiveHint(hintCtx);
    },
    [clearActiveHint],
  );

  const cancelBoardHints = useCallback(() => {
    clearActiveHint();
  }, [clearActiveHint]);

  useEffect(() => {
    return () => {
      clearActiveHint();
    };
  }, [clearActiveHint]);

  return {
    showBoardHints,
    clearBoardHints,
    cancelBoardHints,
  };
}
