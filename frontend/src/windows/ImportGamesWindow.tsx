import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  DEFAULT_POSITION_FILTERS,
  DEFAULT_TRAINING_RUN_TYPE,
  type PuzzleTags,
  type SessionData,
  type TrainingRunType,
} from "../types";
import { importChessComGames } from "../api/chesscomapi";
import { ImportLichessGames } from "../api/lichessapi";
import { TextButton } from "../components";
import { PickaxeAnimation } from "../PickaxeAnimation";
import { BlurSpotlight, type SpotlightRect } from "../tutorial/BlurSpotlight";
import { Chess } from "chess.js";

type ImportChessComGamesWindowProps = {
  open: boolean;
  onClose: () => void;
  sessionData: SessionData | null;
  onSessionDataChange: (sessionData: SessionData | null) => void;
};

const TIME_CONTROL_OPTIONS = ["bullet", "blitz", "rapid"] as const;
type TimeControlOption = (typeof TIME_CONTROL_OPTIONS)[number];
const TRAINING_RUN_OPTIONS = ["train", "rush"] as const;

function getPositionFiltersForTrainingRun(trainingRunType: TrainingRunType): PuzzleTags[] {
  return trainingRunType === "rush" ? ["hard"] : [...DEFAULT_POSITION_FILTERS];
}

function getTrainingRunType(sessionData: SessionData | null): TrainingRunType {
  if (sessionData?.trainingRunType) {
    return sessionData.trainingRunType;
  }
  return sessionData?.positionFilters?.includes("hard") ? "rush" : DEFAULT_TRAINING_RUN_TYPE;
}

type Mode = "chesscom" | "lichess";

