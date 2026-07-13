// Looping ASCII pickaxe, loaded from /pickaxe/frame{n}.txt. Small by default so
// it can tuck into a modal; pass a fontSize to override.

import { useEffect, useState } from "react";

const FRAME_COUNT = 5;
const FRAME_PATHS = Array.from({ length: FRAME_COUNT }, (_, index) => `/pickaxe/frame${index + 1}.txt`);
const FRAME_INTERVAL_MS = 120;

type PickaxeAnimationProps = {
  fontSize?: string;
};

export function PickaxeAnimation({ fontSize = "5px" }: PickaxeAnimationProps) {
  const [frames, setFrames] = useState<string[]>([]);
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    let isDisposed = false;

    Promise.all(FRAME_PATHS.map((path) => fetch(path).then((response) => response.text())))
      .then((loadedFrames) => {
        if (!isDisposed) {
          setFrames(loadedFrames);
        }
      })
      .catch((error) => {
        console.error("Could not load pickaxe frames:", error);
      });

    return () => {
      isDisposed = true;
    };
  }, []);

  useEffect(() => {
    if (frames.length === 0) {
      return undefined;
    }

    const timer = setInterval(() => {
      setFrameIndex((index) => (index + 1) % frames.length);
    }, FRAME_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [frames]);

  return (
    <pre
      className="no-global-border"
      aria-hidden="true"
      style={{
        margin: 0,
        color: "black",
        fontFamily: "'Menlo', 'Consolas', monospace",
        fontSize,
        lineHeight: 1,
        letterSpacing: 0,
        whiteSpace: "pre",
        transform: "scaleX(0.80)",
        transformOrigin: "center",
      }}
    >
      {frames[frameIndex] ?? ""}
    </pre>
  );
}

export default PickaxeAnimation;
