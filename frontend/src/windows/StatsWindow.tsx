import type { SessionData } from "../types";
import { useState } from "react";
import type { UserPreferences } from "../userPreferencesContext";

const MODE_KEYS = ["muted", "rush", "overstimulation"] as const;
type ModeKey = (typeof MODE_KEYS)[number];

const MODE_LABELS: Record<ModeKey, string> = {
  muted: "muted mode",
  rush: "rush mode",
  overstimulation: "overstimulation mode",
};

type StatsWindowProps = {
  sessionData: SessionData | null;
  userPreferences: UserPreferences;
};

type VerticalToggleProps = {
  enabled: boolean;
  onToggle: () => void;
  label: string;
};

function VerticalToggle({ enabled, onToggle, label }: VerticalToggleProps) {
  // ({something}: prop) is a destructuring pattern
  return (
    <div className="mode-block">
      <button type="button" role="switch" aria-checked={enabled} aria-label={label} className={`vertical-toggle${enabled ? " vertical-toggle--on" : ""}`} onClick={onToggle}>
        <span className="vertical-toggle__track">
          <span className="vertical-toggle__thumb" />
        </span>
      </button>
      <span className="mode-label">{label}</span>
    </div>
  );
}

// Accuracy (%) and Elo over the same trailing days, drawn as two interposed
// lines sharing the x-axis but each scaled to its own y-range.
const ACCURACY_HISTORY = [54, 61, 58, 70, 67, 73, 78];
const ELO_HISTORY = [1180, 1205, 1190, 1240, 1232, 1270, 1298];

const GRAPH_WIDTH = 280;
const GRAPH_HEIGHT = 88;
const GRAPH_PAD_X = 12;
const GRAPH_PAD_TOP = 12;
const GRAPH_PAD_BOTTOM = 16;

type GraphPoint = { x: number; y: number; value: number };

function buildLine(series: ReadonlyArray<number>, yMin: number, yMax: number): GraphPoint[] {
  const innerHeight = GRAPH_HEIGHT - GRAPH_PAD_TOP - GRAPH_PAD_BOTTOM;
  const span = yMax - yMin || 1;
  const xStep = (GRAPH_WIDTH - GRAPH_PAD_X * 2) / Math.max(series.length - 1, 1);

  return series.map((value, index) => {
    const x = GRAPH_PAD_X + index * xStep;
    const y = GRAPH_PAD_TOP + (1 - (value - yMin) / span) * innerHeight;
    return { x, y, value };
  });
}

