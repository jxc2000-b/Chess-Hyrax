// cm-chessboard feature demo. Mounts a standalone board with normal user
// move input and fades out "weak" pieces after each move: pieces scored by
// low mobility, sitting on their home square, and absence from Stockfish's
// principal variation.

import { useEffect, useRef } from "react";
import { BORDER_TYPE, Chessboard, COLOR, INPUT_EVENT_TYPE } from "cm-chessboard";
import { MARKER_TYPE, Markers } from "cm-chessboard/src/extensions/markers/Markers.js";
import { Chess, type Square } from "chess.js";
import { engineService } from "@hyrax/engine";
import "cm-chessboard/assets/chessboard.css";
import "cm-chessboard/assets/extensions/markers/markers.css";
import "../app.css";

const STARTING_FEN = "r1b1kb1r/ppnpqppp/2np4/3P4/2B5/2NPB3/PPP1NPPP/R2QK2R w KQkq - 0 1";
const PV_ABSENT_PENALTY = 2;
const HOME_SQUARE_PENALTY = 3;
const MIN_WEAKNESS_SCORE_TO_MARK = 4;
const MIN_FULLMOVE_NUMBER_TO_MARK_ROOKS = 16;
const PIECE_REDRAW_SETTLE_MS = 350;
const WEAK_PIECE_REFRESH_DEBOUNCE_MS = 500;

type LegalMove = {
  from: string;
  to: string;
  promotion?: string;
};

type CandidateColor = "w" | "b";
type CandidatePieceType = "n" | "b" | "r" | "q";

type WeakPieceCandidate = {
  square: Square;
  color: CandidateColor;
  type: CandidatePieceType;
};

type ScoredWeakPiece = WeakPieceCandidate & {
  legalMoveCount: number;
  pvAbsentPenalty: number;
  lowMobilityPenalty: number;
  homeSquarePenalty: number;
  weaknessScore: number;
};

