import { useEffect, useState } from "react";

const FRAME_COUNT = 5;
const FRAME_PATHS = Array.from({ length: FRAME_COUNT }, (_, index) => `/pickaxe/frame${index + 1}.txt`);
const FRAME_INTERVAL_MS = 120;

function PickaxeAnimationDemoPage() {
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
    <main
      style={{
        minHeight: "100svh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#11161d",
      }}
    >
      <pre
        style={{
          margin: 0,
          color: "#e9c46a",
          fontFamily: "'Menlo', 'Consolas', monospace",
          fontSize: "clamp(8px, 1.6vw, 16px)",
          lineHeight: 1,
          letterSpacing: 0,
          whiteSpace: "pre",
          transform: "scaleX(0.80)",
          transformOrigin: "center",
        }}
      >
        {frames[frameIndex] ?? "Loading pickaxe…"}
      </pre>
    </main>
  );
}

export default PickaxeAnimationDemoPage;
