// Tutorial engine + context. Holds the current step, exposes startTour() to the
// app, auto-starts once on first run (persisted in localStorage), and renders
// the dim spotlight + tooltip only while a tour is active so the tracking hook
// (and its listeners) impose no cost otherwise.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { TextButton } from "../components";
import { SpotlightCutout, type SpotlightRect } from "./SpotlightCutout";
import { useTrackedRect } from "./useTrackedRect";
import { TOUR_STEPS, type TourPlacement, type TourStep } from "./tourSteps";

const STORAGE_KEY = "chess-hyrax:tutorial-seen";
const AUTO_START_DELAY_MS = 500;

const TIP_WIDTH = 300;
const TIP_ESTIMATED_HEIGHT = 168;
const TIP_GAP = 14;
const VIEWPORT_MARGIN = 8;

type TutorialContextValue = {
  startTour: () => void;
};

const TutorialContext = createContext<TutorialContextValue | null>(null);

export function useTutorial(): TutorialContextValue {
  const value = useContext(TutorialContext);
  if (!value) {
    throw new Error("useTutorial must be used inside TutorialProvider");
  }
  return value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// Tooltip position from the target rect (or screen-centered when the target
// can't be found yet, so the tour is never stuck).
function tooltipPosition(rect: SpotlightRect | null, placement: TourPlacement): { top: number; left: number } {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  if (!rect) {
    return {
      left: viewportWidth / 2 - TIP_WIDTH / 2,
      top: viewportHeight / 2 - TIP_ESTIMATED_HEIGHT / 2,
    };
  }

  let top: number;
  let left: number;
  switch (placement) {
    case "top":
      top = rect.top - TIP_GAP - TIP_ESTIMATED_HEIGHT;
      left = rect.left + rect.width / 2 - TIP_WIDTH / 2;
      break;
    case "left":
      top = rect.top;
      left = rect.left - TIP_GAP - TIP_WIDTH;
      break;
    case "right":
      top = rect.top;
      left = rect.left + rect.width + TIP_GAP;
      break;
    case "bottom":
    default:
      top = rect.top + rect.height + TIP_GAP;
      left = rect.left + rect.width / 2 - TIP_WIDTH / 2;
      break;
  }

  return {
    left: clamp(left, VIEWPORT_MARGIN, viewportWidth - TIP_WIDTH - VIEWPORT_MARGIN),
    top: clamp(top, VIEWPORT_MARGIN, viewportHeight - TIP_ESTIMATED_HEIGHT - VIEWPORT_MARGIN),
  };
}

type TutorialOverlayProps = {
  step: TourStep;
  index: number;
  total: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
};

// Separate component so the tracking hook only mounts while a tour is active.
function TutorialOverlay({ step, index, total, onNext, onPrev, onSkip }: TutorialOverlayProps) {
  const rect = useTrackedRect(step.selector, true);
  const { top, left } = tooltipPosition(rect, step.placement ?? "bottom");
  const isLast = index + 1 >= total;

  return (
    <>
      <SpotlightCutout hole={rect} padding={8} dim={0.55} zIndex={1000} />
      {createPortal(
        <div
          className="tutorial-tip"
          style={{ top, left, width: TIP_WIDTH, zIndex: 1001 }}
          role="dialog"
          aria-label={step.title}
        >
          <div className="tutorial-tip__head">
            <span className="tutorial-tip__title">{step.title}</span>
            <span className="tutorial-tip__count">
              {index + 1} / {total}
            </span>
          </div>
          <p className="tutorial-tip__body">{step.body}</p>
          <div className="tutorial-tip__actions">
            <button type="button" className="tutorial-tip__skip" onClick={onSkip}>
              skip
            </button>
            <div className="tutorial-tip__nav">
              {index > 0 ? <TextButton text="back" onClick={onPrev} /> : null}
              <TextButton text={isLast ? "done" : "next"} onClick={onNext} />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

export function TutorialProvider({ children }: { children: ReactNode }) {
  const [stepIndex, setStepIndex] = useState<number | null>(null);
  const step = stepIndex !== null ? TOUR_STEPS[stepIndex] : null;

  const finish = useCallback(() => {
    setStepIndex(null);
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // localStorage unavailable (private mode etc.) — tour just won't persist.
    }
  }, []);

  const start = useCallback(() => {
    if (TOUR_STEPS.length > 0) {
      setStepIndex(0);
    }
  }, []);

  const next = useCallback(() => {
    setStepIndex((current) => {
      if (current === null) {
        return current;
      }
      if (current + 1 >= TOUR_STEPS.length) {
        return null;
      }
      return current + 1;
    });
  }, []);

  const prev = useCallback(() => {
    setStepIndex((current) => (current === null ? current : Math.max(0, current - 1)));
  }, []);

  // Auto-start once on first run. The short delay lets the shell mount its
  // targets first.
  useEffect(() => {
    let seen = true;
    try {
      seen = window.localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      seen = true;
    }
    if (seen) {
      return;
    }
    const timer = window.setTimeout(() => setStepIndex(0), AUTO_START_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  // Mark seen the moment a tour runs, and run any per-step setup.
  useEffect(() => {
    if (step === null) {
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
    step.before?.();
  }, [step]);

  const value = useMemo<TutorialContextValue>(() => ({ startTour: start }), [start]);

  return (
    <TutorialContext.Provider value={value}>
      {children}
      {step !== null && stepIndex !== null ? (
        <TutorialOverlay
          step={step}
          index={stepIndex}
          total={TOUR_STEPS.length}
          onNext={next}
          onPrev={prev}
          onSkip={finish}
        />
      ) : null}
    </TutorialContext.Provider>
  );
}
