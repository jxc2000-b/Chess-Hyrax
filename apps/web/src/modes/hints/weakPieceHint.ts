import { Chess } from "chess.js";
import { engineService } from "../../Stockfish/engineService";
import type { HintContext, HintModule } from "./types";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["1", "2", "3", "4", "5", "6", "7", "8"];
const PV_ABSENT_PENALTY = 2;
const HOME_SQUARE_PENALTY = 3;
const MIN_WEAKNESS_SCORE_TO_MARK = 3;
const MIN_FULLMOVE_NUMBER_TO_MARK_ROOKS = 16;

type CandidateColor = "w" | "b";
type CandidatePieceType = "n" | "b" | "r" | "q";

type WeakPieceCandidate = {
  square: string;
  color: CandidateColor;
  type: CandidatePieceType;
};

type ScoredWeakPiece = WeakPieceCandidate & {
  legalMoveCount: number;
  pvAbsentPenalty: number;
  lowMobilityPenalty: number;
  homeSquarePenalty: number;
  weaknessScore: number;
};

const HOME_SQUARES: Record<CandidateColor, Record<CandidatePieceType, readonly string[]>> = {
  w: {
    n: ["b1", "g1"],
    b: ["c1", "f1"],
    r: ["a1", "h1"],
    q: ["d1"],
  },
  b: {
    n: ["b8", "g8"],
    b: ["c8", "f8"],
    r: ["a8", "h8"],
    q: ["d8"],
  },
};

function isCandidatePieceType(type: string): type is CandidatePieceType {
  return type === "n" || type === "b" || type === "r" || type === "q";
}

function getCandidatePieces(chess: Chess): WeakPieceCandidate[] {
  const candidates: WeakPieceCandidate[] = [];

  for (const rank of RANKS) {
    for (const file of FILES) {
      const square = `${file}${rank}`;
      const piece = chess.get(square as any);
      if (!piece || !isCandidatePieceType(piece.type)) {
        continue;
      }

      candidates.push({
        square,
        color: piece.color as CandidateColor,
        type: piece.type,
      });
    }
  }

  return candidates;
}

function getFenForSideToMove(fen: string, color: CandidateColor): string {
  const parts = fen.split(" ");
  parts[1] = color;
  return parts.join(" ");
}

function getFullmoveNumber(fen: string): number {
  return Number(fen.split(" ")[5] ?? 1);
}

function canMarkCandidatePiece(candidate: WeakPieceCandidate, fullmoveNumber: number): boolean {
  return candidate.type !== "r" || fullmoveNumber >= MIN_FULLMOVE_NUMBER_TO_MARK_ROOKS;
}

function getLowMobilityPenalty(legalMoveCount: number): number {
  if (legalMoveCount <= 0) {
    return 4;
  }
  if (legalMoveCount === 1) {
    return 3;
  }
  if (legalMoveCount === 2) {
    return 2;
  }
  if (legalMoveCount === 3) {
    return 1;
  }
  return 0;
}

function getHomeSquarePenalty(candidate: WeakPieceCandidate): number {
  return HOME_SQUARES[candidate.color][candidate.type].includes(candidate.square) ? HOME_SQUARE_PENALTY : 0;
}

function getPvAbsentPenalty(candidate: WeakPieceCandidate, pvParticipantSquares: Set<string>, principalVariation: string[]): number {
  if (principalVariation.length === 0) {
    return 0;
  }
  return pvParticipantSquares.has(candidate.square) ? 0 : PV_ABSENT_PENALTY;
}

function getCastlingRookMove(chess: Chess, from: string, to: string): { from: string; to: string } | null {
  const piece = chess.get(from as any);
  if (!piece || piece.type !== "k") {
    return null;
  }

  if (from === "e1" && to === "g1") {
    return { from: "h1", to: "f1" };
  }
  if (from === "e1" && to === "c1") {
    return { from: "a1", to: "d1" };
  }
  if (from === "e8" && to === "g8") {
    return { from: "h8", to: "f8" };
  }
  if (from === "e8" && to === "c8") {
    return { from: "a8", to: "d8" };
  }

  return null;
}

