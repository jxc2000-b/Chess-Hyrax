// Queue / orchestration layer on top of the low-level WasmWrapper.
// Keeps worker/IO concerns (in WasmWrapper) separate from scheduling.

import {
  WasmWrapper,
  createWasmEngine,
  parseUciInfoLine,
  extractBestMove,
  type WasmEngineOptions,
  type AnalysisRequest,
  type AnalysisResult,
  type AnalysisLine,
} from './WasmWrapper';

type JobPhase = 'queued' | 'waiting-ready' | 'searching' | 'done' | 'failed';

type StockfishJob = {
  id: number;
  request: AnalysisRequest;
  phase: JobPhase;
  startedAt: number | null;
  timeoutMs: number;
  timeoutHandle: ReturnType<typeof setTimeout> | null;
  linesByRank: Map<number, AnalysisLine>;
  pvAtIntermediateDepth: string[];
  resolve: (result: AnalysisResult) => void;
  reject: (error: Error) => void;
};

type StockfishWorkerOptions = {
  engineOptions?: WasmEngineOptions;
  defaultTimeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_DEPTH = 15;
const DEFAULT_MULTIPV = 1;

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.floor(value));
}

export class StockfishWorker {
  private readonly engine: WasmWrapper;
  private readonly defaultTimeoutMs: number;
  private readonly unsubscribeFromEngine: () => void;
  private jobQueue: StockfishJob[] = [];
  private activeJob: StockfishJob | null = null;
  private nextJobId = 1;

  constructor(options: StockfishWorkerOptions = {}) {
    this.engine = createWasmEngine(options.engineOptions);
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.unsubscribeFromEngine = this.engine.onLine((line) => {
      this.handleEngineLine(line);
    });
  }

  async init(): Promise<void> {
    await this.engine.init();
    // Drain anything that was enqueued while the engine was still starting.
    this.startNextJob();
  }

  async enqueue(request: AnalysisRequest): Promise<AnalysisResult> {
    return new Promise<AnalysisResult>((resolve, reject) => {
      const job: StockfishJob = {
        id: this.nextJobId++,
        request,
        phase: 'queued',
        startedAt: null,
        timeoutMs: this.defaultTimeoutMs,
        timeoutHandle: null,
        linesByRank: new Map(),
        pvAtIntermediateDepth: [],
        resolve,
        reject,
      };

      this.jobQueue.push(job);
      this.startNextJob();
    });
  }

  shutdown(): void {
    const shutdownError = new Error('Stockfish worker shut down.');

    if (this.activeJob) {
      this.failActiveJob(shutdownError);
    }

    while (this.jobQueue.length > 0) {
      const job = this.jobQueue.shift()!;
      job.reject(shutdownError);
    }

    this.unsubscribeFromEngine();
    this.engine.destroy();
  }

  private startNextJob(): void {
    if (!this.engine.isReady() || this.activeJob || this.jobQueue.length === 0) {
      return;
    }

    const job = this.jobQueue.shift()!;
    this.activeJob = job;
    job.phase = 'waiting-ready';
    job.startedAt = Date.now();
    job.timeoutHandle = setTimeout(() => {
      this.handleJobTimeout(job.id);
    }, job.timeoutMs);

    // Apply per-job options, then synchronize with `isready`/`readyok` before
    // sending `position`/`go`. Matches the backend's handshake.
    const multiPv = normalizePositiveInteger(job.request.multiPv, DEFAULT_MULTIPV);
    this.engine.send(`setoption name MultiPV value ${multiPv}`);
    this.engine.send('isready');
  }

  private startSearch(job: StockfishJob): void {
    job.phase = 'searching';
    const depth = normalizePositiveInteger(job.request.depth, DEFAULT_DEPTH);
    this.engine.send(`position fen ${job.request.fen}`);
    this.engine.send(`go depth ${depth}`);
  }

  private handleEngineLine(line: string): void {
    const job = this.activeJob;
    if (!job) {
      return;
    }

    if (line === 'readyok' && job.phase === 'waiting-ready') {
      this.startSearch(job);
      return;
    }

    if (line.startsWith('info ') && job.phase === 'searching') {
      const parsed = parseUciInfoLine(line);
      if (parsed) {
        job.linesByRank.set(parsed.rank, parsed);
        const intermediateDepth = normalizePositiveInteger(job.request.intermediateDepth, 0);
        if (intermediateDepth > 0 && parsed.rank === 1 && parsed.depth === intermediateDepth) {
          job.pvAtIntermediateDepth = parsed.principalVariation;
        }
      }
      return;
    }

    if (line.startsWith('bestmove ') && job.phase === 'searching') {
      this.completeActiveJob(line);
    }
  }

  private completeActiveJob(bestmoveLine: string): void {
    const job = this.activeJob;
    if (!job) {
      return;
    }

    this.clearJobTimeout(job);
    this.activeJob = null;
    job.phase = 'done';

    const lines = [...job.linesByRank.values()].sort((a, b) => a.rank - b.rank);
    const primary = lines.find((entry) => entry.rank === 1) ?? lines[0];
    const bestMove = primary?.bestMove ?? extractBestMove(bestmoveLine) ?? '';

    job.resolve({
      fen: job.request.fen,
      bestMove,
      lines,
      pvAtIntermediateDepth: job.pvAtIntermediateDepth,
      depth: normalizePositiveInteger(job.request.depth, DEFAULT_DEPTH),
    });

    this.startNextJob();
  }

  private failActiveJob(error: Error): void {
    const job = this.activeJob;
    if (!job) {
      return;
    }

    this.clearJobTimeout(job);
    this.activeJob = null;
    job.phase = 'failed';
    job.reject(error);
  }

  private handleJobTimeout(jobId: number): void {
    if (this.activeJob?.id !== jobId) {
      return;
    }

    const { timeoutMs } = this.activeJob;
    this.failActiveJob(new Error(`Stockfish analysis timed out after ${timeoutMs}ms.`));

    // Interrupt the engine's in-flight search so it can accept the next job.
    // `send` throws if the engine was torn down concurrently — bail in that case.
    try {
      this.engine.send('stop');
    } catch {
      return;
    }

    this.startNextJob();
  }

  private clearJobTimeout(job: StockfishJob): void {
    if (job.timeoutHandle !== null) {
      clearTimeout(job.timeoutHandle);
      job.timeoutHandle = null;
    }
  }
}

export type { AnalysisRequest, AnalysisResult, AnalysisLine, WasmEngineOptions };
