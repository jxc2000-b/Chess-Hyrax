// Frontend engine service. Singleton owning the WASM Stockfish stack, a
// per-fen cache, in-flight dedupe, and two priority queues. Survives React
// component unmounts so navigation can't cancel work that other consumers
// (sessionData, future API calls) still want to receive.

import { analyze as runStockfishAnalysis, init as initStockfish } from "./StockfishEngine";
import { ENGINE_DEPTH_DEFAULT, ENGINE_LOW_PRIORITY_QUEUE_CAP } from "../sessionHelpers";
import type {
  EngineAnalysis,
  EngineAnalyzeOptions,
  EnginePriority,
  EngineSubscriptionListener,
} from "../types";

type QueuedJob = {
  id: number;
  fen: string;
  cacheKey: string;
  depth: number;
  intermediateDepth?: number;
  priority: EnginePriority;
  resolve: (result: EngineAnalysis) => void;
  reject: (error: Error) => void;
};

const PREWARM_ENGINE_DEPTH = 14;

// Toggle at runtime via `engineService.setDebug(true|false)`. Defaults on
// while we're still building out the WASM flow; flip to false once the move
// loop is stable.
let debugEnabled = true;
let nextJobId = 1;

function fenTag(fen: string): string {
  // FENs are long; first 24 chars is enough to disambiguate in a session.
  return fen.length > 24 ? `${fen.slice(0, 24)}…` : fen;
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.floor(value));
}

function makeEngineCacheKey(fen: string, depth: number, intermediateDepth?: number): string {
  return `${fen}::depth=${depth}::intermediateDepth=${intermediateDepth ?? "none"}`;
}

function log(message: string, extra?: Record<string, unknown>): void {
  if (!debugEnabled) {
    return;
  }
  const queueState = `hi=${highPriorityQueue.length} lo=${lowPriorityQueue.length} inflight=${inFlight.size} cache=${cache.size} processing=${isProcessing}`;
  if (extra) {
    // console.log(`[engine] ${message} | ${queueState}`, extra);
  } else {
    // console.log(`[engine] ${message} | ${queueState}`);
  }
}

const cache = new Map<string, EngineAnalysis>();
const inFlight = new Map<string, Promise<EngineAnalysis>>();
const subscribers = new Map<string, Set<EngineSubscriptionListener>>();

const highPriorityQueue: QueuedJob[] = [];
const lowPriorityQueue: QueuedJob[] = [];

let isProcessing = false;
let initPromise: Promise<void> | null = null;

function ensureInit(): Promise<void> {
  if (!initPromise) {
    log("init: starting Stockfish WASM");
    initPromise = initStockfish()
      .then(() => {
        log("init: Stockfish WASM ready");
      })
      .catch((error) => {
        log("init: FAILED", { error });
        // Drop the bricked init so a future caller can retry.
        initPromise = null;
        throw error;
      });
  }
  return initPromise;
}

function pickNextJob(): QueuedJob | null {
  if (highPriorityQueue.length > 0) {
    return highPriorityQueue.shift() ?? null;
  }
  if (lowPriorityQueue.length > 0) {
    return lowPriorityQueue.shift() ?? null;
  }
  return null;
}

function notifySubscribers(cacheKey: string, analysis: EngineAnalysis): void {
  const listeners = subscribers.get(cacheKey);
  if (!listeners) {
    return;
  }
  for (const listener of listeners) {
    try {
      listener(analysis);
    } catch (error) {
      console.error("Engine subscriber threw:", error);
    }
  }
}

