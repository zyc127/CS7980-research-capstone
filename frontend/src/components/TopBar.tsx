import { WEATHER_CFG, type WeatherKey } from "../constants";

const SCENARIOS: Record<string, string> = {
  default: "Open Water",
  fog: "Fog Nav",
  docking: "Docking",
  emergency: "Eng Fail",
};

type Props = {
  scenario: string;
  weather: WeatherKey;
  score: number;
  onScenario: (key: string) => void;
  onWeather: (w: WeatherKey) => void;
  onReplay: () => void;
};

/** View: top toolbar (scenario, weather, score, replay). */
export function TopBar({ scenario, weather, score, onScenario, onWeather, onReplay }: Props) {
  return (
    <div className="panel topBar">
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

      <div className="statPills">
        <div className="stat">
          <div className="statLabel">SCORE</div>
          <div className="statValue" style={{ color: "rgba(255, 225, 150, 0.9)" }}>
            {score}
          </div>
        </div>
        <button type="button" onClick={onReplay} className="pillBtn" title="Replay race (same scenario)">
          Replay
        </button>
      </div>
    </div>
  );
}
