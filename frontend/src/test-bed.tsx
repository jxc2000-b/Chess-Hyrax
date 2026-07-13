import { useEffect, useRef } from "react";
import { BORDER_TYPE, Chessboard, COLOR, INPUT_EVENT_TYPE } from "cm-chessboard";
import { MARKER_TYPE, Markers } from "cm-chessboard/src/extensions/markers/Markers.js";
import { Chess } from "chess.js";
import "cm-chessboard/assets/chessboard.css";
import "cm-chessboard/assets/extensions/markers/markers.css";
import "./app.css";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

type LegalMove = {
  from: string;
  to: string;
  promotion?: string;
};

type LooseChessboard = {
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

function TestSessionPage() {
  const hostRef = useRef<HTMLDivElement | null>(null);

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
            queueEnableInput();
          }
          break;

        default:
          break;
      }

      return undefined;
    }

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
      <section style={{ flex: "1 1 auto", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div ref={hostRef} style={{ width: "min(80svh, 80vw)", aspectRatio: "1" }} />
      </section>
    </main>
  );
}

export default TestSessionPage;
