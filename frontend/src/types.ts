/* --------------------------------------------------------------------------
 * Shared Chess Primitives
 * -------------------------------------------------------------------------- */

import { IncomingHttpStatusHeader } from "http2";

export type UciMove = string;
export type SanMove = string;
export type IsoDateString = string;
export type ChessSide = 'white' | 'black';

/* --------------------------------------------------------------------------
 * Session Data and Training Positions
 * -------------------------------------------------------------------------- */

export type PuzzleTags =
  | "endgame"
  | "queen-endgame"
  | "rook-endgame"
  | "bishop-endgame"
  | "knight-endgame"
  | "ruleofsquare"
  | "opening"
  | "middlegame"
  | "positional"
  | "non-positional"
  | "easy"
  | "medium"
  | "hard"
  | "user-mistake"
  | "user-opponent-mistake"
  | "not-labeled";

// The user-facing choice at import time. Maps 1:1 onto the train/rush game
// modes — each mode owns its own (app-set) mining tuning; the user no longer
// picks position filters directly.
export type TrainingRunType = "train" | "rush";

export const DEFAULT_TRAINING_RUN_TYPE: TrainingRunType = "train";

export type Inferences = {
  [key: string]: string
}

// Persisted inference: a yes/no question the miner asked about a position and
// the boolean answer. Stored as a JSONB array on training_positions.inferences.
export type Inference = {
  question: string;
  answer: boolean;
};


export type ShrunkTrainingPosition = {
  id: string;
  sourceGame: string;
  date: string;
  fen: string;
  userElo?: number;
  opening?: string;
  previousMove?: string;
  previousMoveFen?: string;
  playedMove?: string;
  playedMoveUci?: string;
  pieceMoved?: string;
  fromSquare?: string;
  toSquare?: string;
  isCapture?: boolean;
  isCheck?: boolean;
  moveNumber?: number;
  pieceCount?: number;
  userResult?: "win" | "loss" | "draw";
  timeControl?: string;
  lockBoardAfter?: number;
  pv?: string[];
  bestMoveAtIntermediateAnalysis?: string;
  bestMove?: string; //new 
  puzzleTag?: PuzzleTags[];
  inferences?: Inferences[];
  userColorForGame?: ChessSide | null;
  color: string;
};

//move types; easy = moves not missed by the user
// medium = moves missed by the user
// hard = moves missed by stockfish depth 10

export type GameMode = "analysis" | "rush" | "train";

export const DEFAULT_GAMEMODE: GameMode = "train";

export type SessionData = {
  isResumeFetch?: boolean;
  gamemode?: GameMode;
  trainingRunType?: TrainingRunType;
  hintsEnabled?: boolean;
  trainingPositions?: ShrunkTrainingPosition[];
  puzzleMiningCompleted?: boolean;
  // Mining progress: how many games the puzzle miner has analyzed so far, out
  // of the total handed to it this run. Drives the Mine progress bar in the
  // analysis window. Reset at the start of every mining run.
  gamesAnalyzed?: number;
  gamesTotal?: number;
  pgnStream?: string[];
  username?: string;
  games?: Array<{ sourceGame: string; date: string; moves: ShrunkTrainingPosition[] }>;
};

export type miningProgress = {
  completed: number;
  total: number;
  phase: "queued" | "analyzing" | "filtering" | "done";
  isHardMode: boolean;
}

/* --------------------------------------------------------------------------
 * Engine Service (frontend WASM Stockfish queue + cache)
 * -------------------------------------------------------------------------- */

export type EnginePriority = 'high' | 'low';

export type Severity =
  | 'best'
  | 'good'
  | 'ok'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'
  | 'unscored'
  | 'correct'
  | 'incorrect';

export type EngineAnalysis = {
  fen: string;
  bestMove: UciMove;
  evaluationCp: number;
  principalVariation: UciMove[];
  pvAtIntermediateDepth: UciMove[];
  depth: number;
  completedAt: number;
};

export type EngineAnalyzeOptions = {
  intermediateDepth?: number,
  priority?: EnginePriority;
  depth?: number;
};

export type EngineSubscriptionListener = (analysis: EngineAnalysis) => void;

/* --------------------------------------------------------------------------
 * Training board imperative handle
 * -------------------------------------------------------------------------- */

export type SquareMarkerKind =
  | "important"
  | "control-white-1"
  | "control-white-2"
  | "control-white-3"
  | "control-black-1"
  | "control-black-2"
  | "control-black-3";

export type TrainingBoardHandle = {
  showLoadingBadge: (square: string) => void;
  clearLoadingBadge: () => void;
  showAccuracyBadge: (square: string, severity: Severity) => void;
  drawBestMoveArrow: (from: string, to: string) => void;
  clearBestMoveArrow: () => void;
  clearAnnotations: () => void;
  setBoardPosition: (fen: string, animated?: boolean) => void;
  movePieceAnimated: (from: string, to: string) => void;
  addSquareMarker: (square: string, kind: "correct" | "wrong") => void;
  clearSquareMarkers: () => void;
  addCoachSquareMarker: (square: string, kind: SquareMarkerKind) => void;
  clearCoachSquareMarkers: () => void;
  dimPieces: (squares: string[]) => void;
  clearDimPieces: () => void;
};
