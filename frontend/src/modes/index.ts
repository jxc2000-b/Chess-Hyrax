// Mode registry: maps every GameMode to its module. The shell looks up the
// active module via MODE_REGISTRY[sessionData.gamemode] and delegates
// behavior to that module's useMode hook.

import type { GameMode } from "../types";
import type { GameModeModule } from "./types";
import { analysisMode } from "./analysisMode";
import { rushMode } from "./rushMode";
import { trainMode } from "./trainMode";

export const MODE_REGISTRY: Record<GameMode, GameModeModule> = {
  analysis: analysisMode,
  rush: rushMode,
  train: trainMode,
};

export type { GameModeModule, ModeContext, ModeReturn, ModeViewState } from "./types";
