import { COLOR } from "cm-chessboard";
import type { SquareMarkerKind, Severity } from "../types";

export type LegalMove = {
  from: string;
  to: string;
  promotion?: string;
};

// cm-chessboard exposes extension-injected methods at runtime but doesn't
// declare them on its TypeScript type. This narrows the imperative surface
// the page uses without leaking `any` everywhere.
export type BoardWithExtensions = {
  setCornerBadge?: (role: string, iconUrl: string, square: string) => void;
  removeCornerBadge?: (role: string) => void;
  removeCornerBadges?: () => void;
  addArrow?: (type: unknown, from: string, to: string) => void;
  removeArrows?: (type?: unknown, from?: string, to?: string) => void;
  addMarker?: (type: unknown, square: string) => void;
  removeMarkers?: (type?: unknown, square?: string) => void;
  setPosition?: (fen: string, animated?: boolean) => Promise<void> | void;
  movePiece?: (from: string, to: string, animated?: boolean) => Promise<void> | void;
};

export const LOADING_BADGE_ROLE = "loading";
export const RESULT_BADGE_ROLE = "result";

// Custom marker types for puzzle-style "correct"/"wrong" square fills.
// Reuses the built-in markerSquare slice but applies our own CSS classes
// so we can color them independently of the default marker styling.
export const PUZZLE_MARKER_CORRECT = { class: "puzzle-marker-square-correct", slice: "markerSquare" };
export const PUZZLE_MARKER_WRONG = { class: "puzzle-marker-square-wrong", slice: "markerSquare" };
export const ENGINE_BEST_MOVE_ARROW = { class: "engine-arrow-best-move" };
export const COACH_MARKERS: Record<SquareMarkerKind, { class: string; slice: string }> = {
  important: { class: "coach-marker-square-important", slice: "markerSquare" },
  "control-white-1": { class: "control-marker-square-white-1", slice: "markerSquare" },
  "control-white-2": { class: "control-marker-square-white-2", slice: "markerSquare" },
  "control-white-3": { class: "control-marker-square-white-3", slice: "markerSquare" },
  "control-black-1": { class: "control-marker-square-black-1", slice: "markerSquare" },
  "control-black-2": { class: "control-marker-square-black-2", slice: "markerSquare" },
  "control-black-3": { class: "control-marker-square-black-3", slice: "markerSquare" },
};
export const COACH_MARKER_TYPES = Object.values(COACH_MARKERS);
export const DIMMED_PIECE_CLASS = "board-piece-dimmed";
export const DIMMED_PIECE_REDRAW_SETTLE_MS = 350;

export const LOADING_SPINNER_URL = "/loading-spinner.svg";

const SEVERITY_BADGE_URLS: Record<Severity, string> = {
  best: "/brilliance_v2/svg/best.svg",
  good: "/brilliance_v2/svg/excellent.svg",
  ok: "/brilliance_v2/svg/good.svg",
  inaccuracy: "/brilliance_v2/svg/inaccuracy.svg",
  mistake: "/brilliance_v2/svg/mistake.svg",
  blunder: "/brilliance_v2/svg/blunder.svg",
  unscored: "/brilliance_v2/svg/correct.svg",
  correct: "/brilliance_v2/svg/correct.svg",
  incorrect: "/brilliance_v2/svg/incorrect.svg",
};

export function severityToBadgeUrl(severity: Severity): string {
  return SEVERITY_BADGE_URLS[severity] ?? SEVERITY_BADGE_URLS.unscored;
}

export function getSideToMove(fen: string): string {
  return fen.split(" ")[1] === "b" ? COLOR.black : COLOR.white;
}

export function pieceMatchesTurn(piece: string | undefined, color: string): boolean {
  if (!piece) {
    return false;
  }

  return (color === COLOR.white && piece.startsWith("w")) || (color === COLOR.black && piece.startsWith("b"));
}

export function moveToUci(move: LegalMove): string {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

export function removeDimPieceClasses(host: HTMLElement | null) {
  host?.querySelectorAll(`.${DIMMED_PIECE_CLASS}`).forEach((piece) => {
    piece.classList.remove(DIMMED_PIECE_CLASS);
  });
}

export function applyDimPieceClasses(host: HTMLElement | null, squares: string[]) {
  removeDimPieceClasses(host);
  for (const square of squares) {
    const piece = host?.querySelector(`.pieces g[data-square="${square}"]`);
    piece?.classList.add(DIMMED_PIECE_CLASS);
  }
}
