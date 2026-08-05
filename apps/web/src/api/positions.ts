// Training-position data-access: persist mined positions and their inferences
// via the update RPCs in schema/migrations/0004_functions.sql. Each RPC stamps
// user_id := auth.uid() server-side, so ownership can't be spoofed from here.

import { supabase } from "@hyrax/shared";
import { averagePgnElo } from "./apiHelpers";
import type { Inference, ShrunkTrainingPosition } from "../types";

// The stored row. The columns mirror ShrunkTrainingPosition (snake_cased) plus
// user_id / inferences / elo; kept loose since the UI mostly round-trips it.
export type TrainingPositionRow = {
  id: string;
  user_id: string;
  client_id: string | null;
  source_game: string;
  game_date: string | null;
  fen: string;
  color: string;
  inferences: Inference[];
  elo: number | null;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
};

export type PersistOptions = {
  inferences?: Inference[];
  // Either pass elo directly, or pass the source PGNs and let it be computed
  // as the average of their WhiteElo/BlackElo headers.
  elo?: number | null;
  pgns?: string[];
};

function toPayload(
  position: ShrunkTrainingPosition,
  options: PersistOptions = {},
): Record<string, unknown> {
  const elo =
    options.elo ?? (options.pgns ? averagePgnElo(options.pgns) : undefined);

  return {
    ...position,
    inferences: options.inferences ?? position.inferences ?? [],
    ...(elo != null ? { elo } : {}),
  };
}

export async function upsertTrainingPosition(
  position: ShrunkTrainingPosition,
  options: PersistOptions = {},
): Promise<TrainingPositionRow> {
  const { data, error } = await supabase.rpc("upsert_training_position", {
    position: toPayload(position, options),
  });
  if (error) throw new Error(error.message);
  return data as TrainingPositionRow;
}

export async function bulkUpsertTrainingPositions(
  positions: ShrunkTrainingPosition[],
  options: PersistOptions = {},
): Promise<TrainingPositionRow[]> {
  const payload = positions.map((position) => toPayload(position, options));
  const { data, error } = await supabase.rpc("bulk_upsert_training_positions", {
    positions: payload,
  });
  if (error) throw new Error(error.message);
  return (data as TrainingPositionRow[]) ?? [];
}

export async function setPositionInferences(
  positionId: string,
  inferences: Inference[],
): Promise<TrainingPositionRow> {
  const { data, error } = await supabase.rpc("set_position_inferences", {
    p_position_id: positionId,
    p_inferences: inferences,
  });
  if (error) throw new Error(error.message);
  return data as TrainingPositionRow;
}

export async function listMyPositions(): Promise<TrainingPositionRow[]> {
  const { data, error } = await supabase
    .from("training_positions")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as TrainingPositionRow[]) ?? [];
}
