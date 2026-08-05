// Reusable "Option B" spotlight: a single fixed backdrop-filter layer with a
// rectangular hole punched out via clip-path. One continuous element means no
// seams between panels. The clipped-away hole region also stops capturing
// pointer events, so whatever sits there (a modal, a highlighted button) stays
// sharp and clickable while the rest of the screen is blurred + dimmed.
// Rendered through a portal so it escapes app overflow.

import { createPortal } from "react-dom";
import type { CSSProperties } from "react";

export type SpotlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type BlurSpotlightProps = {
  // Hole to keep sharp, in viewport coordinates (e.g. from getBoundingClientRect).
  hole: SpotlightRect | null;
  // Extra space around the hole before the blur begins.
  padding?: number;
  blurPx?: number;
  // Dim tint painted on top of the blur, 0–1.
  dim?: number;
  // Fired when the blurred area (i.e. outside the hole) is clicked.
  onBackdropClick?: () => void;
  zIndex?: number;
};

export function BlurSpotlight({
  hole,
  padding = 0,
  blurPx = 4,
  dim = 0.4,
  onBackdropClick,
  zIndex = 1000,
}: BlurSpotlightProps) {
  if (!hole) {
    return null;
  }

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const left = Math.max(0, hole.left - padding);
  const top = Math.max(0, hole.top - padding);
  const right = Math.min(viewportWidth, hole.left + hole.width + padding);
  const bottom = Math.min(viewportHeight, hole.top + hole.height + padding);

  // Outer rectangle drawn clockwise, then a zero-width bridge into the inner
  // rectangle drawn counter-clockwise — non-zero winding leaves the inner rect
  // as a hole. The bridge edge (0 0 → left top) is traversed twice, so invisible.
  const clipPath = `polygon(evenodd,
    0 0, 100% 0, 100% 100%, 0 100%, 0 0,
    ${left}px ${top}px, ${left}px ${bottom}px, ${right}px ${bottom}px, ${right}px ${top}px, ${left}px ${top}px
  )`;

  const style: CSSProperties = {
    zIndex,
    backdropFilter: `blur(${blurPx}px)`,
    WebkitBackdropFilter: `blur(${blurPx}px)`,
    background: `rgba(0, 0, 0, ${dim})`,
    clipPath,
  };

  return createPortal(
    <div className="spotlight-overlay" style={style} onClick={onBackdropClick} aria-hidden="true" />,
    document.body,
  );
}
