import { useEffect, useRef } from "react";
import { WEATHER_CFG, type WeatherKey } from "../constants";

/** Scenarios exposed as buttons — Fog Nav and Docking are now embedded in the path. */
const SCENARIOS: Record<string, string> = {
  default:   "Open Water",
  emergency: "Eng Fail",
};

type Props = {
  scenario: string;
  weather: WeatherKey;
  score: number;
  fpv: boolean;
  onScenario: (key: string) => void;
  onWeather: (w: WeatherKey) => void;
  onReplay: () => void;
  onToggleFpv: () => void;
};

/** Top-down boat silhouette for the Immersive View button. */
function BoatSilhouette({ active }: { active: boolean }) {
  const stroke = active ? "#60f8ff" : "#28c8e0";
  const fill   = active ? "rgba(0,230,255,0.20)" : "rgba(0,160,200,0.13)";
  return (
    <svg width="32" height="20" viewBox="0 0 44 26" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      {/* Hull */}
      <path d="M3 13 L9 3 L35 3 L41 13 L35 23 L9 23 Z" stroke={stroke} strokeWidth="1.8" fill={fill} />
      {/* Bridge / superstructure */}
      <rect x="15" y="8" width="13" height="10" rx="2" stroke={stroke} strokeWidth="1.4" fill={active ? "rgba(0,230,255,0.16)" : "rgba(0,160,200,0.10)"} />
      {/* Bow wake lines */}
      <path d="M41 10 L44 8 M41 16 L44 18" stroke={stroke} strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

/**
 * Animated score number. Flashes pink on increase, red+shake on decrease.
 * Restarts the CSS animation each time the score changes by toggling classes
 * via a DOM ref (avoids the React key-remount cost on every update).
 */
function ScoreValue({ score }: { score: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const prevRef = useRef(score);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (score === prevRef.current) return;
    const trend = score > prevRef.current ? "scoreValUp" : "scoreValDown";
    prevRef.current = score;

    const el = ref.current;
    if (!el) return;
    // Remove both classes, force reflow, re-add the correct one to restart animation
    el.classList.remove("scoreValUp", "scoreValDown");
    void el.offsetWidth;          // reflow triggers animation reset
    el.classList.add(trend);

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      el.classList.remove("scoreValUp", "scoreValDown");
    }, 700);
  }, [score]);

  return <div ref={ref} className="statValue">{score}</div>;
}

/** Ship anchor icon (SVG inline). */
function AnchorIcon() {
  return (
    <svg className="topBarBrandIcon" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <circle cx="14" cy="14" r="13" stroke="rgba(200,160,80,0.35)" strokeWidth="1" />
      <circle cx="14" cy="9" r="2.5" stroke="#c8a054" strokeWidth="1.5" />
      <line x1="14" y1="11.5" x2="14" y2="20" stroke="#c8a054" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8 20 Q14 23.5 20 20" stroke="#c8a054" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <line x1="8" y1="13" x2="20" y2="13" stroke="#c8a054" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function TopBar({ scenario, weather, score, fpv, onScenario, onWeather, onReplay, onToggleFpv }: Props) {
  return (
    <div className="panel topBar">
      {/* Brand */}
      <div className="topBarBrand">
        <AnchorIcon />
        <div>
          <div className="topBarBrandTitle">TugSim</div>
          <div className="topBarBrandSub">MARITIME AI</div>
        </div>
      </div>

      {/* Center controls */}
      <div className="topBarCenter">
        <div className="pillRow">
          {Object.entries(SCENARIOS).map(([k, name]) => (
            <button
              key={k}
              type="button"
              onClick={() => onScenario(k)}
              className={`pillBtn ${scenario === k ? "pillBtnActive" : ""}`}
            >
              {name}
            </button>
          ))}
        </div>

        <div className="topBarDivider" />

        <div className="pillRow">
          {Object.entries(WEATHER_CFG).map(([k, w]) => (
            <button
              key={k}
              type="button"
              onClick={() => onWeather(k as WeatherKey)}
              className={`pillBtn ${weather === k ? "pillBtnActive" : ""}`}
            >
              {w.label}
            </button>
          ))}
        </div>

      </div>

      {/* Right: Replay · Immersive View · Score */}
      <div className="statPills">
        <button type="button" onClick={onReplay} className="replayBtn" title="Restart same scenario">
          ↺ Replay
        </button>
        <div className="topBarDivider" />
        <button
          type="button"
          onClick={onToggleFpv}
          className={`immersiveBtn ${fpv ? "immersiveBtnActive" : ""}`}
          title="Toggle immersive bridge view [V]"
        >
          <BoatSilhouette active={fpv} />
          <span>{fpv ? "Back to Game" : "Immersive View"}</span>
        </button>
        <div className="topBarDivider" />
        <div className="stat statScore">
          <div className="statLabel">Score</div>
          <ScoreValue score={score} />
        </div>
      </div>
    </div>
  );
}