function toPolyline(points: GraphPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function toAreaPath(points: GraphPoint[]): string {
  const baseline = GRAPH_HEIGHT - GRAPH_PAD_BOTTOM;
  return `M${points[0].x},${baseline} L${toPolyline(points)} L${points[points.length - 1].x},${baseline} Z`;
}

function AccuracyGraph() {
  const eloMin = Math.min(...ELO_HISTORY);
  const eloMax = Math.max(...ELO_HISTORY);
  // Pad the elo range so the line doesn't hug the top/bottom edges.
  const eloPad = Math.max(15, Math.round((eloMax - eloMin) * 0.3));

  const accuracyPoints = buildLine(ACCURACY_HISTORY, 0, 100);
  const eloPoints = buildLine(ELO_HISTORY, eloMin - eloPad, eloMax + eloPad);
  const latestAccuracy = ACCURACY_HISTORY[ACCURACY_HISTORY.length - 1];
  const latestElo = ELO_HISTORY[ELO_HISTORY.length - 1];

  const innerHeight = GRAPH_HEIGHT - GRAPH_PAD_TOP - GRAPH_PAD_BOTTOM;
  const gridLines = [0.25, 0.5, 0.75].map((t) => GRAPH_PAD_TOP + t * innerHeight);

  return (
    <div className="perf-graph no-global-border-children">
      <div className="perf-graph__head">
        <span className="perf-graph__title">Performance · {ACCURACY_HISTORY.length}d</span>
        <div className="perf-graph__legend">
          <span className="perf-legend perf-legend--accuracy">
            <i />acc
          </span>
          <span className="perf-legend perf-legend--elo">
            <i />elo
          </span>
        </div>
      </div>
      <svg className="perf-graph__svg" viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`} aria-hidden="true">
        {gridLines.map((y, index) => (
          <line key={index} className="perf-graph__grid" x1={GRAPH_PAD_X} y1={y} x2={GRAPH_WIDTH - GRAPH_PAD_X} y2={y} />
        ))}
        <line className="perf-graph__axis" x1={GRAPH_PAD_X} y1={GRAPH_HEIGHT - GRAPH_PAD_BOTTOM} x2={GRAPH_WIDTH - GRAPH_PAD_X} y2={GRAPH_HEIGHT - GRAPH_PAD_BOTTOM} />
        <path className="perf-area perf-area--elo" d={toAreaPath(eloPoints)} />
        <path className="perf-area perf-area--accuracy" d={toAreaPath(accuracyPoints)} />
        <polyline className="perf-line perf-line--elo" points={toPolyline(eloPoints)} />
        <polyline className="perf-line perf-line--accuracy" points={toPolyline(accuracyPoints)} />
        {eloPoints.map((point, index) => (
          <circle key={`elo-${index}`} className="perf-dot perf-dot--elo" cx={point.x} cy={point.y} r="2" />
        ))}
        {accuracyPoints.map((point, index) => (
          <circle key={`acc-${index}`} className="perf-dot perf-dot--accuracy" cx={point.x} cy={point.y} r="2" />
        ))}
      </svg>
      <div className="perf-graph__stats">
        <div className="perf-stat perf-stat--accuracy">
          <span className="perf-stat__value">{latestAccuracy}%</span>
          <span className="perf-stat__label">accuracy</span>
        </div>
        <div className="perf-stat perf-stat--elo">
          <span className="perf-stat__value">{latestElo}</span>
          <span className="perf-stat__label">elo</span>
        </div>
      </div>
    </div>
  );
}

// Training intensity per day, 0 (none) – 4 (heaviest). 70 days = 10 weeks,
// laid out column-by-column so each column is one week and the final cell is
// today (bottom-right).
const ACTIVITY_DAYS = [
  0, 2, 1, 0, 3, 1, 4,
  1, 0, 2, 3, 1, 0, 2,
  3, 1, 0, 1, 2, 4, 1,
  0, 0, 2, 1, 3, 2, 1,
  2, 3, 1, 0, 4, 1, 2,
  0, 1, 2, 1, 3, 0, 1,
  4, 2, 1, 3, 0, 2, 1,
  2, 1, 0, 3, 1, 2, 4,
  2, 1, 0, 3, 1, 2, 4,
  3, 2, 4, 1, 2, 3, 2,
];
const HEATMAP_WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function calculateStreak(days: ReadonlyArray<number>): number {
  let count = 0;
  for (let i = days.length - 1; i >= 0; i -= 1) {
    if (days[i] <= 0) {
      break;
    }
    count += 1;
  }
  return count;
}

function StreakStrip() {
  const streak = calculateStreak(ACTIVITY_DAYS);

  return (
    <div className="heatmap no-global-border-children">
      <div className="heatmap__header">
        <span className="heatmap__label">Activity</span>
        <span className="heatmap__count">{`${streak}-day streak`}</span>
      </div>
      <div className="heatmap__body">
        <div className="heatmap__weekdays" aria-hidden="true">
          {HEATMAP_WEEKDAYS.map((day, index) => (
            <span key={index} className="heatmap__weekday">
              {day}
            </span>
          ))}
        </div>
        <div className="heatmap__grid" aria-label={`Training activity, last ${ACTIVITY_DAYS.length} days`}>
          {ACTIVITY_DAYS.map((level, index) => (
            <span
              key={index}
              className={`heatmap__cell heatmap__cell--l${level}`}
              title={level > 0 ? `${level} session${level === 1 ? "" : "s"}` : "no training"}
            />
          ))}
        </div>
      </div>
      <div className="heatmap__legend">
        <span>Less</span>
        <span className="heatmap__legend-cells">
          {[0, 1, 2, 3, 4].map((level) => (
            <span key={level} className={`heatmap__cell heatmap__cell--l${level}`} />
          ))}
        </span>
        <span>More</span>
      </div>
    </div>
  );
}

function ExternalLinkIcon() {
  return (
    <svg className="chess-com-strip__icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M6 4H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2" />
      <path d="M9 2h5v5" />
      <path d="m7 9 7-7" />
    </svg>
  );
}

function ChessComStrip() {
  return (
    <div className="chess-com-strip no-global-border-children">
      <span className="chess-com-strip__text">Done training ?</span>
      <a className="chess-com-strip__link" href="https://www.chess.com" target="_blank" rel="noreferrer">
        <span>Chess.com</span>
        <ExternalLinkIcon />
      </a>
      <a className="chess-com-strip__link" href="https://lichess.org/" target="_blank" rel="noreferrer">
        <span>Lichess</span>
        <ExternalLinkIcon />
      </a>
    </div>
  );
}

function StatsWindow({ sessionData, userPreferences }: StatsWindowProps) {
  const [modes, setModes] = useState<Record<ModeKey, boolean>>({
    muted: false,
    rush: false,
    overstimulation: false,
  });
  function handleToggleMode(key: ModeKey) {
    setModes((previous) => ({ ...previous, [key]: !previous[key] })); //js overwrited dupe key after unpacking
  }
  return (
    <section className="stats-shell no-global-border" aria-label="Stats" data-tour="stats">
      {/* <div className="modes-shell">
        {MODE_KEYS.map((key) => (
          <VerticalToggle key={key} enabled={modes[key]} onToggle={() => handleToggleMode(key)} label={MODE_LABELS[key]} />
        ))}
      </div> */}
      {/* <div className="graph-shell" aria-label="Graph">
        <AccuracyGraph />
      </div> */}
      {/* <div className="streak-shell " aria-label="Streak">
        <StreakStrip />
      </div> */}
      <div className="chess-com-shell" aria-label="Chess.com">
        <ChessComStrip />
      </div>
    </section>
  );
}
// this component primarily uses userPreferences and sessionData states
// concerned primarily with users as entities.
export default StatsWindow;
