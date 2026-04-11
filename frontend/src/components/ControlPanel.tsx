import type { BackendState, ExplanationOut } from "../types";
import { AnalogGauge } from "./AnalogGauge";
import { ThrottleLever } from "./ThrottleLever";
import { WarningLight } from "./WarningLight";

export function ControlPanel({
  backendState,
  explanations,
  liveSpeed,
  liveHeading,
  liveZone,
  throttleCapKn,
}: {
  backendState: BackendState | null;
  explanations: ExplanationOut[];
  liveSpeed?: number | null;
  liveHeading?: number | null;
  liveZone?: string | null;
  throttleCapKn?: number | null;
}) {
  const tug     = backendState?.agents?.tugboat ?? {};
  const env     = backendState?.environment ?? {};
  const metrics = backendState?.global_metrics ?? {};
  const events  = backendState?.active_events ?? {};

  const speed   = liveSpeed   ?? (tug as any).speed   ?? 0;
  const heading = liveHeading ?? (tug as any).heading  ?? 0;
  const cap     = throttleCapKn ?? 14;
  const rpm     = (speed / 14) * 3000;
  const engOk   = ((metrics as any).engine_status ?? 1) > 0;
  const oilP    = engOk ? 78 : 14;
  const waterT  = 160 + speed * 5 + (!engOk ? 60 : 0);
  const zone    = liveZone ?? (env as any).zone ?? "open_water";

  const tugboatCargoDistance = (metrics as any).tugboat_cargo_distance ?? 999;
  const collisionByDistance  = tugboatCargoDistance < 65;
  const hasEmergency  = explanations.some((e) => e.rule_id?.includes("emergency") || e.rule_id?.includes("engine"));
  const hasSafety     = explanations.some((e) => e.rule_id?.includes("fog") || e.rule_id?.includes("wind") || e.rule_id?.includes("visibility"));
  const hasOverspeed  = explanations.some((e) => e.rule_id?.includes("speed"));

  const zoneColor =
    zone === "port"           ? "#ffaa50"
    : zone === "channel"      ? "#50a8f0"
    : zone === "sea_lanes"    ? "#50c0e8"
    : zone === "harbour_entry"? "#ffcc30"
    :                           "#30cc70";

  return (
    <div className="controlPanelRoot">
      {/* Left: Warning lights + engine gauges */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="controlPanelWarnings">
          <WarningLight label="LOW ENG OIL"  on={!engOk} />
          <WarningLight label="FLOOD TANK"   on={(events as any).escort_collision_risk ?? collisionByDistance} />
          <WarningLight label="HI GEAR TEMP" on={speed > 10} />
          <WarningLight label="HI OIL TEMP"  on={hasOverspeed} />
          <WarningLight label="LOW PRESS"    on={hasEmergency} color="#ff7010" />
          <WarningLight label="FOG ALERT"    on={(events as any).fog_alert ?? hasSafety} color="#6090ff" />
          <WarningLight label="GUIDANCE REQ" on={(events as any).guidance_request_sent ?? false} color="#ffcc10" />
          <WarningLight label="COLLISION"    on={collisionByDistance} />
          <WarningLight label="ENG FAIL"     on={(events as any).engine_failure ?? !engOk} />
          <WarningLight label="OVERSPEED"    on={hasOverspeed} color="#ffaa10" />
        </div>

        <div className="controlPanelGaugeRow">
          <AnalogGauge label="RPM ×100" value={rpm / 100} min={0} max={30}  color="#ff4040" warn={rpm > 2700}   size={60} />
          <AnalogGauge label="OIL PSI"  value={oilP}      min={0} max={100} color="#30cc70" warn={oilP < 25}   size={52} />
          <AnalogGauge label="WATER °F" value={waterT}    min={100} max={240} color="#3090ee" warn={waterT > 220} size={52} />
        </div>
      </div>

      {/* Center: Throttle + Rudder + Speed/Dist gauges */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <ThrottleLever speed={speed} maxKn={cap} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <AnalogGauge
              label="SPEED kn"
              value={speed}
              min={0}
              max={Math.max(14, cap)}
              color="#ff4040"
              warn={speed > cap * 0.72}
              size={58}
            />
            <AnalogGauge
              label="DIST m"
              value={Math.min(tugboatCargoDistance, 200)}
              min={0}
              max={200}
              color={tugboatCargoDistance < 65 ? "#ff4040" : tugboatCargoDistance < 130 ? "#eecc30" : "#30cc70"}
              warn={tugboatCargoDistance < 65}
              size={52}
            />
          </div>
        </div>

        <div className="controlHint">
          ← Astern · → Ahead &nbsp;|&nbsp; Q / E Rudder &nbsp;|&nbsp; Space Brake &nbsp;|&nbsp; ↑↓ Throttle cap ({cap.toFixed(1)} kn max)
        </div>
      </div>

      {/* Right: Heading + readouts */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
        <AnalogGauge label="HDG °" value={heading} min={0} max={360} color="#30cc70" size={66} />

        <div className="controlPanelReadout">
          <div className="readoutLabel">Bearing</div>
          <div className="readoutValue" style={{ fontSize: 20 }}>
            {String(Math.round(heading)).padStart(3, "0")}°
          </div>
        </div>

        <div className="controlPanelReadout">
          <div className="readoutLabel">Zone</div>
          <div className="readoutValueSm" style={{ color: zoneColor }}>
            {String(zone).replace(/_/g, " ").toUpperCase()}
          </div>
        </div>

        <div className="controlPanelReadout">
          <div className="readoutLabel">Tick</div>
          <div className="readoutValue" style={{ fontSize: 14 }}>
            {backendState?.time_step ?? 0}
          </div>
        </div>
      </div>
    </div>
  );
}
