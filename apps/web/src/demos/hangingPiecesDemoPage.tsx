// cm-chessboard feature demo. Mounts a standalone board with normal user
// move input and marks hanging pieces after every move: red when a piece has
// more enemy attackers than defenders, yellow when it is attacked by a
// cheaper piece (so being defended doesn't save it). Kings are ignored —
// an attacked king is simply check.

import { useEffect, useRef } from "react";
import { BORDER_TYPE, Chessboard, COLOR, INPUT_EVENT_TYPE } from "cm-chessboard";
import { MARKER_TYPE, Markers } from "cm-chessboard/src/extensions/markers/Markers.js";
import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";
import "cm-chessboard/assets/chessboard.css";
import "cm-chessboard/assets/extensions/markers/markers.css";
import "../app.css";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const MARKER_SQUARE_HANGING = { class: "demo-marker-square-red", slice: "markerSquare" };
const MARKER_SQUARE_THREATENED = { class: "demo-marker-threat-1", slice: "markerSquare" };

const PIECE_VALUES: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: Infinity };

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

function cheapestAttackerValue(chess: Chess, square: Square, byColor: Color): number {
  let cheapest = Infinity;
  for (const attackerSquare of chess.attackers(square, byColor)) {
    const attacker = chess.get(attackerSquare);
    if (attacker) {
      cheapest = Math.min(cheapest, PIECE_VALUES[attacker.type]);
    }
  }
  return cheapest;
}

function HangingPiecesDemoPage() {
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

    function drawHangingPieces() {
      board.removeMarkers(MARKER_SQUARE_HANGING);
      board.removeMarkers(MARKER_SQUARE_THREATENED);

      const hanging: string[] = [];
      const threatened: string[] = [];

      for (const row of chess.board()) {
        for (const piece of row) {
          if (!piece || piece.type === "k") {
            continue;
          }

          const enemyColor: Color = piece.color === "w" ? "b" : "w";
          const attackers = chess.attackers(piece.square, enemyColor);
          if (attackers.length === 0) {
            continue;
          }

          const defenders = chess.attackers(piece.square, piece.color);
          if (attackers.length > defenders.length) {
            board.addMarker(MARKER_SQUARE_HANGING, piece.square);
            hanging.push(piece.square);
          } else if (cheapestAttackerValue(chess, piece.square, enemyColor) < PIECE_VALUES[piece.type]) {
            board.addMarker(MARKER_SQUARE_THREATENED, piece.square);
            threatened.push(piece.square);
          }
        }
      }

      if (labelRef.current) {
        const parts: string[] = [];
        if (hanging.length > 0) {
          parts.push(`hanging: ${hanging.join(", ")}`);
        }
        if (threatened.length > 0) {
          parts.push(`attacked by cheaper piece: ${threatened.join(", ")}`);
        }
        labelRef.current.textContent = parts.length > 0 ? parts.join(" · ") : "nothing is hanging";
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
              drawHangingPieces();
              queueEnableInputForCurrentTurn();
            }
          }
          break;

        default:
          break;
      }

      return undefined;
    }

    drawHangingPieces();
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
        <div className="logo">hanging pieces demo</div>
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

export default HangingPiecesDemoPage;
