import { useState } from "react";
import type { SessionData } from "../types";

type StockfishWindowProps = {
  sessionData: SessionData | null;
};

const DEPTH_MIN = 1;
const DEPTH_MAX = 30;
const LINES_MIN = 1;
const LINES_MAX = 10;
const TIME_MIN = 100;
const TIME_MAX = 60_000;
const TIME_STEP = 100;

const MOCK_ENGINE_LINES = ["+0.32  ♘f3 ♞c6 ♗c4 ♝c5 ♔g1", "-0.15  ♕d2 ♛e7 ♖a3 ♜h6 ♗xc6", "+1.21  ♔g1 ♟e5 ♞c3 ♕h5 ♙f4", "M5     ♘e7+ ♚h8 ♕xh7+ ♚xh7 ♖h3#"];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function CpuIcon() {
  return (
    <svg className="engine__icon " width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true">
      <rect x="4" y="4" width="8" height="8" />
      <rect x="6.5" y="6.5" width="3" height="3" fill="currentColor" stroke="none" />
      <line x1="2" y1="6" x2="4" y2="6" />
      <line x1="2" y1="10" x2="4" y2="10" />
      <line x1="12" y1="6" x2="14" y2="6" />
      <line x1="12" y1="10" x2="14" y2="10" />
      <line x1="6" y1="2" x2="6" y2="4" />
      <line x1="10" y1="2" x2="10" y2="4" />
      <line x1="6" y1="12" x2="6" y2="14" />
      <line x1="10" y1="12" x2="10" y2="14" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg className="engine__icon" width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M9 0v2.2l1.4.6 1.6-1.5 1.7 1.7-1.5 1.6.6 1.4H16v2.4h-2.2l-.6 1.4 1.5 1.6-1.7 1.7-1.6-1.5-1.4.6V16H6.6v-2.2l-1.4-.6-1.6 1.5-1.7-1.7 1.5-1.6-.6-1.4H0V7.6h2.2l.6-1.4-1.5-1.6 1.7-1.7 1.6 1.5L6 3.8V0h3zM8 5.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2z" />
    </svg>
  );
}

function StockfishWindow({ sessionData }: StockfishWindowProps) {
  const [open, setOpen] = useState(false);
  const [depth, setDepth] = useState(15);
  const [lines, setLines] = useState(3);
  const [time, setTime] = useState(1000);

  function handleToggleOpen() {
    setOpen((previous) => !previous);
  }

  function adjustDepth(delta: number) {
    setDepth((previous) => clamp(previous + delta, DEPTH_MIN, DEPTH_MAX));
  }

  function adjustLines(delta: number) {
    setLines((previous) => clamp(previous + delta, LINES_MIN, LINES_MAX));
  }

  function adjustTime(delta: number) {
    setTime((previous) => clamp(previous + delta, TIME_MIN, TIME_MAX));
  }

  return (
    <section className="analysis-shell no-global-border" aria-label="Analysis">
      <div className="engine no-global-border">
        <button type="button" className="engine__trigger" onClick={handleToggleOpen} aria-expanded={open}>
          <span className="engine__left no-global-border">
            <CpuIcon />
            <span className="engine__label no-global-border">{`Engine: Stockfish 18 `}</span>
          </span>
        </button>
{/* 
        {open ? (
          <div className="engine__panel ">
            <div className="engine__row no-global-border">
              <span className="engine__row-label no-global-border">Depth</span>
              <button type="button" className="engine__step" onClick={() => adjustDepth(-1)} aria-label="Decrement depth">
                −
              </button>
              <span className="engine__value">{depth}</span>
              <button type="button" className="engine__step" onClick={() => adjustDepth(1)} aria-label="Increment depth">
                +
              </button>
            </div>

            <div className="engine__row no-global-border">
              <span className="engine__row-label no-global-border">Lines</span>
              <button type="button" className="engine__step" onClick={() => adjustLines(-1)} aria-label="Decrement lines">
                −
              </button>
              <span className="engine__value">{lines}</span>
              <button type="button" className="engine__step" onClick={() => adjustLines(1)} aria-label="Increment lines">
                +
              </button>
            </div>

            <div className="engine__row no-global-border">
              <span className="engine__row-label no-global-border">Time</span>
              <button type="button" className="engine__step" onClick={() => adjustTime(-TIME_STEP)} aria-label="Decrement time">
                −
              </button>
              <span className="engine__value">{`${time}ms`}</span>
              <button type="button" className="engine__step" onClick={() => adjustTime(TIME_STEP)} aria-label="Increment time">
                +
              </button>
            </div>

            <ul className="engine__lines" aria-label="Engine lines">
              {MOCK_ENGINE_LINES.map((line, index) => (
                <li key={index} className="engine__line">
                  {line}
                </li>
              ))}
            </ul>
          </div>
        ) : null} */}
      </div>
    </section>
  );
}
// this component uses the sessionData state
// it is not really concerned with any persistent data, may return loging only
export default StockfishWindow;
