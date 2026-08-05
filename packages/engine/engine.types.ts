/* --------------------------------------------------------------------------
 * Engine Service (frontend WASM Stockfish queue + cache)
 * -------------------------------------------------------------------------- */

export type EnginePriority = 'high' | 'low';

export type Severity =
  | 'best'
  | 'good'
  | 'ok'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'
  | 'unscored'
  | 'correct'
  | 'incorrect';

export type UciMove = string;

export type EngineAnalysis = {
  fen: string;
  bestMove: UciMove;
  evaluationCp: number;
  principalVariation: UciMove[];
  pvAtIntermediateDepth: UciMove[];
  depth: number;
  completedAt: number;
};

export type EngineAnalyzeOptions = {
  intermediateDepth?: number,
  priority?: EnginePriority;
  depth?: number;
};

export type EngineSubscriptionListener = (analysis: EngineAnalysis) => void;