async function processQueues(): Promise<void> {
  if (isProcessing) {
    // log("processQueues: skipped, already processing");
    return;
  }
  isProcessing = true;
  // log("processQueues: enter");
  try {
    while (true) {
      const job = pickNextJob();
      if (!job) {
        // log("processQueues: queues empty, exiting loop");
        break;
      }

      // The cache may have been populated by an earlier run while this job
      // was still queued (dedupe path). Resolve from cache and skip the
      // engine round-trip.
      const cached = cache.get(job.cacheKey);
      if (cached) {
        // log(`job#${job.id} cache short-circuit`, { fen: fenTag(job.fen), depth: job.depth });
        job.resolve(cached);
        continue;
      }

      const startedAt = Date.now();
      if (job.priority === "high") {
        log(`job#${job.id} dispatch`, {
          fen: fenTag(job.fen),
          priority: job.priority,
          depth: job.depth,
        });
      }
      try {
        const result = await runStockfishAnalysis({
          fen: job.fen,
          depth: job.depth,
          intermediateDepth: job.intermediateDepth,
          multiPv: 1,
        });
        const primary = result.lines[0];
        const analysis: EngineAnalysis = {
          fen: result.fen,
          bestMove: result.bestMove,
          evaluationCp: primary?.evaluationCp ?? 0,
          principalVariation: primary?.principalVariation ?? [],
          pvAtIntermediateDepth: result.pvAtIntermediateDepth,
          depth: result.depth,
          completedAt: Date.now(),
        };
        cache.set(job.cacheKey, analysis);
        const subscriberCount = subscribers.get(job.cacheKey)?.size ?? 0;
        if (job.priority === "high") {
          log(`job#${job.id} done in ${Date.now() - startedAt}ms`, {
            fen: fenTag(job.fen),
            bestMove: analysis.bestMove,
            evalCp: analysis.evaluationCp,
            depth: analysis.depth,
            subscribers: subscriberCount,
          });
        }
        notifySubscribers(job.cacheKey, analysis);
        job.resolve(analysis);
      } catch (error) {
        if (job.priority === "high") {
          log(`job#${job.id} FAILED after ${Date.now() - startedAt}ms`, {
            fen: fenTag(job.fen),
            error,
          });
        }
        job.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }
  } finally {
    isProcessing = false;
    // log("processQueues: exit");
  }
}

function bumpPriorityToHigh(cacheKey: string): void {
  const idx = lowPriorityQueue.findIndex((job) => job.cacheKey === cacheKey);
  if (idx === -1) {
    return;
  }
  const [job] = lowPriorityQueue.splice(idx, 1);
  job.priority = "high";
  highPriorityQueue.push(job);
  // log(`job#${job.id} priority bumped low → high`, { fen: fenTag(job.fen), depth: job.depth });
}

function evictOldestLowPriority(): void {
  const dropped = lowPriorityQueue.shift();
  if (!dropped) {
    return;
  }
  inFlight.delete(dropped.cacheKey);
  // log(`job#${dropped.id} evicted (low-pri cap)`, { fen: fenTag(dropped.fen), depth: dropped.depth });
  dropped.reject(new Error("Low-priority engine job evicted by queue cap."));
}

function enqueue(fen: string, options: EngineAnalyzeOptions): Promise<EngineAnalysis> {
  const priority: EnginePriority = options.priority ?? "high";
  const depth = normalizePositiveInteger(options.depth, ENGINE_DEPTH_DEFAULT);
  const intermediateDepth =
    options.intermediateDepth === undefined
      ? undefined
      : normalizePositiveInteger(options.intermediateDepth, ENGINE_DEPTH_DEFAULT);
  const cacheKey = makeEngineCacheKey(fen, depth, intermediateDepth);

  const cached = cache.get(cacheKey);
  if (cached) {
    // log("enqueue: cache hit", { fen: fenTag(fen), priority, depth });
    return Promise.resolve(cached);
  }

  const existing = inFlight.get(cacheKey);
  if (existing) {
    // log("enqueue: in-flight dedupe", { fen: fenTag(fen), priority, depth });
    if (priority === "high") {
      bumpPriorityToHigh(cacheKey);
    }
    return existing;
  }

  const jobId = nextJobId++;
  const promise = new Promise<EngineAnalysis>((resolve, reject) => {
    const job: QueuedJob = { id: jobId, fen, cacheKey, depth, intermediateDepth, priority, resolve, reject };
    if (priority === "high") {
      highPriorityQueue.push(job);
    } else {
      lowPriorityQueue.push(job);
      while (lowPriorityQueue.length > ENGINE_LOW_PRIORITY_QUEUE_CAP) {
        evictOldestLowPriority();
      }
    }
  });
  if (priority === "high") {
    log(`job#${jobId} enqueued (${priority})`, { fen: fenTag(fen), depth });
  }

  inFlight.set(cacheKey, promise);
  promise.then(
    () => {
      inFlight.delete(cacheKey);
    },
    () => {
      inFlight.delete(cacheKey);
    },
  );

  void ensureInit()
    .then(() => processQueues())
    .catch((error: unknown) => {
      // Init failed — drain everything queued so callers don't wait forever.
      const drainError = error instanceof Error ? error : new Error(String(error));
      log("init/process chain FAILED, draining queues", { error: drainError });
      while (highPriorityQueue.length > 0) {
        highPriorityQueue.shift()!.reject(drainError);
      }
      while (lowPriorityQueue.length > 0) {
        lowPriorityQueue.shift()!.reject(drainError);
      }
    });

  return promise;
}

export const engineService = {
  analyze(fen: string, options: EngineAnalyzeOptions = {}): Promise<EngineAnalysis> {
    return enqueue(fen, options);
  },

  subscribe(fen: string, listener: EngineSubscriptionListener): () => void {
    const cacheKey = makeEngineCacheKey(fen, ENGINE_DEPTH_DEFAULT);
    let listeners = subscribers.get(cacheKey);
    if (!listeners) {
      listeners = new Set();
      subscribers.set(cacheKey, listeners);
    }
    listeners.add(listener);

    // If already cached, fire once immediately so subscribers don't have to
    // pre-check the cache themselves.
    const cached = cache.get(cacheKey);
    if (cached) {
      try {
        listener(cached);
      } catch (error) {
        console.error("Engine subscriber threw on initial cached delivery:", error);
      }
    }

    return () => {
      const current = subscribers.get(cacheKey);
      if (!current) {
        return;
      }
      current.delete(listener);
      if (current.size === 0) {
        subscribers.delete(cacheKey);
      }
    };
  },

  prewarm(fens: string[], priority: EnginePriority = "low"): void {
    for (const fen of fens) {
      const cacheKey = makeEngineCacheKey(fen, PREWARM_ENGINE_DEPTH);
      if (!fen || cache.has(cacheKey) || inFlight.has(cacheKey)) {
        continue;
      }
      void enqueue(fen, { priority, depth: PREWARM_ENGINE_DEPTH }).catch(() => {
        // Pre-warm failures (engine init crashes, evictions, etc.) must not
        // surface as unhandled rejections — they're best-effort.
      });
    }
  },

  clearLowPriority(): void {
    // log("clearLowPriority called");
    while (lowPriorityQueue.length > 0) {
      const job = lowPriorityQueue.shift()!;
      inFlight.delete(job.cacheKey);
      job.reject(new Error("Low-priority queue cleared."));
    }
  },

  setDebug(enabled: boolean): void {
    debugEnabled = enabled;
    // Bypass `log()` so this message prints regardless of the new flag value.
    console.log(`[engine] debug logging ${enabled ? "ON" : "OFF"}`);
  },

  getStats(): {
    highPriorityQueueLength: number;
    lowPriorityQueueLength: number;
    inFlightCount: number;
    cacheSize: number;
    subscriberFenCount: number;
    isProcessing: boolean;
    initialized: boolean;
  } {
    return {
      highPriorityQueueLength: highPriorityQueue.length,
      lowPriorityQueueLength: lowPriorityQueue.length,
      inFlightCount: inFlight.size,
      cacheSize: cache.size,
      subscriberFenCount: subscribers.size,
      isProcessing,
      initialized: initPromise !== null,
    };
  },
};

// Hand the singleton to the dev console so you can poke at it without
// importing anything: `window.engineService.getStats()`.
if (typeof window !== "undefined") {
  (window as unknown as { engineService: typeof engineService }).engineService = engineService;
}
