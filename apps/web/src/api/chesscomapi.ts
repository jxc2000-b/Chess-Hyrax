import {
  ApiError,
  classifyPgnTimeControl,
  extractTimeControlHeader,
  normalizeChessComUsername,
} from "./apiHelpers";

const DEFAULT_RETRIEVABLE_MAX_GAMES = 20;
const CHESS_COM_API_BASE = "https://api.chess.com/pub";

export { ApiError };

export type ImportChessComGamesResult = {
  pgns: string[];
  monthExhausted: boolean;
  error: string | null;
};

export async function importChessComGames(
  username: string,
  month: number,
  year: number,
  isResumeFetch: boolean,
  timeControls: string[] = [],
  maxGames: number = DEFAULT_RETRIEVABLE_MAX_GAMES,
): Promise<ImportChessComGamesResult>
{
  const pgns: string[] = [];
  const abortController = new AbortController();
  const timeControlFilter = new Set(timeControls.map((control) => control.toLowerCase()));

  let normalizedUsername: string;
  try {
    normalizedUsername = normalizeChessComUsername(username);
  } catch (error) {
    return {
      pgns,
      monthExhausted: false,
      error: error instanceof Error ? error.message : `Invalid username: "${username}".`,
    };
  }

  const monthPgnPath = `/player/${normalizedUsername}/games/${year}/${String(month).padStart(2, "0")}/pgn`;

  let monthResponse: Response;
  monthResponse = await fetch(`${CHESS_COM_API_BASE}${monthPgnPath}`, {
    headers: { Accept: "application/x-chess-pgn, text/plain" },
    signal: abortController.signal,
  });
  
  if (!monthResponse.ok) {
    throw new ApiError(
      `Chess.com request failed (${monthResponse.status}) for ${monthPgnPath}`,
      null,
    );
  }

  if (!monthResponse.body) {
    return {
      pgns,
      monthExhausted: false,
      error: `Chess.com returned no games for ${year}-${String(month).padStart(2, "0")}.`,
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
      return
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
    streamError = `Chess.com response stream failed mid-download (${error instanceof Error ? error.message : String(error)}). Returning ${pgns.length} game(s) collected so far.`;
  } finally {
    // Tear down the stream early when we hit maxGames so we stop downloading.
    abortController.abort();
    reader.cancel().catch(() => {});
  }

  if (streamError) {
    let monthExhausted = false
    // console.log(`PGNs ${pgns}. \n \n MonthExhausted ${monthExhausted} \n\n Stream Error: ${streamError}`)
    return { pgns, monthExhausted: false, error: streamError };
  }

  if (maxGamesHit) {
    let monthExhausted = false
    // console.log(`PGNs ${pgns}. \n \n MonthExhausted ${monthExhausted}`)
    return { pgns, monthExhausted, error: null };
  }
  let monthExhausted = true
  // console.log(`PGNs ${pgns}. \n \n MonthExhausted ${monthExhausted}`)
  return { pgns, monthExhausted: true, error: null };
}

export type ChessComTimeControlKey = "chess_rapid" | "chess_blitz" | "chess_bullet";

export async function importChessComElo(username: string, timeControl: ChessComTimeControlKey): Promise<number | null> {
  const normalizedUsername = normalizeChessComUsername(username);

  const statsPath = `/player/${normalizedUsername}/stats`;
  const statsResponse = await fetch(`${CHESS_COM_API_BASE}${statsPath}`, {
    headers: { Accept: "application/json" },
  });
  if (!statsResponse.ok) {
    throw new ApiError(
      `Chess.com request failed (${statsResponse.status}) for ${statsPath}`,
      null,
    );
  }
  const stats = (await statsResponse.json());

  return stats[timeControl]?.last?.rating ?? null as number | null;
}
