import { Chess } from "chess.js";

import type { PuzzleTags, SessionData, ShrunkTrainingPosition } from "../types";

const POSITIONAL_TAG_MIN_PIECES = 20;
const POSITIONAL_TAG_MIN_MOVE_NUMBER = 10;
const OPENING_TAG_MAX_MOVE_NUMBER = 9;
const ENDGAME_MAX_PLAYING_SIDE_MATERIAL = 13;
// How many plies of the principal variation to scan for forcing moves.
const POSITIONAL_PV_PLY_LIMIT = 8;
// A check (+ / #) or capture (x) marks the line as tactical rather than positional.
const FORCING_MOVE_PATTERN = /[+#x]/;
const PIECE_VALUES: Record<string, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

export type ParsedGame = NonNullable<SessionData["games"]>[number];
type UserColorForGame = NonNullable<ShrunkTrainingPosition["userColorForGame"]>;

export function shufflePositions(positions: ShrunkTrainingPosition[]): ShrunkTrainingPosition[] {
  const shuffled = [...positions];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export function getGameUserColor(game: ParsedGame): UserColorForGame | null {
  const userColorForGame = game.moves[0]?.userColorForGame;
  if (!userColorForGame) {
    console.error("Puzzle miner skipped game without user color metadata:", game.sourceGame);
    return null;
  }

  const hasMismatch = game.moves.some((move) => move.userColorForGame !== userColorForGame);
  if (hasMismatch) {
    console.error("Puzzle miner skipped game with inconsistent user color metadata:", game.sourceGame);
    return null;
  }

  return userColorForGame;
}

function countPiecesFromFen(fen: string): number {
  const boardPart = fen.trim().split(/\s+/)[0] ?? "";
  return boardPart.match(/[pnbrqk]/gi)?.length ?? 0;
}

function getFenParts(fen: string): { boardPart: string; sideToMove: "w" | "b" | null } {
  const [boardPart = "", sideToMove = ""] = fen.trim().split(/\s+/);
  return {
    boardPart,
    sideToMove: sideToMove === "w" || sideToMove === "b" ? sideToMove : null,
  };
}

function getMoveNumber(move: ShrunkTrainingPosition): number {
  const fenMoveNumber = Number(move.fen.trim().split(/\s+/)[5]);
  return move.moveNumber ?? (Number.isFinite(fenMoveNumber) ? fenMoveNumber : 0);
}

function getPlayingSidePieces(fen: string): string[] {
  const { boardPart, sideToMove } = getFenParts(fen);
  if (!sideToMove) {
    return [];
  }

  const piecePattern = sideToMove === "w" ? /[PNBRQK]/g : /[pnbrqk]/g;
  return boardPart.match(piecePattern) ?? [];
}

function getPlayingSideMaterialProfile(pieces: string[]): {
  material: number;
  hasQueen: boolean;
  hasRook: boolean;
  hasBishop: boolean;
  hasKnight: boolean;
} {
  let material = 0;
  let hasQueen = false;
  let hasRook = false;
  let hasBishop = false;
  let hasKnight = false;

  for (const piece of pieces) {
    const normalizedPiece = piece.toLowerCase();
    material += PIECE_VALUES[normalizedPiece] ?? 0;
    hasQueen ||= normalizedPiece === "q";
    hasRook ||= normalizedPiece === "r";
    hasBishop ||= normalizedPiece === "b";
    hasKnight ||= normalizedPiece === "n";
  }

  return { material, hasQueen, hasRook, hasBishop, hasKnight };
}

// Replays the engine pv (UCI) from the position and tags the line "non-positional"
// if a check or capture shows up within the first few plies, "positional" otherwise.
// Positions without a pv are left untagged on this axis.
function getPositionalTag(
  move: ShrunkTrainingPosition,
): Extract<PuzzleTags, "positional" | "non-positional"> | null {
  const pv = move.pv ?? [];
  if (pv.length === 0) {
    return null;
  }

  const chess = new Chess(move.fen);
  for (const uci of pv.slice(0, POSITIONAL_PV_PLY_LIMIT)) {
    const { san } = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.slice(4) || undefined,
    });
    if (FORCING_MOVE_PATTERN.test(san)) {
      return "non-positional";
    }
  }

  return "positional";
}

function getDifficultyTag(move: ShrunkTrainingPosition): Extract<PuzzleTags, "easy" | "medium" | "hard"> {
  if (
    move.bestMoveAtIntermediateAnalysis &&
    move.bestMove &&
    move.bestMoveAtIntermediateAnalysis !== move.bestMove
  ) {
    return "hard";
  }

  return move.playedMoveUci && move.bestMove && move.playedMoveUci === move.bestMove
    ? "easy"
    : "medium";
}

function pushPuzzleTag(tags: PuzzleTags[], tag: PuzzleTags): void {
  if (!tags.includes(tag)) {
    tags.push(tag);
  }
}

export function puzzleTagger(move: ShrunkTrainingPosition): ShrunkTrainingPosition {
  const pieceCount = countPiecesFromFen(move.fen);
  const moveNumber = getMoveNumber(move);
  const playingSidePieces = getPlayingSidePieces(move.fen);
  const playingSideMaterialProfile = getPlayingSideMaterialProfile(playingSidePieces);
  const puzzleTag: PuzzleTags[] = [];

  if (moveNumber <= OPENING_TAG_MAX_MOVE_NUMBER) {
    puzzleTag.push("opening");
  }

  if (playingSideMaterialProfile.material <= ENDGAME_MAX_PLAYING_SIDE_MATERIAL) {
    puzzleTag.push("endgame");
    if (playingSideMaterialProfile.hasQueen) {
      puzzleTag.push("queen-endgame");
    }
    if (playingSideMaterialProfile.hasRook) {
      puzzleTag.push("rook-endgame");
    }
    if (playingSideMaterialProfile.hasBishop) {
      puzzleTag.push("bishop-endgame");
    }
    if (playingSideMaterialProfile.hasKnight) {
      puzzleTag.push("knight-endgame");
    }
  }

  if (pieceCount >= POSITIONAL_TAG_MIN_PIECES && moveNumber >= POSITIONAL_TAG_MIN_MOVE_NUMBER) {
    puzzleTag.push("middlegame");
  }

  const positionalTag = getPositionalTag(move);
  if (positionalTag) {
    puzzleTag.push(positionalTag);
  }

  if (puzzleTag.length === 0) {
    puzzleTag.push("not-labeled");
  }

  pushPuzzleTag(puzzleTag, getDifficultyTag(move));
  for (const tag of move.puzzleTag ?? []) {
    pushPuzzleTag(puzzleTag, tag);
  }

  return { ...move, puzzleTag };
}
