import stockfishWorkerUrl from 'stockfish/bin/stockfish-18-lite-single.js?url';
import stockfishWasmUrl from 'stockfish/bin/stockfish-18-lite-single.wasm?url';

export type WasmEngineOptions = {
  wasmUrl?: string;
  threads?: number;
  hashMb?: number;
};

export type AnalysisRequest = {
  fen: string;
  depth?: number;
  intermediateDepth?: number;
  multiPv?: number;
};

export type AnalysisLine = {
  rank: number;
  depth: number;
  bestMove: string;
  evaluationCp: number;
  principalVariation: string[];
};

export type AnalysisResult = {
  fen: string;
  bestMove: string;
  lines: AnalysisLine[];
  pvAtIntermediateDepth: string[];
  depth: number;
};

type LineHandler = (line: string) => void;

const STOCKFISH_INIT_TIMEOUT_MS = 15_000;

// Toggle wire-level UCI logging from the dev console:
//   `window.__wasmDebug = true` (or false to silence). Defaults on while we
//   stabilize the move-feedback flow.
let wasmDebug = true;

if (typeof window !== "undefined") {
  Object.defineProperty(window, "__wasmDebug", {
    get: () => wasmDebug,
    set: (v) => {
      wasmDebug = Boolean(v);
    },
    configurable: true,
  });
}

function wlog(direction: "→" | "←" | "·", message: string, extra?: unknown): void {
  if (!wasmDebug) {
    return;
  }
  if (extra !== undefined) {
    // console.log(`[wasm] ${direction} ${message}`, extra);
  } else {
    // console.log(`[wasm] ${direction} ${message}`);
  }
}

export class WasmWrapper {
  private worker: Worker | null = null;
  private ready = false;
  private initPromise: Promise<void> | null = null;
  private readonly lineHandlers = new Set<LineHandler>(); //a set handler functions for each line

  constructor(private readonly options: WasmEngineOptions = {}) { }

  async init(): Promise<void> {
    if (this.ready) {
      return;
    }

    if (!this.initPromise) {
      this.initPromise = this.performInit();
    }

    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  private performInit(): Promise<void> {
    const wasmUrl = this.options.wasmUrl ?? stockfishWasmUrl;
    // Do not append ",worker"; Stockfish uses that marker for internal
    // Emscripten child workers, which skips the normal UCI message handler.
    const workerUrl = `${stockfishWorkerUrl}#${encodeURIComponent(wasmUrl)}`;
    wlog("·", "creating worker", { workerUrl, wasmUrl });

    let worker: Worker;
    try {
      worker = new Worker(workerUrl);
    } catch (error) {
      wlog("·", "new Worker(...) threw", { error });
      throw error;
    }

    this.worker = worker;

    // Registering the permanent line forwarder before the handshake. Also log
    // every raw line we receive — this is the lowest-level visibility we have
    // into what the Stockfish JS bundle is actually emitting.
    worker.addEventListener('message', (event) => {
      const line = String(event.data);
      wlog("←", line);
      this.emitLine(line);
    });

    worker.addEventListener('messageerror', (event) => {
      wlog("·", "messageerror (data could not be deserialized)", { event });
    });

    return new Promise<void>((resolve, reject) => {
      let handshakePhase: 'awaiting-uciok' | 'awaiting-readyok' = 'awaiting-uciok';
      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const cleanup = (): void => {
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        worker.removeEventListener('message', handshakeListener);
        worker.removeEventListener('error', errorListener);
      };

      const finishReady = (): void => {
        if (settled) {
          return;
        }
        settled = true;
        this.ready = true;
        cleanup();
        resolve();
      };

      const failInit = (error: Error): void => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        this.destroy();
        reject(error);
      };

      const handshakeListener = (event: MessageEvent): void => {
        const line = String(event.data);

        if (line === 'uciok') {
          wlog("·", "handshake: uciok received, sending isready");
          handshakePhase = 'awaiting-readyok';
          try {
            this.applyOptions();
            this.send('isready');
          } catch (error) {
            failInit(error instanceof Error ? error : new Error(String(error)));
          }
          return;
        }

        if (line === 'readyok' && handshakePhase === 'awaiting-readyok') {
          wlog("·", "handshake: readyok received, init complete");
          finishReady();
        }
      };

      const errorListener = (event: ErrorEvent): void => {
        wlog("·", "worker error event", {
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          error: event.error,
        });
        failInit(new Error(event.message || 'Stockfish worker failed to initialize'));
      };

      worker.addEventListener('message', handshakeListener); //for happy path
      worker.addEventListener('error', errorListener); //for error path

      timeoutId = setTimeout(() => {
        const error = new Error(
          `Stockfish worker did not complete UCI handshake within ${STOCKFISH_INIT_TIMEOUT_MS}ms; phase=${handshakePhase}`,
        );
        wlog("·", "handshake timeout", {
          phase: handshakePhase,
          timeoutMs: STOCKFISH_INIT_TIMEOUT_MS,
        });
        failInit(error);
      }, STOCKFISH_INIT_TIMEOUT_MS);

      this.send('uci');
    });
  }