function getPvParticipantSquares(fen: string, candidates: WeakPieceCandidate[], principalVariation: string[]): Set<string> {
  const replayChess = new Chess(fen);
  const currentSquareToRootSquare = new Map<string, string>();
  const participantSquares = new Set<string>();

  for (const candidate of candidates) {
    currentSquareToRootSquare.set(candidate.square, candidate.square);
  }

  // Track pieces by their original root square so a piece still counts as
  // participating if it moves later in the PV.
  for (const uciMove of principalVariation) {
    const from = uciMove.slice(0, 2);
    const to = uciMove.slice(2, 4);
    const promotion = uciMove.slice(4, 5) || undefined;
    if (!from || !to) {
      break;
    }

    const movedRootSquare = currentSquareToRootSquare.get(from);
    const capturedRootSquare = currentSquareToRootSquare.get(to);
    const castlingRookMove = getCastlingRookMove(replayChess, from, to);
    const castlingRookRootSquare = castlingRookMove ? currentSquareToRootSquare.get(castlingRookMove.from) : undefined;

    if (movedRootSquare) {
      participantSquares.add(movedRootSquare);
    }
    if (castlingRookRootSquare) {
      participantSquares.add(castlingRookRootSquare);
    }

    const moveResult = replayChess.move({ from, to, promotion });
    if (!moveResult) {
      break;
    }

    if (capturedRootSquare) {
      currentSquareToRootSquare.delete(to);
    }
    if (movedRootSquare) {
      currentSquareToRootSquare.delete(from);
      currentSquareToRootSquare.set(to, movedRootSquare);
    }
    if (castlingRookMove && castlingRookRootSquare) {
      currentSquareToRootSquare.delete(castlingRookMove.from);
      currentSquareToRootSquare.set(castlingRookMove.to, castlingRookRootSquare);
    }
  }

  return participantSquares;
}

function scoreWeakPieces(fen: string, principalVariation: string[]): ScoredWeakPiece[] {
  const rootChess = new Chess(fen);
  const mobilityChessByColor: Record<CandidateColor, Chess> = {
    w: new Chess(getFenForSideToMove(fen, "w")),
    b: new Chess(getFenForSideToMove(fen, "b")),
  };
  const candidates = getCandidatePieces(rootChess);
  const pvParticipantSquares = getPvParticipantSquares(fen, candidates, principalVariation);
  const fullmoveNumber = getFullmoveNumber(fen);

  return candidates
    .filter((candidate) => canMarkCandidatePiece(candidate, fullmoveNumber))
    .map((candidate) => {
      const legalMoveCount = mobilityChessByColor[candidate.color].moves({
        square: candidate.square as any,
        verbose: true,
      }).length;
      const pvAbsentPenalty = getPvAbsentPenalty(candidate, pvParticipantSquares, principalVariation);
      const lowMobilityPenalty = getLowMobilityPenalty(legalMoveCount);
      const homeSquarePenalty = getHomeSquarePenalty(candidate);
      const weaknessScore = pvAbsentPenalty + lowMobilityPenalty + homeSquarePenalty;

      return {
        ...candidate,
        legalMoveCount,
        pvAbsentPenalty,
        lowMobilityPenalty,
        homeSquarePenalty,
        weaknessScore,
      };
    })
    .filter((piece) => piece.weaknessScore >= MIN_WEAKNESS_SCORE_TO_MARK)
    .sort((a, b) => b.weaknessScore - a.weaknessScore || a.square.localeCompare(b.square));
}

function isWeakPieceSquares(prepared: unknown): prepared is string[] {
  return Array.isArray(prepared);
}

export const weakPieceHint: HintModule = {
  id: "weak-piece",
  label: "Weak piece",
  canRun: (ctx: HintContext) => Boolean(ctx.position && ctx.fen),
  async prepare(ctx: HintContext): Promise<string[]> {
    const analysis = await engineService.analyze(ctx.fen, { priority: "high" });
    return scoreWeakPieces(ctx.fen, analysis.principalVariation).map((piece) => piece.square);
  },
  apply(ctx: HintContext, prepared: unknown) {
    if (!isWeakPieceSquares(prepared)) {
      return;
    }
    ctx.boardRef.current?.dimPieces(prepared);
  },
  clear(ctx: HintContext) {
    ctx.boardRef.current?.clearDimPieces();
  },
};
