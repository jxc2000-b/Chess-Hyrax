// Rush mode (scaffold — TBD).
//
// Shape mirrors puzzleMode: the hook owns all behavior/state, returns a
// declarative `view` for the shell plus the `onMoveSubmit` the shell wires to
// the board. Fill in the TODOs as the mode's rules are decided.

import { useCallback, useRef, useState } from "react";
import { parseUciSquares } from "../sessionHelpers";
import type { GameModeModule, ModeContext, ModeReturn } from "./types";

function useRushMode(ctx: ModeContext): ModeReturn {
  // Guards async results against landing after navigation, same pattern as
  // puzzleMode: bump on submit/reset/navigate, compare before applying.
  const latestRequestRef = useRef(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const totalPuzzles = ctx.sessionData?.trainingPositions?.length ?? 0;

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

      // TODO(rush): judge the move (engine? stored solution?), then paint
      // markers / advance / handle the clock. `fenAfterMove` and
      // `isStillRelevant()` are ready to use.
      void fenAfterMove;
      void isStillRelevant;
      void setScore;
      void setStreak;
    },
    [ctx.boardRef, ctx.currentPosition, ctx.getCurrentPositionId],
  );

  const onReset = useCallback(() => {
    latestRequestRef.current += 1;
    ctx.boardRef.current?.clearAnnotations();
    // TODO(rush): reset the run (clock, score, position index).
  }, [ctx.boardRef]);

  const onBeforeNavigate = useCallback(() => {
    latestRequestRef.current += 1;
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
      scoreHud: { score, streak, total: totalPuzzles },
      // TODO(rush): timer: { remainingMs, phase } once the clock exists.
      promptText: "Rush mode — coming soon.",
      onReset,
      onBeforeNavigate,
    },
    onMoveSubmit,
  };
}

export const rushMode: GameModeModule = {
  id: "rush",
  label: "Rush",
  useMode: useRushMode,
};
