const BACKEND_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || "")
  .trim()
  .replace(/\/+$/, "");

//---Builds the API---

export function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (!BACKEND_BASE_URL) {
    return normalizedPath;
  }

  // Allow either origin-style bases like https://api.example.com or API-root
  // bases like https://example.com/api without producing /api/api routes.
  if (BACKEND_BASE_URL.endsWith("/api") && normalizedPath.startsWith("/api/")) {
    return `${BACKEND_BASE_URL}${normalizedPath.slice("/api".length)}`;
  }

  return `${BACKEND_BASE_URL}${normalizedPath}`;
}


//---Parses a JSON or text response body---

export async function parseJsonResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return text ? { error: text } : {};
}

//---Returns a high-resolution timer start value---

export function getTimerStart(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }

  return Date.now();
}

//---Returns elapsed ms since a timer start value---

export function getElapsedDurationMs(startTime: number): number {
  const endTime =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();

  return Number(Math.max(0, endTime - startTime).toFixed(1));
}

//---Custom error class carrying an API error payload---

export class ApiError extends Error {
  payload: unknown;

  constructor(message: string, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.payload = payload;
  }
}

//---Performs a backend fetch, parses, and throws on non-OK responses---

export async function request<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(buildApiUrl(path), options);
  } catch {
    throw new Error(
      BACKEND_BASE_URL
        ? `Could not reach the backend at ${BACKEND_BASE_URL}.`
        : "Could not reach the backend. Make sure the local /api proxy is running.",
    );
  }

  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    const message =
      (payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof (payload as { error: unknown }).error === "string"
        ? (payload as { error: string }).error
        : null) || "Request failed.";
    throw new ApiError(message, payload);
  }

  return payload as T;
}

//---Trims, lowercases, and validates a Chess.com username---

export function normalizeChessComUsername(username: string): string {
  const trimmed = username.trim().toLowerCase();
  // Chess.com usernames are alphanumeric with _ and -. Reject anything else
  // (e.g. #, $, @, /, whitespace) before it gets baked into a URL path.
  if (!/^[a-z0-9_-]+$/.test(trimmed)) {
    throw new ApiError(`Invalid Chess.com username: "${username}"`, null);
  }
  return trimmed;
}

export type TimeControlClass = "bullet" | "blitz" | "rapid" | "classical" | "daily" | "unknown";

//---Classifies a PGN [TimeControl] header into a chess.com-style bucket---
// Format examples: "60", "180+2", "600", "1800+30", "1/86400" (correspondence).

export function classifyPgnTimeControl(timeControlHeader: string | null): TimeControlClass {
  if (!timeControlHeader) {
    return "unknown";
  }
  // Daily / correspondence games use "moves/seconds" notation.
  if (timeControlHeader.includes("/")) {
    return "daily";
  }
  const baseSeconds = Number.parseInt(timeControlHeader.split("+")[0] ?? "", 10);
  if (!Number.isFinite(baseSeconds)) {
    return "unknown";
  }
  if (baseSeconds < 180) return "bullet";
  if (baseSeconds < 600) return "blitz";
  if (baseSeconds < 1800) return "rapid";
  return "classical";
}

//---Extracts the [TimeControl "..."] tag value from a PGN string---

export function extractTimeControlHeader(pgn: string): string | null {
  const match = pgn.match(/^\[TimeControl\s+"([^"]*)"\]/m);
  return match ? match[1] : null;
}

//---Extracts [WhiteElo]/[BlackElo] tag values from a PGN string---

export function extractPgnElos(pgn: string): { white: number | null; black: number | null } {
  const white = pgn.match(/^\[WhiteElo\s+"(\d+)"\]/m);
  const black = pgn.match(/^\[BlackElo\s+"(\d+)"\]/m);
  return {
    white: white ? Number(white[1]) : null,
    black: black ? Number(black[1]) : null,
  };
}

//---Averages every WhiteElo/BlackElo found across one or more PGNs---
// This is the "elo of the position" stored on training_positions.elo. Returns
// null when no Elo headers are present.

export function averagePgnElo(pgns: string[]): number | null {
  const elos: number[] = [];
  for (const pgn of pgns) {
    const { white, black } = extractPgnElos(pgn);
    if (white !== null) elos.push(white);
    if (black !== null) elos.push(black);
  }
  if (elos.length === 0) return null;
  return Math.round(elos.reduce((sum, elo) => sum + elo, 0) / elos.length);
}
