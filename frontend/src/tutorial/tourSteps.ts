// The tutorial script. Each step points at a real element via a `data-tour`
// attribute; the overlay measures it and positions the spotlight + tooltip.
// `before` (optional) runs when the step activates — use it to open something
// (e.g. a modal) before highlighting it.

export type TourPlacement = "top" | "bottom" | "left" | "right";

export type TourStep = {
  selector: string;
  title: string;
  body: string;
  placement?: TourPlacement;
  before?: () => void;
};

export const TOUR_STEPS: TourStep[] = [
  {
    selector: '[data-tour="board"]',
    title: "The board",
    body: "This is where you train. Positions load here — make the move you think is best.",
    placement: "right",
  },
  {
    selector: '[data-tour="import-games"]',
    title: "Import your games",
    body: "Pull your recent games from Chess.com to mine puzzles from your own mistakes.",
    placement: "bottom",
  },
  {
    selector: '[data-tour="stats"]',
    title: "Track your progress",
    body: "Your accuracy, rating trend, and training streak show up here as you play.",
    placement: "left",
  },
  {
    selector: '[data-tour="login"]',
    title: "Save your progress",
    body: "Sign in to keep your stats and imported games across sessions.",
    placement: "bottom",
  },
];
