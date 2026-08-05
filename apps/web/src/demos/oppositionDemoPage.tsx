// cm-chessboard feature demo. Mounts a standalone board with normal user
// move input and visualizes the opposition in king-and-pawn endgames: when
// the kings stand in direct or distant opposition the squares between them
// are shaded and the king holding the opposition is highlighted. The key
// squares of the pawn are marked as well.

import { useEffect, useRef } from "react";
import { BORDER_TYPE, Chessboard, COLOR, INPUT_EVENT_TYPE } from "cm-chessboard";
import { MARKER_TYPE, Markers } from "cm-chessboard/src/extensions/markers/Markers.js";
import { Chess, type Color, type Square } from "chess.js";
import "cm-chessboard/assets/chessboard.css";
import "cm-chessboard/assets/extensions/markers/markers.css";
import "../app.css";

const STARTING_FEN = "8/8/4k3/8/4K3/8/4P3/8 w - - 0 1";
const MARKER_SQUARE_LINE = { class: "demo-marker-square-green", slice: "markerSquare" };
const MARKER_SQUARE_HOLDER = { class: "demo-marker-square-red", slice: "markerSquare" };
const MARKER_SQUARE_KEY = { class: "demo-marker-square-important", slice: "markerSquare" };

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

type BoardSpot = {
  square: Square;
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

function toSquare(file: number, rank: number): Square {
  return `${FILES[file]}${rank + 1}` as Square;
}

function findPiece(chess: Chess, type: string, color: Color): BoardSpot | null {
  const rows = chess.board();
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    for (let fileIndex = 0; fileIndex < rows[rowIndex].length; fileIndex += 1) {
      const piece = rows[rowIndex][fileIndex];
      if (piece && piece.type === type && piece.color === color) {
        return { square: piece.square, file: fileIndex, rank: 7 - rowIndex };
      }
    }
  }
  return null;
}

type Opposition = {
  kind: "direct" | "distant";
  axis: "file" | "rank" | "diagonal";
  between: Square[];
};

// Kings are in opposition when they stand on the same file, rank, or
// diagonal with an odd number of squares between them (an even Chebyshev
// distance). Distance 2 is direct opposition; 4 or 6 is distant.
function detectOpposition(whiteKing: BoardSpot, blackKing: BoardSpot): Opposition | null {
  const dx = blackKing.file - whiteKing.file;
  const dy = blackKing.rank - whiteKing.rank;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);

  let axis: Opposition["axis"];
  let distance: number;

  if (dx === 0 && ady >= 2) {
    axis = "file";
    distance = ady;
  } else if (dy === 0 && adx >= 2) {
    axis = "rank";
    distance = adx;
  } else if (adx === ady && adx >= 2) {
    axis = "diagonal";
    distance = adx;
  } else {
    return null;
  }

  if (distance % 2 !== 0) {
    return null;
  }

  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  const between: Square[] = [];
  for (let i = 1; i < distance; i += 1) {
    between.push(toSquare(whiteKing.file + stepX * i, whiteKing.rank + stepY * i));
  }

  return { kind: distance === 2 ? "direct" : "distant", axis, between };
}

// Key squares of a lone pawn (simplified, ignoring the rook-pawn special
// case): three squares two ranks ahead while the pawn is on its own half,
// six squares on the two ranks ahead once it has crossed the middle.
function pawnKeySquares(pawn: BoardSpot, color: Color): Square[] {
  const forward = color === "w" ? 1 : -1;
  const onOwnHalf = color === "w" ? pawn.rank <= 3 : pawn.rank >= 4;
  const rankOffsets = onOwnHalf ? [2] : [1, 2];

  const squares: Square[] = [];
  for (const rankOffset of rankOffsets) {
    const rank = pawn.rank + forward * rankOffset;
    if (rank < 0 || rank > 7) {
      continue;
    }
    for (let file = pawn.file - 1; file <= pawn.file + 1; file += 1) {
      if (file >= 0 && file <= 7) {
        squares.push(toSquare(file, rank));
      }
    }
  }
  return squares;
}

function OppositionDemoPage() {
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

    function drawOpposition() {
      board.removeMarkers(MARKER_SQUARE_LINE);
      board.removeMarkers(MARKER_SQUARE_HOLDER);
      board.removeMarkers(MARKER_SQUARE_KEY);

      const whiteKing = findPiece(chess, "k", "w");
      const blackKing = findPiece(chess, "k", "b");
      if (!whiteKing || !blackKing) {
        return;
      }

      const parts: string[] = [];

      const pawnColor: Color = findPiece(chess, "p", "w") ? "w" : "b";
      const pawn = findPiece(chess, "p", pawnColor);
      if (pawn) {
        for (const square of pawnKeySquares(pawn, pawnColor)) {
          board.addMarker(MARKER_SQUARE_KEY, square);
        }
        parts.push(`key squares of the ${pawn.square} pawn in blue`);
      }

      const opposition = detectOpposition(whiteKing, blackKing);
      if (opposition) {
        for (const square of opposition.between) {
          board.addMarker(MARKER_SQUARE_LINE, square);
        }
        // The side NOT to move holds the opposition.
        const holderIsWhite = getSideToMove(chess.fen()) === COLOR.black;
        board.addMarker(MARKER_SQUARE_HOLDER, holderIsWhite ? whiteKing.square : blackKing.square);
        parts.unshift(
          `${opposition.kind} opposition on the ${opposition.axis} — ${holderIsWhite ? "white" : "black"} has it`,
        );
      } else {
        parts.unshift("kings are not in opposition");
      }

      if (labelRef.current) {
        labelRef.current.textContent = parts.join(" · ");
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
              drawOpposition();
              queueEnableInputForCurrentTurn();
            }
          }
          break;

        default:
          break;
      }

      return undefined;
    }

    drawOpposition();
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
        <div className="logo">opposition demo</div>
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

export default OppositionDemoPage;