function ImportGamesWindow({ open, onClose, sessionData, onSessionDataChange }: ImportChessComGamesWindowProps) {
  const now = new Date();
  const [username, setUsername] = useState("");
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [mode, setMode] = useState<Mode>("chesscom");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Outcome of the most recent fetch, surfaced in the status card.
  const [fetchState, setFetchState] = useState<"idle" | "loading" | "empty" | "error">("idle");
  const [timeControls, setTimeControls] = useState<Record<TimeControlOption, boolean>>({
    bullet: false,
    blitz: false,
    rapid: false,
  });
  const [trainingRunType, setTrainingRunType] = useState<TrainingRunType>(() => getTrainingRunType(sessionData));

   function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
    setFetchState("idle");
  }

  const isChesscom = mode === "chesscom";
  // Centered-modal + blur spotlight, mirroring the tutorial test popup.
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [hole, setHole] = useState<SpotlightRect | null>(null);

  function CautionSign() {
    return (
      <span className="no-global-border" style={{ fontSize: "1.2rem" }} aria-hidden="true">
        ⚠
      </span>
    );
  }

  function handleToggleTimeControl(option: TimeControlOption) {
    setTimeControls((previous) => ({ ...previous, [option]: !previous[option] }));
  }

  function handleTrainingRunTypeChange(option: TrainingRunType) {
    setTrainingRunType(option);
  }

  const isResumeFetch = sessionData?.isResumeFetch ?? false;
  const isMining = sessionData?.puzzleMiningCompleted === false;
  const minedPositionCount = sessionData?.trainingPositions?.length ?? 0;

  // Status card shown beside the mining animation. Priority: hard errors, then
  // positions found, then live mining, then the fetch outcome (loading / empty).
  type StatusCard = { tone: "info" | "success" | "danger"; title: string; detail: string };
  let statusCard: StatusCard | null = null;
  if (fetchState === "error") {
    statusCard = { tone: "danger", title: "Fetch failed", detail: "Couldn't reach the server — try again." };
  } else if (minedPositionCount > 0) {
    statusCard = {
      tone: "success",
      title: `${minedPositionCount} position${minedPositionCount === 1 ? "" : "s"} found`,
      detail: isMining ? "You can begin training, will keep digging…" : "ready to train",
    };
  } else if (isMining) {
    statusCard = { tone: "info", title: "Mining", detail: "scanning your games for mistakes…" };
  } else if (fetchState === "loading") {
    statusCard = { tone: "info", title: "Fetching games", detail: "contacting the server…" };
  } else if (fetchState === "empty") {
    statusCard = { tone: "info", title: "No games found", detail: `Nothing for ${String(month).padStart(2, "0")}/${year}.` };
  }

  useEffect(() => {
    if (!open) {
      return;
    }
    setTrainingRunType(getTrainingRunType(sessionData));
  }, [open, sessionData]);

  async function runImport() {
    const selectedTimeControls = (Object.entries(timeControls) as [TimeControlOption, boolean][]).filter(([, enabled]) => enabled).map(([key]) => key);
    const positionFilters = getPositionFiltersForTrainingRun(trainingRunType);
    setFetchState("loading");
    try {
      const result = isChesscom
        ? await importChessComGames(username, month, year, isResumeFetch, selectedTimeControls)
        : await ImportLichessGames(username, month, year, isResumeFetch, selectedTimeControls);
      onSessionDataChange({
        ...(sessionData ?? {}),
        isResumeFetch: !result.monthExhausted,
        positionFilters,
        trainingRunType,
        pgnStream: result.pgns,
        username,
      });
      setFetchState(result.pgns.length === 0 ? "empty" : "idle");
    } catch (caught) {
      console.error("Import failed:", caught);
      setFetchState("error");
    }
  }

  function handleFetchGames() {
    void runImport();
  }

  function handleFetchMore() {
    if (!isResumeFetch) {
      return;
    }
    void runImport();
  }

  const measure = useCallback(() => {
    const element = dialogRef.current;
    if (!element) {
      return;
    }
    const rect = element.getBoundingClientRect();
    setHole({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
  }, []);

  // Measure the dialog once mounted (before paint, so the blur frames it without
  // a flash) and keep it aligned on resize.
  useLayoutEffect(() => {
    if (!open) {
      setHole(null);
      return;
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, measure]);

  if (!open) {
    return null;
  }

  return createPortal(
    <>
      <BlurSpotlight hole={hole} padding={0} blurPx={5} dim={0.45} zIndex={1000} />
      <div className="tutorial-modal" role="dialog" aria-modal="true" aria-label="Import Games">
        <div className="tutorial-modal__dialog" ref={dialogRef}>
          <div className="tutorial-modal__titlebar">
            <span className="tutorial-modal__title">Import Games</span>
            <button type="button" className="tutorial-modal__close" aria-label="Close" onClick={onClose}>
              ×
            </button>
          </div>
          
          <div className="login-modes no-global-border"  role="tablist" aria-label="Auth mode">
            <button
              type="button"
              role="tab"
              aria-selected={isChesscom}
              style={{ borderTop: "none"}}
              className={`login-mode${isChesscom ? " login-mode--active" : ""}`}
              onClick={() => switchMode("chesscom")}
            >
              Chess.com
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={!isChesscom}
              style={{ borderTop: "none"}}
              className={`login-mode${!isChesscom ? " login-mode--active" : ""}`}
              onClick={() => switchMode("lichess")}
            >
              LiChess
            </button>
          </div>
          <div className="tutorial-modal__body">
            <label className="import-session-field no-global-border">
              
              <span className="import-session-field__label no-global-border ">{isChesscom ? "Chess.com Username" : "Lichess Username"}</span>
              <input type="text" className="import-session-field__input " value={username} onChange={(event) => setUsername(event.target.value)} placeholder="username" autoComplete="off" spellCheck={false} />
            </label>

            <label className="import-session-field no-global-border">
              <span className="import-session-field__label no-global-border">Month: {String(month).padStart(2, "0")}</span>
              <input type="range" min={1} max={12} step={1} value={month} onChange={(event) => setMonth(Number(event.target.value))} />
            </label>

            <label className="import-session-field no-global-border">
              <span className="import-session-field__label no-global-border">Year: {year}</span>
              <input type="range" min={2008} max={now.getFullYear()} step={1} value={year} onChange={(event) => setYear(Number(event.target.value))} />
            </label>

            <fieldset className="import-session-fieldset">
              <legend className="import-session-field__label no-global-border">Time Controls:</legend>
              <div className="import-session-checkboxes no-global-border">
                {TIME_CONTROL_OPTIONS.map((option) => (
                  <label key={option} className="import-session-checkbox no-global-border">
                    <input type="checkbox" checked={timeControls[option]} onChange={() => handleToggleTimeControl(option)} />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="import-session-fieldset">
              <legend className="import-session-field__label no-global-border">Training Run Type:</legend>
              <div className="import-session-checkboxes no-global-border">
                {TRAINING_RUN_OPTIONS.map((option) => (
                  <label
                    key={option}
                    className={`import-session-checkbox no-global-border${option === "rush" ? " import-session-checkbox--hard" : ""}`}
                  >
                    <input type="radio" name="training-run-type" checked={trainingRunType === option} onChange={() => handleTrainingRunTypeChange(option)} />
                    <span>{option === "rush" ? <><CautionSign /> Rush</> : "Train"}</span>
                  </label>
                ))}
              </div>
              {/* Always rendered (space reserved) so toggling "rush" doesn't
                  resize the dialog and desync the blur clip-out. */}
              <p
                className={`import-session-warning no-global-border${trainingRunType === "rush" ? "" : " import-session-warning--hidden"}`}
                role="alert"
                aria-hidden={trainingRunType !== "rush"}
              >
                <CautionSign /> may take up to 10 mins to get positions
              </p>
              {statusCard ? (
                // Fixed-height row: status card fills the whitespace on the left,
                // the pickaxe animation sits on the right while mining. The fixed
                // height + clipped animation keep the dialog (and blur clip-out)
                // from twitching as the frames change size.
                <div className="import-status-row no-global-border">
                  <div className={`import-status-card import-status-card--${statusCard.tone}`}>
                    <span className="import-status-card__title">{statusCard.title}</span>
                    <span className="import-status-card__detail">{statusCard.detail}</span>
                  </div>
                  {isMining ? (
                    <div className="import-status-anim no-global-border">
                      <PickaxeAnimation fontSize="3px" />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </fieldset>
          </div>

          <div className="tutorial-modal__footer">
            <TextButton text="Fetch Games" onClick={handleFetchGames} />
            <span
              role="button"
              tabIndex={isResumeFetch ? 0 : -1}
              className={` no-global-border import-session-fetch-more${isResumeFetch ? " import-session-fetch-more--active" : ""}`}
              onClick={handleFetchMore}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleFetchMore();
                }
              }}
              aria-disabled={!isResumeFetch}
            >
              Fetch More
            </span>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

export default ImportGamesWindow;
