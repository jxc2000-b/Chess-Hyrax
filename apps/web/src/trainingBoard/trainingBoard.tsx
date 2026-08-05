import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from "react";
import { BORDER_TYPE, Chessboard, INPUT_EVENT_TYPE } from "cm-chessboard";
import { Arrows } from "cm-chessboard/src/extensions/arrows/Arrows.js";
import { MARKER_TYPE, Markers } from "cm-chessboard/src/extensions/markers/Markers.js";
import { RightClickAnnotator } from "cm-chessboard/src/extensions/right-click-annotator/RightClickAnnotator.js";
import { CornerBadges } from "../cornerBadges";
import { Chess } from "chess.js";
import type { SquareMarkerKind, TrainingBoardHandle } from "../types";
import {
  type BoardWithExtensions,
  type LegalMove,
  COACH_MARKERS,
  COACH_MARKER_TYPES,
  DIMMED_PIECE_REDRAW_SETTLE_MS,
  ENGINE_BEST_MOVE_ARROW,
  LOADING_BADGE_ROLE,
  PUZZLE_MARKER_CORRECT,
  PUZZLE_MARKER_WRONG,
  RESULT_BADGE_ROLE,
  applyDimPieceClasses,
  getSideToMove,
  moveToUci,
  pieceMatchesTurn,
  removeDimPieceClasses,
  LOADING_SPINNER_URL, 
  severityToBadgeUrl
} from "./trainingBoardHelpers";
import "cm-chessboard/assets/chessboard.css";
import "cm-chessboard/assets/extensions/arrows/arrows.css";
import "cm-chessboard/assets/extensions/markers/markers.css";

type TrainingBoardProps = {
  positionId?: string;
  fen: string;
  orientation?: string;
  disabled?: boolean;
  onMoveSubmit?: (uci: string, fenAfterMove: string) => void;
  // Called after an externally-driven fen change (e.g. the engine's feedback
  // move) finishes rendering. Fires once per feedback mutation, not on the
  // initial mount.
  onFeedback?: (fenAfterFeedback: string) => void;
};

