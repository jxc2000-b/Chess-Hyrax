// cm-chessboard feature demo. Mounts a standalone board with normal user
// move input and visualizes x-ray tactics after every move: for each sliding
// piece, rays are cast through the first enemy blocker to see what stands
// behind it. Absolute pins (king behind), relative pins (bigger piece
// behind), and skewers (bigger piece in front) are drawn on the board.

import { useEffect, useRef } from "react";
import { BORDER_TYPE, Chessboard, COLOR, INPUT_EVENT_TYPE } from "cm-chessboard";
import { MARKER_TYPE, Markers } from "cm-chessboard/src/extensions/markers/Markers.js";
import { Chess, type PieceSymbol, type Square } from "chess.js";
import "cm-chessboard/assets/chessboard.css";
import "cm-chessboard/assets/extensions/markers/markers.css";
import "../app.css";

const STARTING_FEN = "4k3/8/8/4r3/8/8/4Q3/2K5 w - - 0 1";
const MARKER_SQUARE_ATTACKER = { class: "demo-marker-square-important", slice: "markerSquare" };
const MARKER_SQUARE_FRONT = { class: "demo-marker-square-red", slice: "markerSquare" };
const MARKER_SQUARE_RAY = { class: "demo-marker-square-green", slice: "markerSquare" };

const FILES = "abcdefgh";
const PIECE_VALUES: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: Infinity };

const DIAGONAL_DIRECTIONS = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;
const ORTHOGONAL_DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

type LegalMove = {
  from: string;
  to: string;
  promotion?: string;
  san?: string;
};

type LooseChessboard = {
  addMarker: (type: unknown, square: string) => void;
  removeMarkers: (type?: unknown, square?: string) => void;
  addLegalMovesMarkers?: (moves: unknown[]) => void;
  removeLegalMovesMarkers?: () => void;
  enableMoveInput: (handler: (event: any) => boolean | void | undefined, color?: string) => void;
  disableMoveInput: () => void;
  destroy: () => void;
};

type XRay = {
  kind: "absolute pin" | "relative pin" | "skewer";
  attacker: Square;
  front: Square;
  back: Square;
  ray: Square[]; // squares strictly between attacker and back piece, minus the front piece
};

function getSideToMove(fen: string): string {
  return fen.split(" ")[1] === "b" ? COLOR.black : COLOR.white;
}

function pieceMatchesTurn(piece: string | undefined, color: string): boolean {
  if (!piece) {
    return false;
  }

  return (color === COLOR.white && piece.startsWith("w")) || (color === COLOR.black && piece.startsWith("b"));
}

function slidingDirections(type: PieceSymbol): ReadonlyArray<readonly [number, number]> {
  if (type === "b") {
    return DIAGONAL_DIRECTIONS;
  }
  if (type === "r") {
    return ORTHOGONAL_DIRECTIONS;
  }
  if (type === "q") {
    return [...DIAGONAL_DIRECTIONS, ...ORTHOGONAL_DIRECTIONS];
  }
  return [];
}

// Walks one ray from a sliding piece: if the first piece hit is an enemy and
// the second piece hit (through it) is a more valuable enemy, that's a pin or
// skewer depending on which of the two is bigger.
function castRay(chess: Chess, fromFile: number, fromRank: number, dir: readonly [number, number]): XRay | null {
  const attackerSquare = `${FILES[fromFile]}${fromRank + 1}` as Square;
  const attacker = chess.get(attackerSquare);
  if (!attacker) {
    return null;
  }

  const ray: Square[] = [];
  let front: { square: Square; type: PieceSymbol } | null = null;

  let file = fromFile + dir[0];
  let rank = fromRank + dir[1];
  while (file >= 0 && file <= 7 && rank >= 0 && rank <= 7) {
    const square = `${FILES[file]}${rank + 1}` as Square;
    const piece = chess.get(square);

    if (!piece) {
      ray.push(square);
    } else if (!front) {
      if (piece.color === attacker.color) {
        return null;
      }
      front = { square, type: piece.type };
    } else {
      if (piece.color === attacker.color) {
        return null;
      }
      const frontValue = PIECE_VALUES[front.type];
      const backValue = PIECE_VALUES[piece.type];
      if (piece.type === "k") {
        return { kind: "absolute pin", attacker: attackerSquare, front: front.square, back: square, ray };
      }
      if (backValue > frontValue) {
        return { kind: "relative pin", attacker: attackerSquare, front: front.square, back: square, ray };
      }
      if (frontValue > backValue && front.type !== "k") {
        return { kind: "skewer", attacker: attackerSquare, front: front.square, back: square, ray };
      }
      return null;
    }

    file += dir[0];
    rank += dir[1];
  }

  return null;
}

