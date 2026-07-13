// Tracks a DOM element's viewport rect over time so the tutorial spotlight can
// follow it. Measures with getBoundingClientRect and re-measures on scroll,
// resize, and element reflow. Returns null until the target exists.
//
// All listeners live inside a single effect that only runs while `active` is
// true (the overlay is unmounted otherwise), so there is zero cost when no
// tour is running.

import { useLayoutEffect, useState } from "react";
import type { SpotlightRect } from "./SpotlightCutout";

export function useTrackedRect(selector: string | null, active: boolean): SpotlightRect | null {
  const [rect, setRect] = useState<SpotlightRect | null>(null);

  useLayoutEffect(() => {
    if (!active || !selector) {
      setRect(null);
      return;
    }

    let frame = 0;
    let element: Element | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let mutationObserver: MutationObserver | null = null;

    const measure = () => {
      if (!element) {
        return;
      }
      const r = element.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };

    // Coalesce bursts of scroll/resize events into one measure per frame.
    const scheduleMeasure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };

    const attach = (el: Element) => {
      element = el;
      // Bring off-screen targets (e.g. a scrolled sidebar window) into view.
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
      measure();
      // capture:true catches scrolls inside nested containers (the scrollable
      // sidebar), whose scroll events don't bubble to window.
      window.addEventListener("scroll", scheduleMeasure, true);
      window.addEventListener("resize", scheduleMeasure);
      resizeObserver = new ResizeObserver(scheduleMeasure);
      resizeObserver.observe(el);
    };

    const existing = document.querySelector(selector);
    if (existing) {
      attach(existing);
    } else {
      // Target not mounted yet — wait for it to appear, then attach once.
      mutationObserver = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (found) {
          mutationObserver?.disconnect();
          mutationObserver = null;
          attach(found);
        }
      });
      mutationObserver.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleMeasure, true);
      window.removeEventListener("resize", scheduleMeasure);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [selector, active]);

  return rect;
}