const TrainingBoard = forwardRef<TrainingBoardHandle, TrainingBoardProps>(function TrainingBoard({ positionId, fen, orientation, disabled, onMoveSubmit, onFeedback }: TrainingBoardProps, ref) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const boardRef = useRef<Chessboard | null>(null);
  const chessRef = useRef<Chess>(new Chess(fen));
  const currentFenRef = useRef<string>(fen);
  const disabledRef = useRef<boolean | undefined>(disabled);
  const pendingMoveRef = useRef<LegalMove | null>(null);
  const submitRef = useRef<TrainingBoardProps["onMoveSubmit"]>(onMoveSubmit);
  const feedbackRef = useRef<TrainingBoardProps["onFeedback"]>(onFeedback);
  const hasMountedRef = useRef<boolean>(false);
  const inputHandlerRef = useRef<((event: any) => boolean | void | undefined) | null>(null);
  const dimmedPieceSquaresRef = useRef<string[]>([]);
  const dimmedPieceTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const dimmedPieceFramesRef = useRef<number[]>([]);

  submitRef.current = onMoveSubmit;
  feedbackRef.current = onFeedback;
  disabledRef.current = disabled;

  if (!inputHandlerRef.current) {
    inputHandlerRef.current = (event) => {
      const activeColor = getSideToMove(currentFenRef.current);

      switch (event.type) {
        case INPUT_EVENT_TYPE.moveInputStarted: {
          if (disabledRef.current || !pieceMatchesTurn(event.piece, activeColor)) {
            return false;
          }

          pendingMoveRef.current = null;
          event.chessboard.removeLegalMovesMarkers?.();

          const legalMoves = chessRef.current.moves({
            square: event.squareFrom,
            verbose: true,
          });

          event.chessboard.addLegalMovesMarkers?.(legalMoves);
          return legalMoves.length > 0;
        }

        case INPUT_EVENT_TYPE.validateMoveInput: {
          if (disabledRef.current) {
            pendingMoveRef.current = null;
            return false;
          }

          const promotion = event.promotion || "q";
          const legalMoves = chessRef.current.moves({
            square: event.squareFrom,
            verbose: true,
          });
          const matchedMove = legalMoves.find((move: LegalMove) => {
            if (move.to !== event.squareTo) {
              return false;
            }

            if (!move.promotion) {
              return true;
            }

            return move.promotion === promotion;
          });

          if (!matchedMove) {
            pendingMoveRef.current = null;
            return false;
          }

          pendingMoveRef.current = matchedMove;
          return true;
        }

        case INPUT_EVENT_TYPE.moveInputCanceled:
          pendingMoveRef.current = null;
          event.chessboard.removeLegalMovesMarkers?.();
          break;

        case INPUT_EVENT_TYPE.moveInputFinished:
          event.chessboard.removeLegalMovesMarkers?.();

          if (event.legalMove && !disabledRef.current && pendingMoveRef.current) {
            const playedMove = pendingMoveRef.current;
            const moveResult = chessRef.current.move({
              from: playedMove.from,
              to: playedMove.to,
              promotion: playedMove.promotion || undefined,
            });

            pendingMoveRef.current = null;

            if (moveResult) {
              currentFenRef.current = chessRef.current.fen();
              // cm-chessboard only relocates the piece the user dragged, so
              // moves that touch more than that square need a position sync:
              // castling (the rook), en passant (the captured pawn), and
              // promotion (the pawn becomes the promoted piece).
              if (
                moveResult.isKingsideCastle() ||
                moveResult.isQueensideCastle() ||
                moveResult.isEnPassant() ||
                moveResult.isPromotion()
              ) {
                void event.chessboard.setPosition?.(currentFenRef.current, false);
              }
              submitRef.current?.(moveToUci(playedMove), currentFenRef.current);
            }
          }
          break;

        case INPUT_EVENT_TYPE.movingOverSquare:
          break;

        default:
          break;
      }

      return undefined;
    };
  }

  useEffect(() => {
    if (!hostRef.current) {
      return undefined;
    }

    const board = new Chessboard(hostRef.current, {
      assetsUrl: "/cm-chessboard/",
      position: fen,
      orientation: orientation || getSideToMove(fen),
      style: {
        cssClass: "default",
        showCoordinates: true,
        borderType: BORDER_TYPE.frame,
        // Slow the default piece-animation a touch so the puzzle-mode
        // "previous move replay" is visible, not a blink.
        animationDuration: 300,
      },
      extensions: [
        {
          class: Markers,
          props: { autoMarkers: MARKER_TYPE.frame },
        },
        { class: Arrows },
        { class: RightClickAnnotator },
        { class: CornerBadges },
      ],
    });

    boardRef.current = board;

    return () => {
      clearScheduledDimPieceApply();
      board.disableMoveInput();
      board.destroy();
      boardRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    const board = boardRef.current;

    if (!board) {
      return;
    }

    currentFenRef.current = fen;
    chessRef.current = new Chess(fen);
    pendingMoveRef.current = null;

    board.removeLegalMovesMarkers?.();
    const positionPromise = board.setPosition(fen, false);

    void positionPromise?.then(() => {
      if (dimmedPieceSquaresRef.current.length > 0) {
        scheduleDimPieceApply();
      }
    });

    // Fire onFeedback only for mutations *after* the initial mount — the
    // first useLayoutEffect pass is the board hydrating, not engine feedback.
    if (hasMountedRef.current) {
      void positionPromise?.then(() => {
        feedbackRef.current?.(fen);
      });
    } else {
      hasMountedRef.current = true;
    }
  }, [fen]);

  function withExtensions(): BoardWithExtensions | null {
    return boardRef.current as unknown as BoardWithExtensions | null;
  }

  function clearScheduledDimPieceApply() {
    for (const timer of dimmedPieceTimersRef.current) {
      clearTimeout(timer);
    }
    for (const frame of dimmedPieceFramesRef.current) {
      cancelAnimationFrame(frame);
    }
    dimmedPieceTimersRef.current = [];
    dimmedPieceFramesRef.current = [];
  }

  function scheduleDimPieceApply() {
    clearScheduledDimPieceApply();
    if (dimmedPieceSquaresRef.current.length === 0) {
      removeDimPieceClasses(hostRef.current);
      return;
    }

    // cm-chessboard recreates SVG piece nodes during moves and resize redraws,
    // so apply after paint and once more after its default animation window.
    const applyAfterFrames = () => {
      const firstFrame = requestAnimationFrame(() => {
        const secondFrame = requestAnimationFrame(() =>
          applyDimPieceClasses(hostRef.current, dimmedPieceSquaresRef.current),
        );
        dimmedPieceFramesRef.current.push(secondFrame);
      });
      dimmedPieceFramesRef.current.push(firstFrame);
    };

    applyAfterFrames();
    dimmedPieceTimersRef.current.push(setTimeout(applyAfterFrames, DIMMED_PIECE_REDRAW_SETTLE_MS));
  }

  function clearCoachSquareMarkers() {
    const board = withExtensions();
    for (const markerType of COACH_MARKER_TYPES) {
      board?.removeMarkers?.(markerType);
    }
  }

  function clearDimPieces() {
    clearScheduledDimPieceApply();
    dimmedPieceSquaresRef.current = [];
    removeDimPieceClasses(hostRef.current);
  }

  function syncMoveInputWithCurrentFen() {
    const board = boardRef.current;

    if (!board) {
      return;
    }

    board.removeLegalMovesMarkers?.();
    board.disableMoveInput();

    if (disabledRef.current) {
      return;
    }

    if (inputHandlerRef.current) {
      board.enableMoveInput(inputHandlerRef.current, getSideToMove(currentFenRef.current));
    }
  }

  useImperativeHandle(
    ref,
    () => ({
      showLoadingBadge(square: string) {
        withExtensions()?.setCornerBadge?.(LOADING_BADGE_ROLE, LOADING_SPINNER_URL, square);
      },
      clearLoadingBadge() {
        withExtensions()?.removeCornerBadge?.(LOADING_BADGE_ROLE);
      },
      showAccuracyBadge(square: string, severity) {
        const board = withExtensions();
        board?.removeCornerBadge?.(LOADING_BADGE_ROLE);
        board?.setCornerBadge?.(RESULT_BADGE_ROLE, severityToBadgeUrl(severity), square);
      },
      drawBestMoveArrow(from: string, to: string) {
        const board = withExtensions();
        board?.removeArrows?.(ENGINE_BEST_MOVE_ARROW);
        board?.addArrow?.(ENGINE_BEST_MOVE_ARROW, from, to);
      },
      clearBestMoveArrow() {
        withExtensions()?.removeArrows?.(ENGINE_BEST_MOVE_ARROW);
      },
      clearAnnotations() {
        const board = withExtensions();
        board?.removeCornerBadges?.();
        board?.removeArrows?.();
        board?.removeMarkers?.(PUZZLE_MARKER_CORRECT);
        board?.removeMarkers?.(PUZZLE_MARKER_WRONG);
        clearCoachSquareMarkers();
        clearDimPieces();
      },
      setBoardPosition(nextFen: string, animated?: boolean) {
        const board = withExtensions();
        board?.setPosition?.(nextFen, animated === true);
        // Keep the local chess.js mirror in sync so legal-move generation
        // continues to reflect the board's true state during animations.
        try {
          chessRef.current = new Chess(nextFen);
          currentFenRef.current = nextFen;
        } catch {
          // Bad FEN — leave chess.js mirror alone; cm-chessboard will visually
          // reflect whatever was passed.
        }
      },
      movePieceAnimated(from: string, to: string) {
        const board = withExtensions();
        board?.movePiece?.(from, to, true);
        // Mirror the move in chess.js so subsequent input validation has the
        // correct post-move state. If the move is illegal in our mirror we
        // bail silently — the board still renders the visual move.
        try {
          const move = chessRef.current.move({ from, to });
          if (move) {
            currentFenRef.current = chessRef.current.fen();
            syncMoveInputWithCurrentFen();
          }
        } catch {
          /* ignore — animation is purely visual */
        }
      },
      addSquareMarker(square: string, kind: "correct" | "wrong") {
        const markerType = kind === "correct" ? PUZZLE_MARKER_CORRECT : PUZZLE_MARKER_WRONG;
        withExtensions()?.addMarker?.(markerType, square);
      },
      clearSquareMarkers() {
        const board = withExtensions();
        board?.removeMarkers?.(PUZZLE_MARKER_CORRECT);
        board?.removeMarkers?.(PUZZLE_MARKER_WRONG);
      },
      addCoachSquareMarker(square: string, kind: SquareMarkerKind) {
        withExtensions()?.addMarker?.(COACH_MARKERS[kind], square);
      },
      clearCoachSquareMarkers,
      dimPieces(squares: string[]) {
        dimmedPieceSquaresRef.current = Array.from(new Set(squares));
        scheduleDimPieceApply();
      },
      clearDimPieces,
    }),
    [],
  );

  // Position change wipes ephemeral annotations from the prior position.
  useEffect(() => {
    const board = withExtensions();
    board?.removeCornerBadges?.();
    board?.removeArrows?.();
    clearCoachSquareMarkers();
    clearDimPieces();
  }, [positionId]);

  useEffect(() => {
    syncMoveInputWithCurrentFen();
  }, [disabled, fen]);

  return <div ref={hostRef} className="training-board" />;
});

export default TrainingBoard;
