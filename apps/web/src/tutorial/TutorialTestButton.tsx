// Self-contained header button that opens a centered test modal and blurs the
// rest of the screen using the four-panel BlurSpotlight (Option A). Owns its
// own open/measure state so sessionShell only needs to drop in <TutorialTestButton />.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TextButton } from "../components";
import { BlurSpotlight, type SpotlightRect } from "./BlurSpotlight";

export function TutorialTestButton() {
  const [open, setOpen] = useState(false);
  const [hole, setHole] = useState<SpotlightRect | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => setOpen(false), []);

  const measure = useCallback(() => {
    const element = dialogRef.current;
    if (!element) {
      return;
    }
    const rect = element.getBoundingClientRect();
    setHole({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
  }, []);

  // Measure the dialog once it's mounted (before paint, so the panels frame it
  // without a visible flash) and keep it aligned on resize.
  useLayoutEffect(() => {
    if (!open) {
      setHole(null);
      return;
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, measure]);

  // Esc to dismiss.
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  return (
    <>
      <TextButton text="test" onClick={() => setOpen(true)} />
      {open
        ? createPortal(
            <>
              <BlurSpotlight hole={hole} padding={0} blurPx={5} dim={0.45} onBackdropClick={close} zIndex={1000} />
              <div className="tutorial-modal" role="dialog" aria-modal="true" aria-label="Tutorial test">
                <div className="tutorial-modal__dialog" ref={dialogRef}>
                  <div className="tutorial-modal__titlebar">
                    <span className="tutorial-modal__title">Tutorial · Test</span>
                    <button type="button" className="tutorial-modal__close" aria-label="Close" onClick={close}>
                      ×
                    </button>
                  </div>
                  <div className="tutorial-modal__body">
                    <p>
                      This is a test dialog. Everything behind it is blurred and dimmed by four panels
                      (Option A) framing this card — the card itself stays sharp.
                    </p>
                    <p className="tutorial-modal__hint">Click outside or press Esc to close.</p>
                  </div>
                  <div className="tutorial-modal__footer">
                    <TextButton text="got it" onClick={close} />
                  </div>
                </div>
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}
