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
  nearNpc,
}: {
  backendState: BackendState | null;
  explanations: ExplanationOut[];
  liveSpeed?: number | null;
  liveHeading?: number | null;
  liveZone?: string | null;
  throttleCapKn?: number | null;
  nearNpc?: boolean;
}) {
  const tug     = backendState?.agents?.tugboat ?? {};
  const metrics = backendState?.global_metrics ?? {};
  const events  = backendState?.active_events ?? {};

  const speed   = liveSpeed   ?? (tug as any).speed   ?? 0;
  const heading = liveHeading ?? (tug as any).heading  ?? 0;
  const cap     = throttleCapKn ?? 14;
  const rpm     = (speed / 14) * 3000;
  const engOk   = ((metrics as any).engine_status ?? 1) > 0;
  const oilP    = engOk ? 78 : 14;
  const waterT  = 160 + speed * 5 + (!engOk ? 60 : 0);
  const zone    = liveZone ?? (backendState?.environment as any)?.zone ?? "open_water";

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

      {/* ── Part 1 (left): Warning lights ── */}
      <div className="controlPanelWarnings">
        <WarningLight label="ENG OIL"   on={!engOk} />
        <WarningLight label="FLOOD"     on={!!(events as any).flood_alert} />
        <WarningLight label="OVERSPD"   on={hasOverspeed} color="#ffaa10" />
        <WarningLight label="FOG"       on={(events as any).fog_alert ?? hasSafety} color="#6090ff" />
        <WarningLight label="EMERG"     on={hasEmergency} color="#ff7010" />
        <WarningLight label="COLLISION" on={nearNpc ?? false} />
        <WarningLight label="ENG FAIL"  on={(events as any).engine_failure ?? !engOk} />
        <WarningLight label="GUIDANCE"  on={(events as any).guidance_request_sent ?? false} color="#ffcc10" />
        <WarningLight label="HI TEMP"   on={speed > 10} />
        <WarningLight label="HI PRESS"  on={hasEmergency} color="#ff7010" />
      </div>

      {/* ── Part 2 (center): Throttle + engine gauges + nav gauges ── */}
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <ThrottleLever speed={speed} maxKn={cap} />
        <div className="controlPanelGaugeRow">
          <AnalogGauge label="RPM ×100" value={rpm / 100} min={0} max={30}    color="#ff4040" warn={rpm > 2700}    size={52} />
          <AnalogGauge label="OIL PSI"  value={oilP}      min={0} max={100}   color="#30cc70" warn={oilP < 25}    size={46} />
          <AnalogGauge label="WATER °F" value={waterT}    min={100} max={240} color="#3090ee" warn={waterT > 220} size={46} />
        </div>
        <div style={{ width: 1, height: 48, background: "rgba(160,120,50,0.22)", flexShrink: 0 }} />
        <div className="controlPanelGaugeRow">
          <AnalogGauge label="SPEED kn" value={speed}   min={0} max={Math.max(14, cap)} color="#ff4040" warn={speed > cap * 0.72} size={54} />
          <AnalogGauge label="HDG °"    value={heading} min={0} max={360}               color="#30cc70"                           size={54} />
        </div>
      </div>

      {/* ── Part 3 (right): Text readouts ── */}
      <div style={{ display: "flex", gap: 10 }}>
        <div className="controlPanelReadout">
          <div className="readoutLabel">Speed</div>
          <div className="readoutValue" style={{ fontSize: 17 }}>{speed.toFixed(1)}<span style={{ fontSize: 10, marginLeft: 2, color: "#a08840" }}>kn</span></div>
        </div>
        <div className="controlPanelReadout">
          <div className="readoutLabel">Heading</div>
          <div className="readoutValue" style={{ fontSize: 17 }}>{String(Math.round(heading)).padStart(3, "0")}°</div>
        </div>
        <div className="controlPanelReadout">
          <div className="readoutLabel">Zone</div>
          <div className="readoutValueSm" style={{ color: zoneColor, fontSize: 10 }}>
            {String(zone).replace(/_/g, " ").toUpperCase()}
          </div>
        </div>
      </div>

    </div>
  );
}
