export { engineService } from "./engineService.ts";

export {
  ENGINE_DEPTH_DEFAULT,
  ENGINE_LOADING_BADGE_DELAY_MS,
  ENGINE_LOW_PRIORITY_QUEUE_CAP,
} from "./engine.constants.ts";

export type {
  EngineAnalysis,
  EngineAnalyzeOptions,
  EnginePriority,
  EngineSubscriptionListener,
  Severity,
  UciMove,
} from "./engine.types.ts";
