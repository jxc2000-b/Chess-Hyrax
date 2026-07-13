import { useEffect, useState } from "react";
import { DEFAULT_GAMEMODE, type GameMode, type SessionData, type ShrunkTrainingPosition } from "../types";

type SettingsWindowProps = {
  trainingPositions: ShrunkTrainingPosition[];
  sessionData: SessionData | null;
  onSessionDataChange: (sessionData: SessionData | null) => void;
};

const GAME_MODES: GameMode[] = ["puzzle", "analysis"];

const RATE_KEYS = ["a", "b", "c"] as const;
type RateKey = (typeof RATE_KEYS)[number];

const RATE_LABELS: Record<RateKey, string> = {
  a: "Hard",
  b: "Easy",
  c: "Forced Mate",
};

function Timer() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setSeconds((previous) => previous + 1);
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;

  return <span className="timer">{`${minutes}:${String(remainder).padStart(2, "0")}`}</span>;
}

function FilterIcon() {
  return (
    <svg className="filter__icon" width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M2 3h12l-4.5 5.5V13l-3 1V8.5L2 3z" />
    </svg>
  );
}

function CaretIcon({ open }: { open: boolean }) {
  //calling filterOpen as a prop {open: boolean} because it is outside of the setting-window's scope
  return (
    <svg className={`filter__caret${open ? " filter__caret--open" : ""}`} width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M4 6l4 4 4-4z" />
    </svg>
  );
}

type VerticalToggleProps = {
  enabled: boolean;
  onToggle: () => void;
  label: string;
};

function VerticalToggle({ enabled, onToggle, label }: VerticalToggleProps) {
  return (
    <div className="mode-block no-global-border">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={label}
        className={` vertical-toggle${enabled ? " vertical-toggle--on" : ""}`}
        onClick={onToggle}
      >
        <span className="vertical-toggle__track no-global-border">
          <span className="vertical-toggle__thumb " />
        </span>
      </button>
      <span className="mode-label no-global-border">{label}</span>
    </div>
  );
}

function SettingsWindow({ trainingPositions, sessionData, onSessionDataChange }: SettingsWindowProps) {
  void trainingPositions;
  const [filterOpen, setFilterOpen] = useState(false);
  const [rateOptions, setRateOptions] = useState<Record<RateKey, boolean>>({
    a: false,
    b: false,
    c: false,
  });

  const activeGamemode: GameMode = sessionData?.gamemode ?? DEFAULT_GAMEMODE;
  const hintsEnabled = sessionData?.hintsEnabled ?? true;

  function handleToggleFilter() {
    setFilterOpen((previous) => !previous);
  }

  function handleToggleRate(key: RateKey) {
    setRateOptions((previous) => ({ ...previous, [key]: !previous[key] }));
  }

  function handleSelectGamemode(next: GameMode) {
    // Mutually exclusive: re-clicking the active one is a no-op (can't turn
    // all of them off — something has to be active).
    if (next === activeGamemode) {
      return;
    }
    onSessionDataChange({ ...(sessionData ?? {}), gamemode: next });
  }

  function handleToggleHints() {
    onSessionDataChange({ ...(sessionData ?? {}), hintsEnabled: !hintsEnabled });
  }

  return (
    <section className="settings-shell no-global-border" aria-label="Settings">
      
      <ul className="settings-list" aria-label="Training attempts">
          <span className="analysis-title no-global-border">
         Settings 
        </span>
        </ul>
        <div className="enable-hints-block">
            <span className="hints-label no-global-border">Enable Hints? </span>        
            <button
              type="button"
              role="switch"
              aria-checked={hintsEnabled}
              aria-label={`Enable Hints?`}
              className={`horizontal-toggle no-global-border${hintsEnabled ? " horizontal-toggle--on" : ""}`}
              onClick={handleToggleHints}
            >
            <span className ="horizontal-toggle__track no-global-border">
              <span className="horizontal-toggle__thumb " />
            </span>
            </button>
        </div>
      {/* <div className="modes-shell ">
        {GAME_MODES.map((mode) => (
          <VerticalToggle
            key={mode}
            enabled={activeGamemode === mode}
            onToggle={() => handleSelectGamemode(mode)}
            label={mode}
          />
        ))}
      </div> */}

      {/* <div className="training-run-shell">
        <ul className="training-attempts" aria-label="Training attempts">
          Your Run
        </ul>
        <Timer />
      </div> */}

      <div className="rate-shell">
        <span className="rate-label no-global-border">Rate</span>
        <div className="rate-options no-global-border">
          {RATE_KEYS.map((key) => (
            <label key={key} className="rate-option no-global-border">
              <input type="checkbox" checked={rateOptions[key]} onChange={() => handleToggleRate(key)} />
              <span>{RATE_LABELS[key]}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="filter no-global-border">
        <button type="button" className="filter__trigger" onClick={handleToggleFilter} aria-expanded={filterOpen}>
          <span className="filter__left no-global-border">
            <FilterIcon />
            <span className="filter__label no-global-border">More Settings</span>
          </span>
          <CaretIcon open={filterOpen} />
        </button>
        {filterOpen ? (
          <div className="filter__panel ">
            <p>Placeholder filter options.</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
// this component primarily uses the trainingPositions state, concerned primarily with positions as entities.
// can apply rules to filter positions send feedback to DB move quality and motif accuracy
export default SettingsWindow;
