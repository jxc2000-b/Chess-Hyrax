// Cheap, synchronous PGN → ShrunkTrainingPosition[] parser.
// One chess.js parse per game; uses move.before for FENs so there's no
// explicit replay loop. Headers come from regex on the raw PGN string —
// no engine work involved.

import { Chess } from "chess.js";
import { classifyPgnTimeControl, extractTimeControlHeader } from "../api/apiHelpers";
import type { ShrunkTrainingPosition } from "../types";

function extractHeader(pgn: string, tag: string): string {
  const match = pgn.match(new RegExp(`^\\[${tag}\\s+"([^"]*)"\\]`, "m"));
  return match ? match[1] : "";
}

function extractNumericHeader(pgn: string, tag: string): number | undefined {
  const value = extractHeader(pgn, tag).trim();
  if (!/^\d+$/.test(value)) {
    return undefined;
  }
  return Number.parseInt(value, 10);
}

function extractOpeningFromEcoUrl(pgn: string): string | undefined {
  const ecoUrl = extractHeader(pgn, "ECOUrl").trim();
  const openingSlug = ecoUrl.match(/\/opening\/([^/?#]+)/)?.[1];
  if (!openingSlug) {
    return undefined;
  }
  return decodeURIComponent(openingSlug).replace(/-/g, " ");
}

function extractGameId(pgn: string, fallbackIndex: number): string {
  // Chess.com PGNs include [Link "https://www.chess.com/game/live/123..."].
  // Trailing numeric segment is a globally unique, stable id.
  const link = extractHeader(pgn, "Link");
  const idFromLink = link.match(/\/(\d+)(?:\/|$)/)?.[1];
  if (idFromLink) {
    return idFromLink;
  }
  // Fallback: white|black|date|starttime is effectively unique on chess.com.
  const white = extractHeader(pgn, "White");
  const black = extractHeader(pgn, "Black");
  const date = extractHeader(pgn, "Date");
  const startTime = extractHeader(pgn, "StartTime");
  if (white || black || date || startTime) {
    return `${white}|${black}|${date}|${startTime}`;
  }
  return `pgn-${fallbackIndex}`;
}

// Cheap piece count from a FEN's piece-placement field — counts only the
// alphanumeric piece letters and ignores rank separators / empties.
function countPiecesFromFen(fen: string): number {
  const placement = fen.split(" ")[0] ?? "";
  return (placement.match(/[prnbqkPRNBQK]/g) ?? []).length;
}

function userResultFromGame(
  result: string,
  userColor: "white" | "black" | null,
): "win" | "loss" | "draw" | undefined {
  if (!userColor) {
    return undefined;
  }
  if (result === "1/2-1/2") return "draw";
  if (result === "1-0") return userColor === "white" ? "win" : "loss";
  if (result === "0-1") return userColor === "black" ? "win" : "loss";
  return undefined;
}

function getUserColorForGame(
  white: string,
  black: string,
  username: string | undefined,
): "white" | "black" | null {
  if (!username) {
    return null;
  }
  const normalized = username.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (white.trim().toLowerCase() === normalized) return "white";
  if (black.trim().toLowerCase() === normalized) return "black";
  return null;
}

function getUserEloForGame(
  pgn: string,
  userColor: "white" | "black" | null,
): number | undefined {
  if (userColor === "white") {
    return extractNumericHeader(pgn, "WhiteElo") ?? extractNumericHeader(pgn, "WhiteRating");
  }
  if (userColor === "black") {
    return extractNumericHeader(pgn, "BlackElo") ?? extractNumericHeader(pgn, "BlackRating");
  }
  return undefined;
}

function getOpeningForGame(pgn: string): string | undefined {
  const opening = extractHeader(pgn, "Opening").trim();
  const variation = extractHeader(pgn, "Variation").trim();
  const subVariation = extractHeader(pgn, "SubVariation").trim();

  if (opening) {
    const suffix = [variation, subVariation].filter(Boolean).join(", ");
    return suffix ? `${opening}: ${suffix}` : opening;
  }

  const eco = extractHeader(pgn, "ECO").trim();
  return extractOpeningFromEcoUrl(pgn) ?? (eco || undefined);
}

export type ParsedGame = {
  sourceGame: string;
  date: string;
  moves: ShrunkTrainingPosition[];
};

export function parseGameToShrunkPositions(
  pgn: string,
  fallbackIndex: number,
  username?: string,
): ShrunkTrainingPosition[] {
  const date = extractHeader(pgn, "Date");
  const white = extractHeader(pgn, "White");
  const black = extractHeader(pgn, "Black");
  const result = extractHeader(pgn, "Result");
  const sourceGame = white || black ? `${white} vs ${black}` : "unknown";
  const gameId = extractGameId(pgn, fallbackIndex);
  const timeControl = classifyPgnTimeControl(extractTimeControlHeader(pgn));
  const userColor = getUserColorForGame(white, black, username);
  const userResult = userResultFromGame(result, userColor);
  const userElo = getUserEloForGame(pgn, userColor);
  const opening = getOpeningForGame(pgn);

  const chess = new Chess();
  try {
    chess.loadPgn(pgn);
  } catch {
    return [];
  }

  const moves = chess.history({ verbose: true });

  return moves.map((move, plyIndex) => ({
    id: `${gameId}-${plyIndex}`,
    sourceGame,
    date,
    fen: move.before,
    previousMove: plyIndex > 0 ? moves[plyIndex - 1].san : undefined,
    previousMoveFen: plyIndex > 0 ? moves[plyIndex - 1].before : undefined,
    userElo,
    opening,
    playedMove: move.san,
    playedMoveUci: `${move.from}${move.to}${move.promotion ?? ""}`,
    pieceMoved: move.piece,
    fromSquare: move.from,
    toSquare: move.to,
    isCapture: Boolean(move.captured),
    isCheck: move.san.endsWith("+") || move.san.endsWith("#"),
    // chess.js plies are 0-indexed; full move number increments every two plies.
    moveNumber: Math.floor(plyIndex / 2) + 1,
    pieceCount: countPiecesFromFen(move.before),
    userResult,
    timeControl,
    userColorForGame: userColor,
    color: move.color === "w" ? "white" : "black",
  }));
}

export function parseGamesToShrunkPositions(
  pgns: string[],
  username?: string,
): ShrunkTrainingPosition[] {
  return pgns.flatMap((pgn, index) => parseGameToShrunkPositions(pgn, index, username));
}

function haveConsistentUserColorForGame(moves: ShrunkTrainingPosition[]): boolean {
  const expectedUserColor = moves[0]?.userColorForGame;
  if (!expectedUserColor) {
    console.error("Parsed game is missing user color metadata:", moves[0]?.sourceGame);
    return false;
  }

  const hasMismatch = moves.some((move) => move.userColorForGame !== expectedUserColor);
  if (hasMismatch) {
    console.error("Parsed game has inconsistent user color metadata:", moves[0]?.sourceGame);
    return false;
  }

  return true;
}

export function parsePgnStreamToGames(pgns: string[], username?: string): ParsedGame[] {
  return pgns.flatMap((pgn, index) => {
    const moves = parseGameToShrunkPositions(pgn, index, username);
    if (moves.length === 0 || !haveConsistentUserColorForGame(moves)) {
      return [];
    }
    return [{
      sourceGame: moves[0].sourceGame,
      date: moves[0].date,
      moves,
    }];
  });
}

export const parseGamesToGames = parsePgnStreamToGames;
