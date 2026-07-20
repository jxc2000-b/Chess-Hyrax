// Mode-agnostic session shell. Owns the full UI inventory (board, header
// buttons, navigation, sidebar windows, import popup). Delegates all move
// handling and behavior to the active mode's useMode hook via the registry.
//
// The useMode dispatch lives inside an inner <ActiveMode> component keyed
// by gamemode. When the gamemode changes, React unmounts/remounts that
// component — modes are free to use whatever hooks they need without
// violating the rules-of-hooks when the user switches modes.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import "./app.css";
import { SESSION_DATA } from "./data/sessionData.js";
import { NextButton, PreviousButton, ResetButton, TextButton, ToggleButton } from "./components";
import { createBoardView, STARTING_FEN, getBoardOrientation } from "./sessionHelpers";
import TrainingBoard from "./trainingBoard/trainingBoard";
import { useBoardDemoLoop } from "./trainingBoard/useBoardDemoLoop";
import { DEFAULT_GAMEMODE, type TrainingBoardHandle, type GameMode, type SessionData, type ShrunkTrainingPosition } from "./types";
import { useUserPreferences } from "./userPreferencesContext";
import { useAuth } from "./auth/AuthContext";
import { MODE_REGISTRY } from "./modes";
import type { ModeContext, ModeReturn } from "./modes/types";
import { SettingsWindow, StockfishWindow, AnalysisWindow,
  StatsWindow, ImportGamesWindow, LoginWindow} from "./windows";
import { TutorialTestButton } from "./tutorial/TutorialTestButton";
import { useTutorial } from "./tutorial/TutorialProvider";
import { NONAME } from "dns";

type SessionShellProps = {
  sessionData: SessionData | null;
  onSessionDataChange: (sessionData: SessionData | null) => void;
};

// Tiny render-prop wrapper. Keyed by gamemode at the call site so each mode
// gets an isolated hook scope; modes can freely use useState, useEffect,
// useRef, etc. without colliding across mode switches.
function ActiveMode({ ctx, gamemode, children }: { ctx: ModeContext; gamemode: GameMode; children: (result: ModeReturn) => ReactNode }) {
  const result = MODE_REGISTRY[gamemode].useMode(ctx);
  return <>{children(result)}</>;
}

