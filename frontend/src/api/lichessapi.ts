import {
  ApiError,
  classifyPgnTimeControl,
  extractTimeControlHeader,
} from "./apiHelpers";

const DEFAULT_RETRIEVABLE_MAX_GAMES = 20;
const LICHESS_API_BASE = "https://lichess.org/api";

export { ApiError };

//---Trims, lowercases, and validates a Lichess username---

function normalizeLichessUsername(username: string): string {
  const trimmed = username.trim().toLowerCase();
  // Lichess usernames are alphanumeric with _ and -. Reject anything else
  // (e.g. #, $, @, /, whitespace) before it gets baked into a URL path.
  if (!/^[a-z0-9_-]+$/.test(trimmed)) {
    throw new ApiError(`Invalid Lichess username: "${username}"`, null);
  }
  return trimmed;
}

export type ImportLichessGamesResult = {
  pgns: string[];
  monthExhausted: boolean;
  error: string | null;
};

export async function ImportLichessGames(
  username: string,
  month: number,
  year: number,
  isResumeFetch: boolean,
  timeControls: string[] = [],
  maxGames: number = DEFAULT_RETRIEVABLE_MAX_GAMES,
): Promise<ImportLichessGamesResult> {
  const pgns: string[] = [];
  const abortController = new AbortController();
  const timeControlFilter = new Set(timeControls.map((control) => control.toLowerCase()));

  let normalizedUsername: string;
  try {
    normalizedUsername = normalizeLichessUsername(username);
  } catch (error) {
    return {
      pgns,
      monthExhausted: false,
      error: error instanceof Error ? error.message : `Invalid username: "${username}".`,
    };
  }

  // Lichess has no per-month endpoint; bound the export with `since`/`until`
  // (epoch milliseconds, UTC) covering the requested calendar month.
  const since = Date.UTC(year, month - 1, 1);
  const until = Date.UTC(year, month, 1);
  const gamesPath = `/games/user/${normalizedUsername}?since=${since}&until=${until}&sort=dateAsc`;

  let monthResponse: Response;
  monthResponse = await fetch(`${LICHESS_API_BASE}${gamesPath}`, {
    headers: { Accept: "application/x-chess-pgn" },
    signal: abortController.signal,
  });

  if (!monthResponse.ok) {
    throw new ApiError(
      `Lichess request failed (${monthResponse.status}) for ${gamesPath}`,
      null,
    );
  }

  if (!monthResponse.body) {
    return {
      pgns,
      monthExhausted: false,
      error: `Lichess returned no games for ${year}-${String(month).padStart(2, "0")}.`,
    };
  }

  const reader = monthResponse.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let maxGamesHit = false;
  let gamesToSkip = maxGames;

  function consumeGame(rawGame: string) {
    const game = rawGame.trim();
    if (!game) {
      return;
    }
    if (timeControlFilter.size > 0) {
      const cls = classifyPgnTimeControl(extractTimeControlHeader(game));
      if (!timeControlFilter.has(cls)) {
        return;
      }
    }

    // Resume calls must pass the same `timeControls` as the prior fetch otherwise misalignment in gamesToSkip
    // the skip count assumes the filter is stable within the fetch resumption chain.

    if (isResumeFetch && gamesToSkip > 0) {
      gamesToSkip--;
      return;
    }
    pgns.push(game);
    if (pgns.length >= maxGames) {
      maxGamesHit = true;
    }
  }

  let streamError: string | null = null;
  try {
    // Games are separated by a blank line followed by the next [Event "..."]. (/n/n)
    // Split on that boundary, leaving the trailing partial in the buffer.
    while (!maxGamesHit) {
      const { value, done } = await reader.read();
      if (value) {
        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf(`\n\n[Event`, 1);
        while (boundary !== -1) {
          consumeGame(buffer.slice(0, boundary));
          buffer = buffer.slice(boundary + 2);
          if (maxGamesHit) {
            break;
          }
          boundary = buffer.indexOf(`\n\n[Event`, 1);
        }
      }
      if (done) {
        buffer += decoder.decode();
        consumeGame(buffer);
        buffer = "";
        break;
      }
    }
  } catch (error) {
    streamError = `Lichess response stream failed mid-download (${error instanceof Error ? error.message : String(error)}). Returning ${pgns.length} game(s) collected so far.`;
  } finally {
    // Tear down the stream early when we hit maxGames so we stop downloading.
    abortController.abort();
    reader.cancel().catch(() => {});
  }

  if (streamError) {
    return { pgns, monthExhausted: false, error: streamError };
  }

  if (maxGamesHit) {
    return { pgns, monthExhausted: false, error: null };
  }

  return { pgns, monthExhausted: true, error: null };
}

// https://lichess.org/api#tag/games/GET/api/games/user/{username}

export type LichessTimeControlKey = "bullet" | "blitz" | "rapid";

export async function importLichessElo(
  username: string,
  timeControl: LichessTimeControlKey,
): Promise<number | null> {
  const normalizedUsername = normalizeLichessUsername(username);

  const userPath = `/user/${normalizedUsername}`;
  const userResponse = await fetch(`${LICHESS_API_BASE}${userPath}`, {
    headers: { Accept: "application/json" },
  });
  if (!userResponse.ok) {
    throw new ApiError(
      `Lichess request failed (${userResponse.status}) for ${userPath}`,
      null,
    );
  }
  const user = (await userResponse.json());

  return user?.perfs?.[timeControl]?.rating ?? null as number | null;
}
