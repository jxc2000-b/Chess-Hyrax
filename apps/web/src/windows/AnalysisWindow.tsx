import { useEffect, useState } from "react";
import type { SessionData } from "../types";
import { parsePgnStreamToGames } from "../analysis/parseGames";
import { BouncingEllipsis } from "../components";

type AnalysisWindowProps = {
  sessionData: SessionData | null;
  onSessionDataChange: (sessionData: SessionData | null) => void;
};

type StepStatus = "pending" | "active" | "done";

type PipelineStep = {
  key: string;
  label: string;
  status: StepStatus;
};

function Step({ step, pushRight = false }: { step: PipelineStep; pushRight?: boolean }) {
  return (
    <div className={`analysis-step analysis-step--${step.status}${pushRight ? " analysis-step--push" : ""}`}>
      <span className="analysis-step__label">{step.label}</span>
    </div>
  );
}

function AnalysisWindow({ sessionData, onSessionDataChange }: AnalysisWindowProps) {
  const [isParsing, setIsParsing] = useState(false);

  const pgnStream = sessionData?.pgnStream;
  const username = sessionData?.username;
  const gameCount = sessionData?.games?.length ?? 0;
  const isPuzzleMining = sessionData?.puzzleMiningCompleted === false;
  const minedPositionCount = sessionData?.trainingPositions?.length ?? 0;
  const hasImport = (pgnStream?.length ?? 0) > 0 || gameCount > 0;
  const gamesAnalyzed = sessionData?.gamesAnalyzed ?? 0;
  const gamesTotal = sessionData?.gamesTotal ?? 0;

  useEffect(() => {
    if (!pgnStream || pgnStream.length === 0) {
      return;
    }
    setIsParsing(true);

    // Yield to the event loop so the indicator paints before the
    // synchronous parse runs.
    const parseHandle = window.setTimeout(() => {
      const games = parsePgnStreamToGames(pgnStream, username);
      onSessionDataChange({ ...(sessionData ?? {}), games });
      setIsParsing(false);
    }, 0);

    return () => {
      window.clearTimeout(parseHandle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pgnStream]);

  // The window is the live view of a three-stage data pipeline:
  // import the PGN stream → parse it into games → mine puzzle positions.
  // Each stage advances pending → active → done independently.
  const steps: PipelineStep[] = [
    { key: "import", label: "Import", status: hasImport ? "done" : "pending" },
    {
      key: "parse",
      label: "Parsing",
      status: isParsing ? "active" : gameCount > 0 ? "done" : "pending",
    },
    {
      key: "mine",
      label: "Mining",
      status: isPuzzleMining ? "active" : minedPositionCount > 0 ? "done" : "pending",
    },
  ];

  const busy = isParsing || isPuzzleMining;

  // Mine connector fill, 0–1: live ratio of games analyzed while mining, full
  // once the run completes, empty before it starts.
  let mineProgress: number;
  if (isPuzzleMining) {
    mineProgress = gamesTotal > 0 ? Math.min(1, gamesAnalyzed / gamesTotal) : 0;
  } else if (minedPositionCount > 0 || (gamesTotal > 0 && gamesAnalyzed >= gamesTotal)) {
    mineProgress = 1;
  } else {
    mineProgress = 0;
  }

  // Headline + an optional big metric readout for the dominant current state.
  let headline: string;
  let metricValue: number | null = null;
  let metricLabel: string | null = null;
  if (isParsing) {
    headline = "Parsing games";
  } else if (minedPositionCount > 0) {
    headline = "Positions ready";
    metricValue = minedPositionCount;
    metricLabel = minedPositionCount === 1 ? "puzzle" : "puzzles";
  } else if (isPuzzleMining) {
    headline = "Mining positions";
    if (gamesTotal > 0) {
      metricValue = gamesAnalyzed;
      metricLabel = `of ${gamesTotal} games`;
    } else if (gameCount > 0) {
      metricValue = gameCount;
      metricLabel = "games scanned";
    }
  } else if (gameCount > 0) {
    headline = "Games parsed";
    metricValue = gameCount;
    metricLabel = gameCount === 1 ? "game" : "games";
  } else if (sessionData) {
    headline = "No games found";
  } else {
    headline = "Awaiting import";
  }

  const lampState = busy ? "busy" : hasImport ? "ready" : "idle";

  return (
    <section className="analysis-shell" aria-label="Analysis">
      <div className="analysis-header no-global-border-children">
        <span className="analysis-title">Status</span>
        <span className={`analysis-lamp analysis-lamp--${lampState}`} aria-hidden="true" />
      </div>

      {/* A normal progress bar tracking games analyzed during mining, with the
          three stage markers sitting beneath it. Import and Parse are
          near-instant so they huddle left; Mine is pushed to the right. */}
      <div className="analysis-pipeline no-global-border-children" aria-hidden="true">
        <div className="analysis-bar">
          <span className="analysis-bar__fill" style={{ width: `${Math.round(mineProgress * 100)}%` }} />
        </div>
        <div className="analysis-steps">
          <Step step={steps[0]} />
          <Step step={steps[1]} />
          <Step step={steps[2]} pushRight />
        </div>
      </div>

      <div className="analysis-readout no-global-border-children">
        <span className="analysis-readout__headline">
          {headline}
          {busy ? <BouncingEllipsis /> : null}
        </span>
        {metricValue !== null ? (
          <span className="analysis-readout__metric">
            <span className="analysis-readout__value">{metricValue}</span>
            <span className="analysis-readout__unit">{metricLabel}</span>
          </span>
        ) : null}
      </div>
    </section>
  );
}
// this component will primarily consume sessionData/engine output and surface
// per-position analysis (best line, evaluation, motifs). Scaffolded shell only.
export default AnalysisWindow;
