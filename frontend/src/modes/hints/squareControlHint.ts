import { Chess } from "chess.js";
import type { SquareMarkerKind } from "../../types";
import type { HintContext, HintModule } from "./types";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["1", "2", "3", "4", "5", "6", "7", "8"];
const CONTROL_MARKER_MIN_ABS_SCORE = 1;
const CONTROL_MARKER_MAX_INTENSITY = 3;

type ControlSide = "white" | "black";

type SquareControlMarker = {
  square: string;
  kind: SquareMarkerKind;
};

function getAllSquares(): string[] {
  const squares: string[] = [];
  for (const rank of RANKS) {
    for (const file of FILES) {
      squares.push(`${file}${rank}`);
    }
  }
  return squares;
}

function getControlMarkerKind(side: ControlSide, intensity: 1 | 2 | 3): SquareMarkerKind {
  return `control-${side}-${intensity}` as SquareMarkerKind;
}

function getSquareControlMarker(chess: Chess, square: string): SquareControlMarker | null {
  const whiteAttackers = chess.attackers(square as any, "w").length;
  const blackAttackers = chess.attackers(square as any, "b").length;
  const netControl = whiteAttackers - blackAttackers;

  if (netControl === 0 || Math.abs(netControl) < CONTROL_MARKER_MIN_ABS_SCORE) {
    return null;
  }

  const side = netControl > 0 ? "white" : "black";
  const intensity = Math.min(Math.abs(netControl), CONTROL_MARKER_MAX_INTENSITY) as 1 | 2 | 3;
  return { square, kind: getControlMarkerKind(side, intensity) };
}

function isSquareControlMarkers(prepared: unknown): prepared is SquareControlMarker[] {
  return Array.isArray(prepared);
}

export const squareControlHint: HintModule = {
  id: "square-control",
  label: "Square control",
  canRun: (ctx: HintContext) => Boolean(ctx.position && ctx.fen),
  prepare(ctx: HintContext): SquareControlMarker[] {
    const chess = new Chess(ctx.fen);
    return getAllSquares()
      .map((square) => getSquareControlMarker(chess, square))
      .filter((marker): marker is SquareControlMarker => Boolean(marker));
  },
  apply(ctx: HintContext, prepared: unknown) {
    if (!isSquareControlMarkers(prepared)) {
      return;
    }
    for (const marker of prepared) {
      ctx.boardRef.current?.addCoachSquareMarker(marker.square, marker.kind);
    }
  },
  clear(ctx: HintContext) {
    ctx.boardRef.current?.clearCoachSquareMarkers();
  },
};