function findXRays(chess: Chess): XRay[] {
  const xrays: XRay[] = [];
  const rows = chess.board();

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    for (let fileIndex = 0; fileIndex < rows[rowIndex].length; fileIndex += 1) {
      const piece = rows[rowIndex][fileIndex];
      if (!piece) {
        continue;
      }
      const rank = 7 - rowIndex;
      for (const dir of slidingDirections(piece.type)) {
        const xray = castRay(chess, fileIndex, rank, dir);
        if (xray) {
          xrays.push(xray);
        }
      }
    }
  }

  return xrays;
}

function XRayPinDemoPage() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const labelRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!hostRef.current) {
      return undefined;
    }

    const board = new Chessboard(hostRef.current, {
      assetsUrl: "/cm-chessboard/",
      position: STARTING_FEN,
      style: {
        cssClass: "default",
        showCoordinates: true,
        borderType: BORDER_TYPE.frame,
      },
      extensions: [{ class: Markers, props: { autoMarkers: MARKER_TYPE.frame } }],
    }) as unknown as LooseChessboard;

    const chess = new Chess(STARTING_FEN);
    let pendingMove: LegalMove | null = null;
    let enableInputTimer: number | null = null;

    function enableInputForCurrentTurn() {
      board.disableMoveInput();
      board.enableMoveInput(handleMoveInput);
    }

    function queueEnableInputForCurrentTurn() {
      if (enableInputTimer !== null) {
        window.clearTimeout(enableInputTimer);
      }
      enableInputTimer = window.setTimeout(() => {
        enableInputTimer = null;
        enableInputForCurrentTurn();
      }, 0);
    }

    function drawXRays() {
      board.removeMarkers(MARKER_SQUARE_ATTACKER);
      board.removeMarkers(MARKER_SQUARE_FRONT);
      board.removeMarkers(MARKER_SQUARE_RAY);

      const xrays = findXRays(chess);

      for (const xray of xrays) {
        for (const square of xray.ray) {
          board.addMarker(MARKER_SQUARE_RAY, square);
        }
        board.addMarker(MARKER_SQUARE_ATTACKER, xray.attacker);
        board.addMarker(MARKER_SQUARE_FRONT, xray.front);
      }

      if (labelRef.current) {
        labelRef.current.textContent =
          xrays.length > 0
            ? xrays.map((xray) => `${xray.kind}: ${xray.attacker} → ${xray.front} → ${xray.back}`).join(" · ")
            : "no pins or skewers on the board";
      }
    }

    function handleMoveInput(event: any): boolean | void | undefined {
      const activeColor = getSideToMove(chess.fen());

      switch (event.type) {
        case INPUT_EVENT_TYPE.moveInputStarted: {
          if (!pieceMatchesTurn(event.piece, activeColor)) {
            return false;
          }

          pendingMove = null;
          board.removeLegalMovesMarkers?.();
          const legalMoves = chess.moves({ square: event.squareFrom, verbose: true });
          board.addLegalMovesMarkers?.(legalMoves);
          return legalMoves.length > 0;
        }

        case INPUT_EVENT_TYPE.validateMoveInput: {
          const promotion = event.promotion || "q";
          const legalMoves = chess.moves({ square: event.squareFrom, verbose: true }) as LegalMove[];
          const matchedMove = legalMoves.find((move) => {
            if (move.to !== event.squareTo) {
              return false;
            }
            return !move.promotion || move.promotion === promotion;
          });

          pendingMove = matchedMove ?? null;
          return Boolean(matchedMove);
        }

        case INPUT_EVENT_TYPE.moveInputCanceled:
          pendingMove = null;
          board.removeLegalMovesMarkers?.();
          break;

        case INPUT_EVENT_TYPE.moveInputFinished:
          board.removeLegalMovesMarkers?.();

          if (event.legalMove && pendingMove) {
            const playedMove = pendingMove;
            pendingMove = null;
            const moveResult = chess.move({
              from: playedMove.from,
              to: playedMove.to,
              promotion: playedMove.promotion || undefined,
            });
            if (moveResult) {
              drawXRays();
              queueEnableInputForCurrentTurn();
            }
          }
          break;

        default:
          break;
      }

      return undefined;
    }

    drawXRays();
    enableInputForCurrentTurn();

    return () => {
      if (enableInputTimer !== null) {
        window.clearTimeout(enableInputTimer);
      }
      board.disableMoveInput();
      board.destroy();
    };
  }, []);

  return (
    <main className="main-page">
      <header className="page-headers">
        <div className="logo">x-ray / pin demo</div>
        <span ref={labelRef} style={{ fontFamily: '"Courier New", Courier, monospace', fontSize: "0.85rem" }}>
          make a move
        </span>
      </header>

      <section style={{ flex: "1 1 auto", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div ref={hostRef} style={{ width: "min(80svh, 80vw)", aspectRatio: "1" }} />
      </section>
    </main>
  );
}

export default XRayPinDemoPage;