function formatTimer(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

type ScoreHudProps = {
  index: number;
  streak: number;
  total: number;
  isAnimating?: boolean;
};

function ScoreHud({ index, streak, total, isAnimating = false }: ScoreHudProps) {
  // Kept on the component boundary now so mode scoring can drive the future
  // animation without reworking the score HUD data flow later.
  void isAnimating;

  return (
    <div className="score-card" aria-label="Score card">
      <div className="score-card__label no-global-border">Position</div>
      <div className="score-card__value no-global-border">
        {index} / {total}
      </div>
      <div className="score-card__meta no-global-border">streak {streak}</div>
    </div>
  );
}

function HintHud({ progress = 0 }: { progress?: number }) {
  const boundedProgress = Math.min(Math.max(progress, 0), 1);

  return (
    <div className="hint-card" aria-label="Hint">
      <span className="hint-card__label no-global-border">Hint</span>
      <span className="hint-card__bar no-global-border" aria-hidden="true">
        <span className="hint-card__bar-fill no-global-border" style={{ width: `${boundedProgress * 100}%` }} />
      </span>
    </div>
  );
}

function SessionShell({ sessionData, onSessionDataChange }: SessionShellProps) {
  const { userPreferences } = useUserPreferences();
  const { isAuthenticated, user, signOut } = useAuth();
  const { startTour } = useTutorial();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [boardView, setBoardView] = useState(() => createBoardView(null));
  const [boardResetCount, setBoardResetCount] = useState(0);
  const [toggleEnabled, setToggleEnabled] = useState(false);
  const [importWindowOpen, setImportWindowOpen] = useState(false);
  const [loginWindowOpen, setLoginWindowOpen] = useState(false);
  const [evalGuessValue, setEvalGuessValue] = useState(0);
  const boardRef = useRef<TrainingBoardHandle | null>(null);
  const displayPositionIdRef = useRef<string | undefined>(undefined);
  const sessionDataRef = useRef<SessionData | null>(sessionData);
  const trainingPositions = sessionData?.trainingPositions ?? [];

  const hasTrainingPositions = trainingPositions.length > 0;
  const isComplete = hasTrainingPositions && currentIndex >= trainingPositions.length;
  const displayPosition = trainingPositions[Math.min(currentIndex, Math.max(trainingPositions.length - 1, 0))] ?? null;
  const boardOrientation = getBoardOrientation(boardView.orientationFen || displayPosition?.fen || STARTING_FEN);
  const boardDisabled = isComplete || !displayPosition;
  const boardKey = `session-shell-board:${boardOrientation}:${boardResetCount}`;
  const gamemode: GameMode = sessionData?.gamemode ?? DEFAULT_GAMEMODE;
  const activeBoardFen = boardView.fen || displayPosition?.fen || STARTING_FEN;

  displayPositionIdRef.current = displayPosition?.id;
  sessionDataRef.current = sessionData;

  // Reset board snapshot whenever the active position changes.
  useEffect(() => {
    setBoardView(createBoardView(displayPosition));
  }, [displayPosition?.id]);

  // Mode-agnostic annotation reset on position change.
  useEffect(() => {
    boardRef.current?.clearAnnotations();
    setEvalGuessValue(0);
  }, [displayPosition?.id]);

  // Clear the training queue whenever the gamemode actually changes (skip
  // the initial mount). Each mode is meant to source its own positions, so
  // carrying over a queue from the previous mode is rarely what the user
  // wants — e.g. analysis positions shouldn't auto-feed into puzzle mode.
  // Exception: bulk imports (importSessionData) may legitimately swap mode
  // and queue together — those set suppressNextGamemodeClearRef so the
  // freshly-imported positions survive the gamemode swap.
  const previousGamemodeRef = useRef(gamemode);
  const suppressNextGamemodeClearRef = useRef(false);
  useEffect(() => {
    if (previousGamemodeRef.current === gamemode) {
      return;
    }
    previousGamemodeRef.current = gamemode;
    if (suppressNextGamemodeClearRef.current) {
      suppressNextGamemodeClearRef.current = false;
      return;
    }
    setCurrentIndex(0);
    setBoardView(createBoardView(null));
    setBoardResetCount((previous) => previous + 1);
    boardRef.current?.clearAnnotations();
    if (sessionData?.trainingPositions) {
      onSessionDataChange({ ...sessionData, trainingPositions: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gamemode]);

  // While the puzzle miner is still hunting for the first position, keep the
  // board alive with a looping demo game. Flips off the moment the first puzzle
  // lands (trainingPositions becomes non-empty) or mining finishes empty.
  const isMiningFirstPuzzle =
    gamemode === "train" &&
    (sessionData?.pgnStream?.length ?? 0) > 0 &&
    trainingPositions.length === 0 &&
    sessionData?.puzzleMiningCompleted !== true;

  useBoardDemoLoop(boardRef, isMiningFirstPuzzle);

  function goToTrainingPosition(nextIndex: number) {
    if (!hasTrainingPositions) {
      return;
    }
    const boundedIndex = Math.min(Math.max(nextIndex, 0), trainingPositions.length - 1);
    setCurrentIndex(boundedIndex);
    setBoardView(createBoardView(trainingPositions[boundedIndex]));
  }

  function handlePreviousPosition() {
    goToTrainingPosition(currentIndex - 1);
  }

  function handleNextPosition() {
    goToTrainingPosition(currentIndex + 1);
  }

  function handleFeedback(fenAfterFeedback: string) {
    void fenAfterFeedback;
  }

  function handleToggle() {
    setToggleEnabled((previous) => !previous);
  }

  function importSessionData() {
    const nextSessionData = {
      ...(structuredClone(SESSION_DATA) as SessionData),
      gamemode,
    };
    const positions = nextSessionData.trainingPositions ?? [];

    onSessionDataChange(nextSessionData);
    setCurrentIndex(0);
    setBoardView(createBoardView(positions[0] ?? null));
    setBoardResetCount((previous) => previous + 1);
  }

  const appendTrainingPosition = useCallback(
    (position: ShrunkTrainingPosition) => {
      // The miner emits one position at a time. Keep the session snapshot in
      // step synchronously so back-to-back emissions do not overwrite an
      // earlier candidate while React is still scheduling the parent update.
      const currentSessionData = sessionDataRef.current ?? {};
      const nextSessionData: SessionData = {
        ...currentSessionData,
        trainingPositions: [...(currentSessionData.trainingPositions ?? []), position],
      };
      sessionDataRef.current = nextSessionData;
      onSessionDataChange(nextSessionData);
    },
    [onSessionDataChange],
  );

  const updateSessionData = useCallback(
    (patch: Partial<SessionData>) => {
      const currentSessionData = sessionDataRef.current ?? {};
      const changed = Object.entries(patch).some(
        ([key, value]) => currentSessionData[key as keyof SessionData] !== value,
      );
      if (!changed) {
        return;
      }
      const nextSessionData: SessionData = { ...currentSessionData, ...patch };
      sessionDataRef.current = nextSessionData;
      onSessionDataChange(nextSessionData);
    },
    [onSessionDataChange],
  );

  const modeCtx: ModeContext = {
    boardRef,
    currentPosition: displayPosition,
    boardFen: activeBoardFen,
    getCurrentPositionId: () => displayPositionIdRef.current,
    appendTrainingPosition,
    updateSessionData,
    sessionData,
    onSessionDataChange,
  };

  return (
    <main className="main-page">
      <ActiveMode key={gamemode} ctx={modeCtx} gamemode={gamemode}>
        {({ view, onMoveSubmit }) => {
          function handleBoardMoveSubmit(userAnswer: string, fenAfterMove: string) {
            if (!displayPosition || isComplete) {
              return;
            }
            if (fenAfterMove) {
              setBoardView((current) => ({ ...current, fen: fenAfterMove }));
            }
            try {
              void onMoveSubmit(userAnswer, fenAfterMove);
            } catch (error) {
              console.error("Mode move handler threw:", error);
              setBoardView(createBoardView(displayPosition));
              setBoardResetCount((previous) => previous + 1);
            }
          }

          function handleResetPosition() {
            // Always wipe the board's visual state so any in-progress moves
            // (e.g. a wrong puzzle answer) are reverted to the original FEN.
            if (displayPosition) {
              setBoardView(createBoardView(displayPosition));
              setBoardResetCount((previous) => previous + 1);
            }
            if (view.onReset) {
              view.onReset();
              return;
            }
            goToTrainingPosition(0);
          }

          return (
            <>
              {view.showHeader !== false ? (
                <header className="page-headers">
                  <div className="header-left no-global-border">
                    <div className="logo">
                      <img src="/images/logoBackgroundRemoved.png" alt="Chess Hyrax" className="logo__image" />
                    </div>
                    <div data-tour="login" className="header-auth no-global-border">
                      {isAuthenticated ? (
                        <>
                          <span className="header-auth__user no-global-border">
                            {user?.email}
                          </span>
                          <TextButton text="logout" onClick={() => { void signOut(); }} />
                        </>
                      ) : (
                        <TextButton text="login" onClick={() => setLoginWindowOpen(true)} />
                      )}
                      <LoginWindow open={loginWindowOpen} onClose={() => setLoginWindowOpen(false)} onAuthenticated={() => setLoginWindowOpen(false)} />
                    </div>
                    <TextButton text="tutorial" onClick={() => startTour()} />
                  </div>
                  {/* <div><TutorialTestButton /></div> */}

                  {/* <TextButton text="import session Data" onClick={importSessionData} /> */}
                  <div className="import-session-anchor" data-tour="import-games">
                    <TextButton text="import games" onClick={() => setImportWindowOpen((previous) => !previous)} />
                    <ImportGamesWindow open={importWindowOpen} onClose={() => setImportWindowOpen(false)} sessionData={sessionData} onSessionDataChange={onSessionDataChange} />
                  </div>
                  <div className="header-right no-global-border">
                    <div className="simplified-view-container no-global-border">
                    <span className ="simplified-view-title no-global-border">Simplified View</span>
                    <ToggleButton enabled={toggleEnabled} onToggle={handleToggle} />
                    </div>
                  </div>
                </header> 
              ) : null}

              <section className="layout">
                <section className="board-shell">
                  <div className="board-row">
                    <div className="board-left-rail no-global-border">
                      <div className="prompt-banner">{view.promptText || "Mock prompt banner"}</div>
                      <HintHud progress={view.hintHud?.progress ?? 0} />
                    </div>

                      {view.timer ? <div className={`board-timer board-timer--${view.timer.phase}`}>{formatTimer(view.timer.remainingMs)}</div> :  null }
                      {/* <div className="board-timer board-timer--idle ">2:34</div> */}
                    <div className="board-stage" data-tour="board">
                      <TrainingBoard key={boardKey} ref={boardRef} positionId={displayPosition?.id} fen={view.initialBoardFen || boardView.fen || displayPosition?.fen || STARTING_FEN} orientation={boardOrientation} disabled={boardDisabled || Boolean(view.disableBoard)} onMoveSubmit={handleBoardMoveSubmit} onFeedback={handleFeedback} />
                    </div>

                    <div className="board-right-rail no-global-border">
                    <ScoreHud
                      index={currentIndex+1}
                      total={view.scoreHud?.total ?? 0}
                      streak={view.scoreHud?.streak ?? 0}
                    />
                    </div>
                  </div>

                  {view.showNavigation !== false ? (
                    <div className="capsule-controls">
                      <PreviousButton
                        onClick={() => {
                          view.onBeforeNavigate?.();
                          handlePreviousPosition();
                        }}
                      />
                      <NextButton
                        className={view.controlFlash?.next ? "capsule-arrow--flash-success" : ""}
                        onClick={() => {
                          view.onBeforeNavigate?.();
                          handleNextPosition();
                        }}
                      />
                      <ResetButton
                        className={view.controlFlash?.reset ? "capsule-arrow--flash-danger" : ""}
                        onClick={handleResetPosition}
                      />
                    </div>
                  ) : null}
                </section>

                {view.showSidebar !== false ? (
                  <aside className="board-sidebar">
                    <AnalysisWindow sessionData={sessionData} onSessionDataChange={onSessionDataChange} />
                    <SettingsWindow trainingPositions={trainingPositions} sessionData={sessionData} onSessionDataChange={onSessionDataChange} />
                    <StatsWindow sessionData={sessionData} userPreferences={userPreferences} />
                    <StockfishWindow sessionData={sessionData} />
                    <div className="sidebar-privacy no-global-border">
                      <a className="sidebar-privacy__link no-global-border" href="/privacy">Privacy Policy</a>
                      <a className="sidebar-privacy__link no-global-border" href="/terms">Terms of Service</a>
                      <a className="sidebar-privacy__link no-global-border" href="/constants">Constants</a>
                    </div>
                  </aside>
                ) : null}
              </section>
            </>
          );
        }}
      </ActiveMode>
    </main>
  );
}

export default SessionShell;
