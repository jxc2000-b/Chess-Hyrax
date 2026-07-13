import stockfishWorkerUrl from "stockfish/bin/stockfish-18-lite-single.js?url";
import stockfishWasmUrl from "stockfish/bin/stockfish-18-lite-single.wasm?url";

type SmokeFetchResult = {
  ok: boolean;
  status: number;
  contentType: string | null;
  contentLength: string | null;
  url: string;
};

type StockfishSmokeOptions = {
  timeoutMs?: number;
};

async function inspectUrl(url: string): Promise<SmokeFetchResult> {
  const response = await fetch(url);

  return {
    ok: response.ok,
    status: response.status,
    contentType: response.headers.get("content-type"),
    contentLength: response.headers.get("content-length"),
    url: response.url,
  };
}

export async function runStockfishSmokeTest(
  options: StockfishSmokeOptions = {},
): Promise<Worker> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  // The hash passes the WASM URL to the normal UCI worker. Do not append
  // ",worker"; that is Stockfish's internal child-worker marker.
  const workerUrl = `${stockfishWorkerUrl}#${encodeURIComponent(stockfishWasmUrl)}`;

  console.log("[smoke] workerUrl:", stockfishWorkerUrl);
  console.log("[smoke] wasmUrl:", stockfishWasmUrl);
  console.log("[smoke] actual workerUrl:", workerUrl);
  console.log("[smoke] worker fetch:", await inspectUrl(stockfishWorkerUrl));
  console.log("[smoke] wasm fetch:", await inspectUrl(stockfishWasmUrl));

  const worker = new Worker(workerUrl);

  worker.addEventListener("message", (event) => {
    console.log("[smoke ←]", event.data);

    if (event.data === "uciok") {
      console.log("[smoke →] isready");
      worker.postMessage("isready");
    }

    if (event.data === "readyok") {
      console.log("[smoke] READY");
    }
  });

  worker.addEventListener("error", (event) => {
    console.error("[smoke error]", {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error,
    });
  });

  worker.addEventListener("messageerror", (event) => {
    console.error("[smoke messageerror]", event);
  });

  window.setTimeout(() => {
    console.log("[smoke →] uci");
    worker.postMessage("uci");
  }, 250);

  window.setTimeout(() => {
    console.warn(
      "[smoke] timeout. If no '[smoke ←] uciok' appeared, worker/WASM init is stuck.",
    );
  }, timeoutMs);

  return worker;
}