type LooseChessboard = {
  addLegalMovesMarkers?: (moves: unknown[]) => void;
  removeLegalMovesMarkers?: () => void;
  enableMoveInput: (handler: (event: any) => boolean | void | undefined, color?: string) => void;
  disableMoveInput: () => void;
  destroy: () => void;
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["1", "2", "3", "4", "5", "6", "7", "8"];

const HOME_SQUARES: Record<CandidateColor, Record<CandidatePieceType, readonly string[]>> = {
  w: {
    n: ["b1", "g1"],
    b: ["c1", "f1"],
    r: ["a1", "h1"],
    q: ["d1"],
  },
  b: {
    n: ["b8", "g8"],
    b: ["c8", "f8"],
    r: ["a8", "h8"],
    q: ["d8"],
  },
};

function isCandidatePieceType(type: string): type is CandidatePieceType {
  return type === "n" || type === "b" || type === "r" || type === "q";
}

function getSideToMove(fen: string): string {
  return fen.split(" ")[1] === "b" ? COLOR.black : COLOR.white;
}

function pieceMatchesTurn(piece: string | undefined, color: string): boolean {
  if (!piece) {
    return false;
  }

  return (color === COLOR.white && piece.startsWith("w")) || (color === COLOR.black && piece.startsWith("b"));
}

function getCandidatePieces(chess: Chess): WeakPieceCandidate[] {
  const candidates: WeakPieceCandidate[] = [];

  for (const rank of RANKS) {
    for (const file of FILES) {
      const square = `${file}${rank}` as Square;
      const piece = chess.get(square);
      if (!piece || !isCandidatePieceType(piece.type)) {
        continue;
      }

      candidates.push({
        square,
        color: piece.color as CandidateColor,
        type: piece.type,
      });
    }
  }

  return candidates;
}

function getFenForSideToMove(fen: string, color: CandidateColor): string {
  const parts = fen.split(" ");
  parts[1] = color;
  return parts.join(" ");
}

function getFullmoveNumber(fen: string): number {
  return Number(fen.split(" ")[5] ?? 1);
}

function canMarkCandidatePiece(candidate: WeakPieceCandidate, fullmoveNumber: number): boolean {
  return candidate.type !== "r" || fullmoveNumber >= MIN_FULLMOVE_NUMBER_TO_MARK_ROOKS;
}

function getLowMobilityPenalty(legalMoveCount: number): number {
  if (legalMoveCount <= 0) {
    return 4;
  }
  if (legalMoveCount === 1) {
    return 3;
  }
  if (legalMoveCount === 2) {
    return 2;
  }
  if (legalMoveCount === 3) {
    return 1;
  }
  return 0;
}

function getHomeSquarePenalty(candidate: WeakPieceCandidate): number {
  return HOME_SQUARES[candidate.color][candidate.type].includes(candidate.square) ? HOME_SQUARE_PENALTY : 0;
}

function getPvAbsentPenalty(candidate: WeakPieceCandidate, pvParticipantSquares: Set<string>, principalVariation: string[]): number {
  if (principalVariation.length === 0) {
    return 0;
  }
  return pvParticipantSquares.has(candidate.square) ? 0 : PV_ABSENT_PENALTY;
}

function getCastlingRookMove(chess: Chess, from: Square, to: string): { from: string; to: string } | null {
  const piece = chess.get(from);
  if (!piece || piece.type !== "k") {
    return null;
  }

  if (from === "e1" && to === "g1") {
    return { from: "h1", to: "f1" };
  }
  if (from === "e1" && to === "c1") {
    return { from: "a1", to: "d1" };
  }
  if (from === "e8" && to === "g8") {
    return { from: "h8", to: "f8" };
  }
  if (from === "e8" && to === "c8") {
    return { from: "a8", to: "d8" };
  }

  return null;
}

function getPvParticipantSquares(fen: string, candidates: WeakPieceCandidate[], principalVariation: string[]): Set<string> {
  const replayChess = new Chess(fen);
  const currentSquareToRootSquare = new Map<string, string>();
  const participantSquares = new Set<string>();

  for (const candidate of candidates) {
    currentSquareToRootSquare.set(candidate.square, candidate.square);
  }

  for (const uciMove of principalVariation) {
    const from = uciMove.slice(0, 2);
    const to = uciMove.slice(2, 4);
    const promotion = uciMove.slice(4, 5) || undefined;
    if (!from || !to) {
      break;
    }

    const movedRootSquare = currentSquareToRootSquare.get(from);
    const capturedRootSquare = currentSquareToRootSquare.get(to);
    const castlingRookMove = getCastlingRookMove(replayChess, from as Square, to);
    const castlingRookRootSquare = castlingRookMove ? currentSquareToRootSquare.get(castlingRookMove.from) : undefined;

    if (movedRootSquare) {
      participantSquares.add(movedRootSquare);
    }
    if (castlingRookRootSquare) {
      participantSquares.add(castlingRookRootSquare);
    }

    const moveResult = replayChess.move({ from, to, promotion });
    if (!moveResult) {
      break;
    }

    if (capturedRootSquare) {
      currentSquareToRootSquare.delete(to);
    }
    if (movedRootSquare) {
      currentSquareToRootSquare.delete(from);
      currentSquareToRootSquare.set(to, movedRootSquare);
    }
    if (castlingRookMove && castlingRookRootSquare) {
      currentSquareToRootSquare.delete(castlingRookMove.from);
      currentSquareToRootSquare.set(castlingRookMove.to, castlingRookRootSquare);
    }
  }

  return participantSquares;
}

function scoreWeakPieces(fen: string, principalVariation: string[]): ScoredWeakPiece[] {
  const rootChess = new Chess(fen);
  const mobilityChessByColor: Record<CandidateColor, Chess> = {
    w: new Chess(getFenForSideToMove(fen, "w")),
    b: new Chess(getFenForSideToMove(fen, "b")),
  };
  const candidates = getCandidatePieces(rootChess);
  const pvParticipantSquares = getPvParticipantSquares(fen, candidates, principalVariation);
  const fullmoveNumber = getFullmoveNumber(fen);

  return candidates
    .filter((candidate) => canMarkCandidatePiece(candidate, fullmoveNumber))
    .map((candidate) => {
      const legalMoveCount = mobilityChessByColor[candidate.color].moves({
        square: candidate.square,
        verbose: true,
      }).length;
      const pvAbsentPenalty = getPvAbsentPenalty(candidate, pvParticipantSquares, principalVariation);
      const lowMobilityPenalty = getLowMobilityPenalty(legalMoveCount);
      const homeSquarePenalty = getHomeSquarePenalty(candidate);
      const weaknessScore = pvAbsentPenalty + lowMobilityPenalty + homeSquarePenalty;

      return {
        ...candidate,
        legalMoveCount,
        pvAbsentPenalty,
        lowMobilityPenalty,
        homeSquarePenalty,
        weaknessScore,
      };
    })
    .filter((piece) => piece.weaknessScore >= MIN_WEAKNESS_SCORE_TO_MARK)
    .sort((a, b) => b.weaknessScore - a.weaknessScore || a.square.localeCompare(b.square));
}

function logWeakPieceMarkers(weakPieces: ScoredWeakPiece[]): void {
  console.table(
    weakPieces.map((piece) => ({
      square: piece.square,
      piece: `${piece.color}${piece.type}`,
      weaknessScore: piece.weaknessScore,
      pvAbsentPenalty: piece.pvAbsentPenalty,
      lowMobilityPenalty: piece.lowMobilityPenalty,
      homeSquarePenalty: piece.homeSquarePenalty,
      legalMoveCount: piece.legalMoveCount,
    })),
  );
}

function clearWeakPieceTransparency(host: HTMLElement) {
  host.querySelectorAll(".weak-piece-demo-piece-weak").forEach((piece) => {
    piece.classList.remove("weak-piece-demo-piece-weak");
  });
}

function applyWeakPieceTransparency(host: HTMLElement, weakPieces: ScoredWeakPiece[]) {
  clearWeakPieceTransparency(host);

  for (const piece of weakPieces) {
    const pieceElement = host.querySelector(`.pieces g[data-square="${piece.square}"]`);
    pieceElement?.classList.add("weak-piece-demo-piece-weak");
  }
}

function WeakPieceDemoPage() {
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
    let isDisposed = false;
    let pendingMove: LegalMove | null = null;
    let enableInputTimer: ReturnType<typeof setTimeout> | null = null;
    let weakPieceApplyTimers: ReturnType<typeof setTimeout>[] = [];
    let weakPieceApplyFrames: number[] = [];
    let weakPieceRefreshTimer: ReturnType<typeof setTimeout> | null = null;

    function clearScheduledWeakPieceApply() {
      for (const timer of weakPieceApplyTimers) {
        clearTimeout(timer);
      }
      for (const frame of weakPieceApplyFrames) {
        cancelAnimationFrame(frame);
      }
      weakPieceApplyTimers = [];
      weakPieceApplyFrames = [];
    }

    function scheduleWeakPieceTransparency(weakPieces: ScoredWeakPiece[], requestId: number) {
      clearScheduledWeakPieceApply();

      function applyIfCurrent() {
        if (isDisposed || requestId !== analysisRequestId || !hostRef.current) {
          return;
        }
        applyWeakPieceTransparency(hostRef.current, weakPieces);
      }

      function applyAfterRedraw() {
        const firstFrame = requestAnimationFrame(() => {
          const secondFrame = requestAnimationFrame(applyIfCurrent);
          weakPieceApplyFrames.push(secondFrame);
        });
        weakPieceApplyFrames.push(firstFrame);
      }

      applyAfterRedraw();
      weakPieceApplyTimers.push(setTimeout(applyAfterRedraw, PIECE_REDRAW_SETTLE_MS));
    }

    function clearScheduledWeakPieceRefresh() {
      if (weakPieceRefreshTimer !== null) {
        clearTimeout(weakPieceRefreshTimer);
        weakPieceRefreshTimer = null;
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

    async function highlightWeakPieces(fen: string, requestId: number) {
      try {
        const analysis = await engineService.analyze(fen, { priority: "high" });
        if (isDisposed || requestId !== analysisRequestId) {
          return;
        }

        const weakPieces = scoreWeakPieces(fen, analysis.principalVariation);
        logWeakPieceMarkers(weakPieces);
        scheduleWeakPieceTransparency(weakPieces, requestId);
        if (labelRef.current) {
          labelRef.current.textContent =
            weakPieces.length > 0
              ? `weak pieces: ${weakPieces.map((piece) => `${piece.square} (${piece.weaknessScore})`).join(", ")}`
              : "no weak pieces";
        }
      } catch (error) {
        console.error("Could not determine weak pieces:", error);
      }
    }

    function requestWeakPieceHighlight(fen: string) {
      const requestId = ++analysisRequestId;
      clearScheduledWeakPieceApply();
      clearScheduledWeakPieceRefresh();
      weakPieceRefreshTimer = setTimeout(() => {
        weakPieceRefreshTimer = null;
        if (hostRef.current) {
          clearWeakPieceTransparency(hostRef.current);
        }
        void highlightWeakPieces(fen, requestId);
      }, WEAK_PIECE_REFRESH_DEBOUNCE_MS);
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
            requestWeakPieceHighlight(chess.fen());
            queueEnableInput();
          }
          break;

        default:
          break;
      }

      return undefined;
    }

    enableInput();
    requestWeakPieceHighlight(chess.fen());

    return () => {
      isDisposed = true;
      analysisRequestId += 1;
      clearScheduledWeakPieceApply();
      clearScheduledWeakPieceRefresh();
      if (enableInputTimer !== null) {
        clearTimeout(enableInputTimer);
      }
      board.disableMoveInput();
      if (hostRef.current) {
        clearWeakPieceTransparency(hostRef.current);
      }
      board.destroy();
    };
  }, []);

  return (
    <main className="main-page">
      <header className="page-headers">
        <div className="logo">weak piece demo</div>
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

export default WeakPieceDemoPage;