  send(command: string): void {
    if (!this.worker) {
      throw new Error('Cannot send Stockfish command before init');
    }

    wlog("→", command);
    this.worker.postMessage(command);
  }

  onLine(handler: (line: string) => void): () => void { //add handler to line
    this.lineHandlers.add(handler);

    return () => {
      this.lineHandlers.delete(handler); //returns cleanup function for handler, handler not deleted until called
    };
  }

  isReady(): boolean {
    return this.ready;
  }

  destroy(): void {
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
  }

  private applyOptions(): void { //min num value: 1, max: floored input 
    if (this.options.hashMb) {
      this.send(`setoption name Hash value ${Math.max(1, Math.floor(this.options.hashMb))}`);
    }

    if (this.options.threads) {
      this.send(`setoption name Threads value ${Math.max(1, Math.floor(this.options.threads))}`);
    }
  }

  private emitLine(line: string): void { //runs handlers for emitted line 
    for (const handler of this.lineHandlers) {
      handler(line);
    }
  }
}

export function createWasmEngine(
  options: WasmEngineOptions = {}
): WasmWrapper {
  return new WasmWrapper(options);
}

export function parseUciInfoLine(line: string): AnalysisLine | null {
  const pvMatch = line.match(/\bpv (.+)$/);
  const scoreCpMatch = line.match(/\bscore cp (-?\d+)/);
  const scoreMateMatch = line.match(/\bscore mate (-?\d+)/);
  const rankMatch = line.match(/\bmultipv (\d+)/);
  const depthMatch = line.match(/\bdepth (\d+)/);

  if (!pvMatch || !depthMatch || (!scoreCpMatch && !scoreMateMatch)) {
    return null;
  }

  const principalVariation = pvMatch[1].trim().split(/\s+/).filter(Boolean);
  const bestMove = principalVariation[0];

  if (!bestMove) {
    return null;
  }

  const analysisLine: AnalysisLine = {
    rank: rankMatch ? Number(rankMatch[1]) : 1,
    depth: Number(depthMatch[1]),
    bestMove,
    evaluationCp: scoreCpMatch
      ? Number(scoreCpMatch[1])
      : normalizeMateScore(Number(scoreMateMatch![1])),
    principalVariation,
  }

  return analysisLine;
}

export function extractBestMove(bestmoveLine: string): string | null {
  return bestmoveLine.match(/^bestmove\s+(\S+)/)?.[1] ?? null;
}

function normalizeMateScore(mateIn: number): number {
  const sign = Math.sign(mateIn) || 1;
  return sign * ((100 - Math.min(Math.abs(mateIn), 99)) * 100);
}
