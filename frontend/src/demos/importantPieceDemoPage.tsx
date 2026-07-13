// cm-chessboard feature demo. Mounts a standalone board with normal user
// move input and highlights Stockfish's best reply after each played move.

import { useEffect, useRef } from "react";
import { BORDER_TYPE, Chessboard, COLOR, INPUT_EVENT_TYPE } from "cm-chessboard";
import { MARKER_TYPE, Markers } from "cm-chessboard/src/extensions/markers/Markers.js";
import { Chess } from "chess.js";
import { engineService } from "../Stockfish/engineService";
import "cm-chessboard/assets/chessboard.css";
import "cm-chessboard/assets/extensions/markers/markers.css";
import "../app.css";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const MARKER_SQUARE_IMPORTANT = { class: "demo-marker-square-important", slice: "markerSquare" };

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

function ImportantPieceDemoPage() {
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
    let analysisRequestId = 0;
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

    function highlightMostImportantPiece(uci: string) {
      const from = uci.slice(0, 2);
      if (!from) {
        return;
      }
      board.addMarker(MARKER_SQUARE_IMPORTANT, from);
    }

    async function highlightOpponentBestMove(fenAfterMove: string, requestId: number) {
      try {
        const analysis = await engineService.analyze(fenAfterMove, { priority: "high" });
        if (requestId !== analysisRequestId || !analysis.bestMove) {
          return;
        }
        board.removeMarkers(MARKER_SQUARE_IMPORTANT);
        highlightMostImportantPiece(analysis.bestMove);
        if (labelRef.current) {
          labelRef.current.textContent = `most important piece: ${analysis.bestMove.slice(0, 2)} (${analysis.bestMove})`;
        }
      } catch (error) {
        console.error("Could not determine opponent best move:", error);
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
            board.removeMarkers(MARKER_SQUARE_IMPORTANT);
            const moveResult = chess.move({
              from: playedMove.from,
              to: playedMove.to,
              promotion: playedMove.promotion || undefined,
            });
            if (moveResult) {
              const requestId = ++analysisRequestId;
              if (labelRef.current) {
                labelRef.current.textContent = `played: ${moveResult.san}`;
              }
              void highlightOpponentBestMove(chess.fen(), requestId);
              queueEnableInputForCurrentTurn();
            }
          }
          break;

        default:
          break;
      }

      return undefined;
    }

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
        <div className="logo">important piece demo</div>
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

export default ImportantPieceDemoPage;
