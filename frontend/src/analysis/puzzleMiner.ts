import { engineService } from "../Stockfish/engineService";
import type { ChessSide, EngineAnalysis, ShrunkTrainingPosition, PuzzleTags } from "../types";
import { type ParsedGame, getGameUserColor, puzzleTagger, shufflePositions } from "./puzzleMinerHelpers";


export const PUZZLE_MINING_EVAL_LOSS_THRESHOLD_CP = 200;
export const PUZZLE_MINING_MAX_POSITIONS_PER_GAME = 4;
export const USER_DEAD_LOST_THRESHOLD_CP = -200;
const HARD_ANALYSIS_DEPTH = 22;
const HARD_INTERMEDIATE_DEPTH = 10;

export type PuzzleMiningOptions = {
  evalLossThresholdCp?: number;
  userDeadLostThresholdCp?: number;
  filters?: PuzzleTags[];
  intermediateDepth?: number;
  // Called after each game is fully analyzed, with the running count and the
  // total number of games this run. Lets the UI render a mining progress bar.
  onProgress?: (analyzedGames: number, totalGames: number) => void;
};

export type PuzzleMinedListener = (position: ShrunkTrainingPosition) => void;

function getSideToMoveColor(fen: string): ChessSide | null {
  const sideToMove = fen.trim().split(/\s+/)[1];
  if (sideToMove === "w") return "white";
  if (sideToMove === "b") return "black";
  return null;
}

function getEvalForUser(
  analysis: EngineAnalysis,
  userColor: ChessSide,
  fen: string,
): number {
  const sideToMoveColor = getSideToMoveColor(fen);
  if (!sideToMoveColor) {
    return analysis.evaluationCp;
  }

  return sideToMoveColor === userColor
    ? analysis.evaluationCp
    : -analysis.evaluationCp;
}

function getPositionDedupeKey(fen: string): string {
  const fenParts = fen.trim().split(/\s+/);
  return fenParts.length >= 4 ? fenParts.slice(0, 4).join(" ") : fen.trim();
}

export async function minePuzzlePositions(
  games: ParsedGame[] | null | undefined,
  onPuzzleMined?: PuzzleMinedListener,
  options: PuzzleMiningOptions = {},
): Promise<ShrunkTrainingPosition[]> {
  if (!games || games.length === 0) {
    return [];
  }

  const evalLossThresholdCp =
    options.evalLossThresholdCp ?? PUZZLE_MINING_EVAL_LOSS_THRESHOLD_CP;
  const userDeadLostThresholdCp =
    options.userDeadLostThresholdCp ?? USER_DEAD_LOST_THRESHOLD_CP;
  const filters = options.filters ?? [];
  const includesHard = filters.includes("hard");
  const engineAnalyzeOptions = includesHard
    ? { priority: "low" as const, depth: HARD_ANALYSIS_DEPTH, intermediateDepth: HARD_INTERMEDIATE_DEPTH }
    : { priority: "low" as const };

  const minedPositions: ShrunkTrainingPosition[] = [];
  const minedPositionKeys = new Set<string>();
  const totalGames = games.length;

  for (let gameIndex = 0; gameIndex < totalGames; gameIndex += 1) {
    const game = games[gameIndex];
    // Report games completed so far (analysis of `game` runs below).
    options.onProgress?.(gameIndex, totalGames);

    if (game.moves.length < 2) {
      continue;
    }

    const userColorForGame = getGameUserColor(game);
    if (!userColorForGame) {
      continue;
    }

    let beforeAnalysis: EngineAnalysis;
    const gameCandidates: ShrunkTrainingPosition[] = [];
    try {
      beforeAnalysis = await engineService.analyze(game.moves[0].fen, engineAnalyzeOptions);
    } catch (error) {
      console.error("Puzzle miner failed to analyze game start:", error);
      continue;
    }

    for (let moveIndex = 1; moveIndex < game.moves.length; moveIndex += 1) {
      const postMistakeMove = game.moves[moveIndex];
      const mistakeMove = game.moves[moveIndex - 1];
      let afterAnalysis: EngineAnalysis;

      try {
        afterAnalysis = await engineService.analyze(postMistakeMove.fen, engineAnalyzeOptions);
      } catch (error) {
        console.error("Puzzle miner failed to analyze game position:", error);
        break;
      }

      // Stockfish scores are side-to-move relative. Adjacent FENs flip side
      // to move, so adding before+after gives the loss for the player who
      // made `mistakeMove`.
      const evalLossCp = Math.max(
        0,
        beforeAnalysis.evaluationCp + afterAnalysis.evaluationCp,
      );

      if (evalLossCp > evalLossThresholdCp) {
        const userMadeMistake = mistakeMove.color === userColorForGame;
        const candidate = userMadeMistake ? mistakeMove : postMistakeMove;
        const candidateAnalysis = userMadeMistake ? beforeAnalysis : afterAnalysis;
        const mistakeTag: PuzzleTags = userMadeMistake ? "user-mistake" : "user-opponent-mistake";
        const userEvalCp = getEvalForUser(
          candidateAnalysis,
          userColorForGame,
          candidate.fen,
        );

        if (userEvalCp > userDeadLostThresholdCp) {
          gameCandidates.push({
            ...candidate,
            bestMove: candidateAnalysis.bestMove,
            bestMoveAtIntermediateAnalysis: candidateAnalysis.pvAtIntermediateDepth[0],
            pv: candidateAnalysis.principalVariation,
            puzzleTag: [...(candidate.puzzleTag ?? []), mistakeTag],
          });
        }
      }

      beforeAnalysis = afterAnalysis;
    }

    const selectedCandidates = shufflePositions(gameCandidates).slice(
      0,
      PUZZLE_MINING_MAX_POSITIONS_PER_GAME,
    );

    for (const candidate of selectedCandidates) {
      const taggedCandidate = puzzleTagger(candidate);
      if (
        filters.length > 0 &&
        !taggedCandidate.puzzleTag?.some((tag) => filters.includes(tag))
      ) {
        console.log("[puzzle-miner] position discarded due to filter", {
          id: taggedCandidate.id,
          fen: taggedCandidate.fen,
          puzzleTag: taggedCandidate.puzzleTag,
          filters,
        });
        continue;
      }
      const positionKey = getPositionDedupeKey(taggedCandidate.fen);
      if (minedPositionKeys.has(positionKey)) {
        console.log("[puzzle-miner] position discarded due to duplicate", {
          id: taggedCandidate.id,
          fen: taggedCandidate.fen,
          puzzleTag: taggedCandidate.puzzleTag,
        });
        continue;
      }
      minedPositionKeys.add(positionKey);
      console.log("[puzzle-miner] mined position", {
        id: taggedCandidate.id,
        fen: taggedCandidate.fen,
        puzzleTag: taggedCandidate.puzzleTag,
        bestMove: taggedCandidate.bestMove,
        bestMoveAtIntermediateAnalysis: taggedCandidate.bestMoveAtIntermediateAnalysis
      });
      minedPositions.push(taggedCandidate);
      onPuzzleMined?.(taggedCandidate);
    }
  }
  options.onProgress?.(totalGames, totalGames);
  return minedPositions;
}
