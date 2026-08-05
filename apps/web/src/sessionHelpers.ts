import { Chess } from "chess.js";
import type {
    ChessSide,
    Severity,
    ShrunkTrainingPosition
} from "./types";

export const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export const CORRECT_FEEDBACK_DELAY_MS = 1250;
export const INCORRECT_FEEDBACK_DELAY_MS = 1250;

export type BoardView = {
  fen: string;
  orientationFen: string;
};

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function normalizeAnswer(answer: string | null | undefined): string {
  return String(answer || "")
    .trim()
    .toLowerCase()
    .replace(/[+#]+$/g, "");
}

export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatCorrectMoveLabel(
  correctMoveSan: string | null | undefined,
  correctMove: string | null | undefined,
): string {
  const san = String(correctMoveSan || "").trim();

  if (san) {
    return san;
  }

  return String(correctMove || "").trim();
}

export function createBoardView(position: ShrunkTrainingPosition | null | undefined): BoardView {
  return {
    fen: position?.fen || "",
    orientationFen: position?.fen || "",
  };
}

export function getBoardOrientation(fen: string): "w" | "b" {
  return fen.split(" ")[1] === "b" ? "b" : "w";
}

export function getFenSideToMove(fen: string): ChessSide {
  return fen.split(" ")[1] === "b" ? "black" : "white";
}


export function parseUciSquares(
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

export function applyUciToFen(fen: string, uci: string): string | null {
  const parts = parseUciSquares(uci);
  if (!parts || !fen) {
    return null;
  }
  try {
    const chess = new Chess(fen);
    const move = chess.move({
      from: parts.from,
      to: parts.to,
      promotion: parts.promotion ?? undefined,
    });
    return move ? chess.fen() : null;
  } catch {
    return null;
  }
}

export function applySanToFen(fen: string, san: string): string | null {
  if (!fen || !san) {
    return null;
  }
  try {
    const chess = new Chess(fen);
    const move = chess.move(san);
    return move ? chess.fen() : null;
  } catch {
    return null;
  }
}

/* --------------------------------------------------------------------------
 * Attempt recording
 * -------------------------------------------------------------------------- */
