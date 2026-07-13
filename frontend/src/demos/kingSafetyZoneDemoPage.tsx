// cm-chessboard feature demo. Mounts a standalone board with normal user
// move input and shades each king's safety zone (the king square plus its
// neighbors) by how many enemy pieces attack each square, recomputed after
// every move.

import { useEffect, useRef } from "react";
import { BORDER_TYPE, Chessboard, COLOR, INPUT_EVENT_TYPE } from "cm-chessboard";
import { MARKER_TYPE, Markers } from "cm-chessboard/src/extensions/markers/Markers.js";
import { Chess, type Color, type Square } from "chess.js";
import "cm-chessboard/assets/chessboard.css";
import "cm-chessboard/assets/extensions/markers/markers.css";
import "../app.css";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const FILES = "abcdefgh";
const MAX_THREAT_LEVEL = 3;
const THREAT_MARKERS = Array.from({ length: MAX_THREAT_LEVEL + 1 }, (_, level) => ({
  class: `demo-marker-threat-${level}`,
  slice: "markerSquare",
}));

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

function getSideToMove(fen: string): string {
  return fen.split(" ")[1] === "b" ? COLOR.black : COLOR.white;
}

function pieceMatchesTurn(piece: string | undefined, color: string): boolean {
  if (!piece) {
    return false;
  }

  return (color === COLOR.white && piece.startsWith("w")) || (color === COLOR.black && piece.startsWith("b"));
}

function findKingSquare(chess: Chess, color: Color): Square | null {
  for (const row of chess.board()) {
    for (const piece of row) {
      if (piece && piece.type === "k" && piece.color === color) {
        return piece.square;
      }
    }
  }
  return null;
}

// The king's square plus its neighbors, clamped to the board.
function kingZone(kingSquare: Square): Square[] {
  const file = FILES.indexOf(kingSquare[0]);
  const rank = Number(kingSquare[1]) - 1;

  const squares: Square[] = [];
  for (let df = -1; df <= 1; df += 1) {
    for (let dr = -1; dr <= 1; dr += 1) {
      const f = file + df;
      const r = rank + dr;
      if (f >= 0 && f <= 7 && r >= 0 && r <= 7) {
        squares.push(`${FILES[f]}${r + 1}` as Square);
      }
    }
  }
  return squares;
}

function KingSafetyZoneDemoPage() {
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

    // Shades one king's zone and returns the total number of enemy attacks
    // into it.
    function drawZone(kingColor: Color): number {
      const kingSquare = findKingSquare(chess, kingColor);
      if (!kingSquare) {
        return 0;
      }

      const enemyColor: Color = kingColor === "w" ? "b" : "w";
      let totalAttacks = 0;

      for (const square of kingZone(kingSquare)) {
        const attackerCount = chess.attackers(square, enemyColor).length;
        totalAttacks += attackerCount;
        const level = Math.min(attackerCount, MAX_THREAT_LEVEL);
        board.addMarker(THREAT_MARKERS[level], square);
      }

      return totalAttacks;
    }

    function drawKingSafetyZones() {
      for (const marker of THREAT_MARKERS) {
        board.removeMarkers(marker);
      }

      const whiteAttacks = drawZone("w");
      const blackAttacks = drawZone("b");

      if (labelRef.current) {
        labelRef.current.textContent = `attacks into king zone — white: ${whiteAttacks}, black: ${blackAttacks}`;
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
              drawKingSafetyZones();
              queueEnableInputForCurrentTurn();
            }
          }
          break;

        default:
          break;
      }

      return undefined;
    }

    drawKingSafetyZones();
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
        <div className="logo">king safety zone demo</div>
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

export default KingSafetyZoneDemoPage;
