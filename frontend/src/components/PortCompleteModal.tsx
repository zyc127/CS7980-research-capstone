import { useEffect, useRef, useState } from "react";

type Props = {
  finalScore: number;
  onReplay: () => void;
};

/** Animated score count-up on mount. */
function useCountUp(target: number, durationMs = 1600) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const startTime = performance.now();
    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / durationMs, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(eased * target));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs]);

  return display;
}

/** Star rating from score. */
function stars(score: number) {
  if (score >= 100) return 3;
  if (score >= 50)  return 2;
  if (score >= 20)  return 1;
  return 0;
}

export function PortCompleteModal({ finalScore, onReplay }: Props) {
  const display = useCountUp(finalScore);
  const starCount = stars(finalScore);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="run-complete-title"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(3, 2, 1, 0.75)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        zIndex: 20,
      }}
    >
      <div
        className="portModal"
        style={{
          background: "linear-gradient(160deg, #1c1508 0%, #0c0a04 50%, #101418 100%)",
          border: "1px solid rgba(220, 170, 70, 0.4)",
          borderRadius: 16,
          padding: "32px 44px 28px",
          minWidth: 300,
          textAlign: "center",
          boxShadow:
            "0 0 0 1px rgba(220, 170, 70, 0.08), 0 24px 60px rgba(0,0,0,0.6), 0 0 40px rgba(180, 130, 30, 0.08)",
        }}
      >
        {/* Anchor decorative icon */}
        <div style={{ fontSize: 28, marginBottom: 6, opacity: 0.7 }}>⚓</div>

        {/* Title */}
        <div
          id="run-complete-title"
          style={{
            fontFamily: "var(--font-display, 'Orbitron', monospace)",
            fontSize: 11,
            fontWeight: 700,
            color: "rgba(220, 180, 90, 0.7)",
            letterSpacing: "0.2em",
            marginBottom: 4,
            textTransform: "uppercase",
          }}
        >
          Port Reached
        </div>

        <div
          style={{
            fontFamily: "var(--font-display, 'Orbitron', monospace)",
            fontSize: 9,
            color: "rgba(180, 140, 60, 0.4)",
            letterSpacing: "0.15em",
            marginBottom: 18,
          }}
        >
          Mission Complete
        </div>

        {/* Score */}
        <div
          style={{
            fontFamily: "var(--font-mono, monospace)",
            fontSize: 52,
            fontWeight: 700,
            color: "#f0c870",
            lineHeight: 1,
            marginBottom: 4,
            textShadow: "0 0 30px rgba(240, 200, 80, 0.5), 0 0 60px rgba(240, 200, 80, 0.2)",
            letterSpacing: "-0.02em",
          }}
        >
          {display.toLocaleString()}
        </div>

        <div
          style={{
            fontFamily: "var(--font-display, monospace)",
            fontSize: 9,
            color: "rgba(180, 140, 60, 0.5)",
            letterSpacing: "0.15em",
            marginBottom: 16,
          }}
        >
          Final Score
        </div>

        {/* Stars */}
        {starCount > 0 && (
          <div
            style={{ fontSize: 22, marginBottom: 20, letterSpacing: 4, filter: "drop-shadow(0 0 6px rgba(240, 200, 80, 0.5))" }}
          >
            {Array.from({ length: 3 }, (_, i) => (
              <span key={i} style={{ opacity: i < starCount ? 1 : 0.18 }}>★</span>
            ))}
          </div>
        )}

        {/* Separator */}
        <div
          style={{
            height: 1,
            background: "linear-gradient(90deg, transparent, rgba(200, 160, 60, 0.3), transparent)",
            marginBottom: 20,
          }}
        />

        {/* Replay button */}
        <button
          type="button"
          className="pillBtn pillBtnActive"
          onClick={onReplay}
          style={{ padding: "8px 28px", fontSize: 10, letterSpacing: "0.12em" }}
        >
          ↺ Play Again
        </button>
      </div>
    </div>
  );
}
