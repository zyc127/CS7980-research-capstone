import { WEATHER_CFG, type WeatherKey } from "../constants";

const SCENARIOS: Record<string, string> = {
  default: "Open Water",
  fog:     "Fog Nav",
  docking: "Docking",
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

        <div className="topBarDivider" />

        <div className="pillRow">
          <button
            type="button"
            onClick={onToggleFpv}
            className={`pillBtn ${fpv ? "pillBtnActive" : ""}`}
            title="Toggle first-person bridge view [V]"
          >
            {fpv ? "🗺 Map" : "🧭 Bridge"}
          </button>
          <button type="button" onClick={onReplay} className="pillBtn" title="Restart same scenario">
            ↺ Replay
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="statPills">
        <div className="stat">
          <div className="statLabel">Score</div>
          <div className="statValue">{score}</div>
        </div>
      </div>
    </div>
  );
}
