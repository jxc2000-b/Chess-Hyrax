/* --------------------------------------------------------------------------
 * Engine service constants and severity mapping
 * -------------------------------------------------------------------------- */

export const ENGINE_DEPTH_DEFAULT = 15;
export const ENGINE_LOW_PRIORITY_QUEUE_CAP = 500;
export const ENGINE_LOADING_BADGE_DELAY_MS = 120;

// Pawn-units thresholds. Mirrors the backend's classifyEvalLoss tiers (which
// operate in pawns since stockfishEngine.ts divides cp by 100), with an
// added "good" band so near-best moves get a kinder badge than a dry "ok".
