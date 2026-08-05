// Per-mode contract. Modes own behavior; the shell owns the widget kit.
// Each mode exports a useMode hook + a GameModeModule registry entry.
//
// The mode hook reads ctx (refs + current position + sessionData callbacks),
// runs its own state/effects (timer, engine, history logging, etc.), and
// returns:
//   - `view`: declarative widget visibility / config the shell renders.
//   - `onMoveSubmit`: the callback the shell wires to the board.
// Modes never render JSX; the shell never imports engine code.

import type { RefObject } from "react";
import type { TrainingBoardHandle, GameMode, SessionData, ShrunkTrainingPosition, UciMove } from "../types";

export type ModeContext = {
  boardRef: RefObject<TrainingBoardHandle | null>;
  currentPosition: ShrunkTrainingPosition | null;
  boardFen: string;
  getCurrentPositionId: () => string | undefined;
  appendTrainingPosition: (position: ShrunkTrainingPosition) => void;
  updateSessionData: (patch: Partial<SessionData>) => void;
  sessionData: SessionData | null;
  onSessionDataChange: (sessionData: SessionData | null) => void;
};

export type ModeViewState = {
  // Header + chrome
  showHeader?: boolean;
  showSidebar?: boolean;
  showNavigation?: boolean;
  showEval?: boolean;
  // Board annotations the mode plans to drive imperatively
  enableBadges?: boolean;
  enableArrows?: boolean;
  // Optional slots
  promptText?: string;
  timer?: { remainingMs: number; phase: "think" | "blitz" | "idle" };
  evalGuess?: { onSubmit: (centipawns: number) => void };
  multiChoice?: { options: UciMove[]; onPick: (uci: UciMove) => void };
  scoreHud?: { score: number; streak: number; total: number; isAnimating?: boolean };
  hintHud?: { progress: number };
  controlFlash?: { reset?: boolean; next?: boolean };
  // If provided, the shell's reset button calls this instead of its default
  // "jump to first position" behavior.
  onReset?: () => void;
  onBeforeNavigate?: () => void;
  // When true, the shell disables the board so the user can't submit more
  // moves on the current position (e.g. puzzle mode after a wrong answer).
  disableBoard?: boolean;
  // If set, the shell renders the board with this FEN instead of the current
  // displayPosition's FEN. Puzzle mode uses it to show the pre-move position
  // before animating the prior move forward — eliminates the puzzle-FEN
  // flicker that happens when the shell briefly paints the post-move state.
  initialBoardFen?: string;
};

export type ModeBoardSubmit = (uci: UciMove, fenAfterMove: string) => void | Promise<void>;

export type ModeReturn = {
  view: ModeViewState;
  onMoveSubmit: ModeBoardSubmit;
};

export type GameModeModule = {
  id: GameMode;
  label: string;
  useMode: (ctx: ModeContext) => ModeReturn;
};
