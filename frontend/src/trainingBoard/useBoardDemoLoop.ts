// Plays a hardcoded demo game on the board (via the imperative ref) to keep the
// user occupied while the puzzle miner searches for the first position. Pure
// visual filler: no user input, no engine, no session-state writes.
//
// When `active` flips false — i.e. the first real puzzle position has arrived —
// the loop stops and intentionally does NOT touch the board. The shell's normal
// position effect (and the board remount on orientation change) own the reset,
// so there is a single writer and no clobbering race between the demo and the
// real puzzle.

import { useEffect, type RefObject } from "react";
import { Chess } from "chess.js";
import type { TrainingBoardHandle } from "../types";

// A calm Italian-game opening (no castling/promotion, so the simple
// setPosition animation stays visually clean) replayed on a loop.
const DEMO_SAN_MOVES = [
  "e4", "e5", "Nf3", "d6", "d4", "Bg4", "dxe5", "Bxf3", "Qxf3", "dxe5", "Bc4",
   "Nf6", "Qb3", "Qe7", "Nc3", "c6", "Bg5", "b5", "Nxb5", "cxb5", "Bxb5+", 
   "Nbd7", "O-O-O", "Rd8","Rxd7", "Rxd7", "Rd1", "Qe6", "Bxd7+", "Nxd7", 
   "Qb8+", "Nxb8" , "Rd8#"
];

const DEMO_STEP_MS = 200;

function buildDemoFens(): string[] {
  const chess = new Chess();
  const fens = [chess.fen()];
  for (const san of DEMO_SAN_MOVES) {
    try {
      chess.move(san);
    } catch {
      break;
    }
    fens.push(chess.fen());
  }
  return fens;
}

const DEMO_FENS = buildDemoFens();

export function useBoardDemoLoop(
  boardRef: RefObject<TrainingBoardHandle | null>,
  active: boolean,
): void {
  useEffect(() => {
    if (!active || DEMO_FENS.length === 0) {
      return;
    }

    let cancelled = false;
    let timer: number | undefined;
    let step = 0;

    // Snap to the opening position (no animation) to begin the loop.
    boardRef.current?.setBoardPosition(DEMO_FENS[0], false);

    const tick = () => {
      // Bail if torn down between scheduling and firing, or the board remounted
      // away (ref nulled) — never write to a stale/absent board.
      if (cancelled || !boardRef.current) {
        return;
      }
      step = (step + 1) % DEMO_FENS.length;
      // Animate ordinary moves; snap the wrap back to the start (a large
      // multi-piece jump reads better as an instant reset than a slide).
      boardRef.current.setBoardPosition(DEMO_FENS[step], step !== 0);
      timer = window.setTimeout(tick, DEMO_STEP_MS);
    };

    timer = window.setTimeout(tick, DEMO_STEP_MS);

    return () => {
      cancelled = true;
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    };
  }, [active, boardRef]);
}
