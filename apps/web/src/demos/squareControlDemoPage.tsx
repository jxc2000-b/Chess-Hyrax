// cm-chessboard feature demo. Mounts a standalone board with normal user
// move input and shades every square by which side controls it (net attacker
// count via chess.attackers), recomputed after every move.

import { useEffect, useRef } from "react";
import { BORDER_TYPE, Chessboard, COLOR, INPUT_EVENT_TYPE } from "cm-chessboard";
import { MARKER_TYPE, Markers } from "cm-chessboard/src/extensions/markers/Markers.js";
import { Chess, type Square } from "chess.js";
import "cm-chessboard/assets/chessboard.css";
import "cm-chessboard/assets/extensions/markers/markers.css";
import "../app.css";

const STARTING_FEN = "r1bq1rk1/ppp1bpp1/2np1n1p/4p3/P1B1P3/3P1NB1/1PP2PPP/RN1QK2R w KQ - 1 9";

type LegalMove = {
  from: string;
  to: string;
  promotion?: string;
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

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["1", "2", "3", "4", "5", "6", "7", "8"];
const CONTROL_MARKER_MIN_ABS_SCORE = 1;
const CONTROL_MARKER_MAX_INTENSITY = 3;
const CONTROL_MARKER_TYPES = {
  white1: { class: "control-marker-square-white-1", slice: "markerSquare" },
  white2: { class: "control-marker-square-white-2", slice: "markerSquare" },
  white3: { class: "control-marker-square-white-3", slice: "markerSquare" },
  black1: { class: "control-marker-square-black-1", slice: "markerSquare" },
  black2: { class: "control-marker-square-black-2", slice: "markerSquare" },
  black3: { class: "control-marker-square-black-3", slice: "markerSquare" },
};
const ALL_CONTROL_MARKER_TYPES = Object.values(CONTROL_MARKER_TYPES);

type ControlSide = "white" | "black";

type SquareControl = {
  side: ControlSide;
  intensity: 1 | 2 | 3;
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

function getAllSquares(): Square[] {
  const squares: Square[] = [];
  for (const rank of RANKS) {
    for (const file of FILES) {
      squares.push(`${file}${rank}` as Square);
    }
  }
  return squares;
}

function getSquareControl(chess: Chess, square: Square): SquareControl | null {
  const whiteAttackers = chess.attackers(square, "w").length;
  const blackAttackers = chess.attackers(square, "b").length;
  const netControl = whiteAttackers - blackAttackers;

  if (netControl === 0) {
    return null;
  }

  if (Math.abs(netControl) < CONTROL_MARKER_MIN_ABS_SCORE) {
    return null;
  }

  return {
    side: netControl > 0 ? "white" : "black",
    intensity: Math.min(Math.abs(netControl), CONTROL_MARKER_MAX_INTENSITY) as 1 | 2 | 3,
  };
}

function getControlMarkerType(control: SquareControl): unknown {
  if (control.side === "white") {
    return control.intensity === 1 ? CONTROL_MARKER_TYPES.white1 : control.intensity === 2 ? CONTROL_MARKER_TYPES.white2 : CONTROL_MARKER_TYPES.white3;
  }

  return control.intensity === 1 ? CONTROL_MARKER_TYPES.black1 : control.intensity === 2 ? CONTROL_MARKER_TYPES.black2 : CONTROL_MARKER_TYPES.black3;
}

function SquareControlDemoPage() {
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
    let enableInputTimer: ReturnType<typeof setTimeout> | null = null;
    const allSquares = getAllSquares();

    function clearControlMarkers() {
      for (const markerType of ALL_CONTROL_MARKER_TYPES) {
        board.removeMarkers(markerType);
      }
    }

    function updateControlMarkers() {
      clearControlMarkers();

      let whiteSquares = 0;
      let blackSquares = 0;

      for (const square of allSquares) {
        const control = getSquareControl(chess, square);
        if (!control) {
          continue;
        }

        if (control.side === "white") {
          whiteSquares += 1;
        } else {
          blackSquares += 1;
        }
        board.addMarker(getControlMarkerType(control), square);
      }

      if (labelRef.current) {
        labelRef.current.textContent = `squares controlled — white: ${whiteSquares}, black: ${blackSquares}`;
      }
    }

    function enableInput() {
      board.disableMoveInput();
      board.enableMoveInput(handleMoveInput);
    }

    function queueEnableInput() {
      if (enableInputTimer !== null) {
        clearTimeout(enableInputTimer);
      }
      enableInputTimer = setTimeout(() => {
        enableInputTimer = null;
        enableInput();
      }, 0);
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
            chess.move({
              from: playedMove.from,
              to: playedMove.to,
              promotion: playedMove.promotion || undefined,
            });
            updateControlMarkers();
            queueEnableInput();
          }
          break;

        default:
          break;
      }

      return undefined;
    }

    updateControlMarkers();
    enableInput();

    return () => {
      if (enableInputTimer !== null) {
        clearTimeout(enableInputTimer);
      }
      board.disableMoveInput();
      board.destroy();
    };
  }, []);

  return (
    <main className="main-page">
      <header className="page-headers">
        <div className="logo">square control demo</div>
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

export default SquareControlDemoPage;
