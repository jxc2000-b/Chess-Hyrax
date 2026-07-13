// cm-chessboard feature demo. Mounts a standalone board with normal user
// move input and draws the "rule of the square" region for the pawn that is
// furthest away from the enemy king, recomputing it after every move.

import { useEffect, useRef } from "react";
import { BORDER_TYPE, Chessboard, COLOR, INPUT_EVENT_TYPE } from "cm-chessboard";
import { MARKER_TYPE, Markers } from "cm-chessboard/src/extensions/markers/Markers.js";
import { Chess } from "chess.js";
import "cm-chessboard/assets/chessboard.css";
import "cm-chessboard/assets/extensions/markers/markers.css";
import "../app.css";

const STARTING_FEN = "8/8/2k5/8/8/8/P7/4K3 w - - 0 1";
const MARKER_SQUARE_REGION = { class: "demo-marker-square-green", slice: "markerSquare" };
const MARKER_SQUARE_PAWN = { class: "demo-marker-square-red", slice: "markerSquare" };

const FILES = "abcdefgh";

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

type BoardPiece = {
  square: string;
  type: string;
  color: "w" | "b";
  file: number; // 0-7
  rank: number; // 0-7
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

function collectPieces(chess: Chess): BoardPiece[] {
  const pieces: BoardPiece[] = [];
  chess.board().forEach((row, rowIndex) => {
    row.forEach((piece, fileIndex) => {
      if (piece) {
        pieces.push({
          square: piece.square,
          type: piece.type,
          color: piece.color,
          file: fileIndex,
          rank: 7 - rowIndex,
        });
      }
    });
  });
  return pieces;
}

function chebyshev(a: BoardPiece, b: BoardPiece): number {
  return Math.max(Math.abs(a.file - b.file), Math.abs(a.rank - b.rank));
}

// Squares of the rule-of-the-square region for `pawn` against `enemyKing`:
// from the pawn's rank (adjusted for the two-square first move) to the
// promotion rank, extending sideways toward the defending king. Squares that
// would fall off the board are simply omitted.
function ruleOfTheSquareRegion(pawn: BoardPiece, enemyKing: BoardPiece): string[] {
  const forward = pawn.color === "w" ? 1 : -1;
  const promotionRank = pawn.color === "w" ? 7 : 0;
  const startingRank = pawn.color === "w" ? 1 : 6;

  // A pawn on its starting square can advance two, so draw the square as if
  // it were one rank further ahead.
  const effectiveRank = pawn.rank === startingRank ? pawn.rank + forward : pawn.rank;
  const size = Math.abs(promotionRank - effectiveRank) + 1;
  const sideways = enemyKing.file >= pawn.file ? 1 : -1;

  const squares: string[] = [];
  for (let i = 0; i < size; i += 1) {
    const file = pawn.file + sideways * i;
    if (file < 0 || file > 7) {
      continue;
    }
    for (let j = 0; j < size; j += 1) {
      squares.push(`${FILES[file]}${effectiveRank + forward * j + 1}`);
    }
  }
  return squares;
}

function RuleOfTheSquareDemoPage() {
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

    function drawRuleOfTheSquare() {
      board.removeMarkers(MARKER_SQUARE_REGION);
      board.removeMarkers(MARKER_SQUARE_PAWN);

      const pieces = collectPieces(chess);
      const kings = new Map(pieces.filter((piece) => piece.type === "k").map((piece) => [piece.color, piece]));

      let furthestPawn: BoardPiece | null = null;
      let furthestKing: BoardPiece | null = null;
      let furthestDistance = -1;

      for (const pawn of pieces) {
        if (pawn.type !== "p") {
          continue;
        }
        const enemyKing = kings.get(pawn.color === "w" ? "b" : "w");
        if (!enemyKing) {
          continue;
        }
        const distance = chebyshev(pawn, enemyKing);
        if (distance > furthestDistance) {
          furthestDistance = distance;
          furthestPawn = pawn;
          furthestKing = enemyKing;
        }
      }

      if (!furthestPawn || !furthestKing) {
        if (labelRef.current) {
          labelRef.current.textContent = "no pawns on the board";
        }
        return;
      }

      for (const square of ruleOfTheSquareRegion(furthestPawn, furthestKing)) {
        board.addMarker(MARKER_SQUARE_REGION, square);
      }
      board.addMarker(MARKER_SQUARE_PAWN, furthestPawn.square);

      if (labelRef.current) {
        labelRef.current.textContent = `square of the pawn on ${furthestPawn.square} (king on ${furthestKing.square}, distance ${furthestDistance})`;
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
              drawRuleOfTheSquare();
              queueEnableInputForCurrentTurn();
            }
          }
          break;

        default:
          break;
      }

      return undefined;
    }

    drawRuleOfTheSquare();
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
        <div className="logo">rule of the square demo</div>
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

export default RuleOfTheSquareDemoPage;
