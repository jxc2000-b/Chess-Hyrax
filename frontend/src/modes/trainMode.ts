// Train mode (scaffold — TBD).
//
// Shape mirrors puzzleMode: the hook owns all behavior/state, returns a
// declarative `view` for the shell plus the `onMoveSubmit` the shell wires to
// the board. Fill in the TODOs as the mode's rules are decided.

import { useCallback, useRef, useState } from "react";
import { parseUciSquares } from "../sessionHelpers";
import type { GameModeModule, ModeContext, ModeReturn } from "./types";

function useTrainMode(ctx: ModeContext): ModeReturn {
  // Guards async results against landing after navigation, same pattern as
  // puzzleMode: bump on submit/reset/navigate, compare before applying.
  const latestRequestRef = useRef(0);
  const [locked, setLocked] = useState(false);

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

      // TODO(train): judge the move and give feedback (markers, badges,
      // lock-on-fail via setLocked). `fenAfterMove` and `isStillRelevant()`
      // are ready to use.
      void fenAfterMove;
      void isStillRelevant;
    },
    [ctx.boardRef, ctx.currentPosition, ctx.getCurrentPositionId, locked],
  );

  const onReset = useCallback(() => {
    latestRequestRef.current += 1;
    setLocked(false);
    ctx.boardRef.current?.clearAnnotations();
    // TODO(train): re-arm the current exercise.
  }, [ctx.boardRef]);

  const onBeforeNavigate = useCallback(() => {
    latestRequestRef.current += 1;
    setLocked(false);
    ctx.boardRef.current?.clearAnnotations();
  }, [ctx.boardRef]);

  return {
    view: {
      showHeader: true,
      showSidebar: true,
      showNavigation: true,
      showEval: false,
      enableBadges: false,
      enableArrows: false,
      disableBoard: locked,
      promptText: "Train mode — coming soon.",
      onReset,
      onBeforeNavigate,
    },
    onMoveSubmit,
  };
}

export const trainMode: GameModeModule = {
  id: "train",
  label: "Train",
  useMode: useTrainMode,
};
