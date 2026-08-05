// Dim-only tutorial spotlight: a single fixed layer with a rectangular hole
// punched out via clip-path. Unlike BlurSpotlight it only *dims* the rest of
// the screen (no backdrop-filter), so the surrounding UI the tour talks about
// stays readable. The clipped hole also stops capturing pointer events, so the
// highlighted element remains sharp and clickable while the rest is blocked.

import { createPortal } from "react-dom";
import type { CSSProperties } from "react";

export type SpotlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type SpotlightCutoutProps = {
  // Hole to keep clear, in viewport coordinates (from getBoundingClientRect).
  hole: SpotlightRect | null;
  // Space around the hole before the dim begins.
  padding?: number;
  // Dim strength, 0–1.
  dim?: number;
  // Fired when the dimmed area (outside the hole) is clicked.
  onBackdropClick?: () => void;
  zIndex?: number;
};

export function SpotlightCutout({
  hole,
  padding = 8,
  dim = 0.55,
  onBackdropClick,
  zIndex = 1000,
}: SpotlightCutoutProps) {
  if (!hole) {
    return null;
  }

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const left = Math.max(0, hole.left - padding);
  const top = Math.max(0, hole.top - padding);
  const right = Math.min(viewportWidth, hole.left + hole.width + padding);
  const bottom = Math.min(viewportHeight, hole.top + hole.height + padding);

  // Outer rectangle + a rectangular hole, via the even-odd fill rule.
  const clipPath = `polygon(evenodd,
    0 0, 100% 0, 100% 100%, 0 100%, 0 0,
    ${left}px ${top}px, ${left}px ${bottom}px, ${right}px ${bottom}px, ${right}px ${top}px, ${left}px ${top}px
  )`;

  const style: CSSProperties = {
    zIndex,
    background: `rgba(0, 0, 0, ${dim})`,
    clipPath,
  };

  return createPortal(
    <div className="tutorial-spotlight" style={style} onClick={onBackdropClick} aria-hidden="true" />,
    document.body,
  );
}
