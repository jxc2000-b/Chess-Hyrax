// Composer / top layer of the frontend Stockfish stack. Owns a
// StockfishWorker and exposes the friendly surface that components
// (e.g. SessionPage) call directly. No UCI awareness here — purely
// request-shaped in, result out.

import {
  StockfishWorker,
  type WasmEngineOptions,
  type AnalysisRequest,
  type AnalysisResult,
  type AnalysisLine,
} from './stockfishWorker';

type StockfishEngineOptions = {
  engineOptions?: WasmEngineOptions;
  defaultTimeoutMs?: number;
};

export class StockfishEngine {
  private readonly worker: StockfishWorker;

  constructor(options: StockfishEngineOptions = {}) {
    this.worker = new StockfishWorker({
      engineOptions: options.engineOptions,
      defaultTimeoutMs: options.defaultTimeoutMs,
    });
  }

  async init(): Promise<void> {
    await this.worker.init();
  }

  async analyze(request: AnalysisRequest): Promise<AnalysisResult> {
    return this.worker.enqueue(request);
  }

  shutdown(): void {
    this.worker.shutdown();
  }
}

// Module-level singleton so the session page can `import { analyze }` without
// threading an engine instance through props.
let sharedEngine: StockfishEngine | null = null;

function getSharedEngine(): StockfishEngine {
  if (!sharedEngine) {
    sharedEngine = new StockfishEngine();
  }

  return sharedEngine;
}

export async function init(): Promise<void> {
  const engine = getSharedEngine();

  try {
    await engine.init();
  } catch (error) {
    // Drop the bricked singleton so the next caller gets a fresh engine.
    if (sharedEngine === engine) {
      sharedEngine = null;
    }
    throw error;
  }
}

export async function analyze(request: AnalysisRequest): Promise<AnalysisResult> {
  return getSharedEngine().analyze(request);
}

export function shutdown(): void {
  sharedEngine?.shutdown();
  sharedEngine = null;
}

export type { AnalysisRequest, AnalysisResult, AnalysisLine, WasmEngineOptions };
