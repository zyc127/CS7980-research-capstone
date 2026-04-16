export function AnalogGauge({
  label,
  value,
  min = 0,
  max = 12,
  color = "#ff4040",
  warn = false,
  size = 60,
}: {
  label: string;
  value: number | string;
  min?: number;
  max?: number;
  color?: string;
  warn?: boolean;
  size?: number;
}) {
  const v = typeof value === "number" ? value : Number.parseFloat(value) || 0;
  const pct = Math.max(0, Math.min(1, (v - min) / (max - min)));
  const angle = -135 + pct * 270;

  const r   = size / 2 - 4;   // outer ring radius
  const hub = size / 2;
  const clipR = r - 1;         // clip to just inside the ring stroke

  const polar = (deg: number, radius: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: hub + radius * Math.cos(rad), y: hub + radius * Math.sin(rad) };
  };

  // Arc paths use r-3 so they sit well inside the ring
  const arcR = r - 3;
  const arcStart = polar(-135, arcR);
  const arcEnd   = polar(135,  arcR);
  const arcPath  = `M ${arcStart.x} ${arcStart.y} A ${arcR} ${arcR} 0 1 1 ${arcEnd.x} ${arcEnd.y}`;

  const valDeg  = -135 + pct * 270;
  const valEnd  = polar(valDeg, arcR);
  const largeArc = pct > 0.5 ? 1 : 0;
  const valPath  = pct > 0
    ? `M ${arcStart.x} ${arcStart.y} A ${arcR} ${arcR} 0 ${largeArc} 1 ${valEnd.x} ${valEnd.y}`
    : null;

  // Needle
  const needleRad = ((angle - 90) * Math.PI) / 180;
  const nx1 = hub + 5 * Math.cos(needleRad);
  const ny1 = hub + 5 * Math.sin(needleRad);
  const nx2 = hub + (r - 6) * Math.cos(needleRad);
  const ny2 = hub + (r - 6) * Math.sin(needleRad);

  const clipId  = `clip-${label.replace(/\W/g, "")}`;
  const gradId  = `g-${label.replace(/\W/g, "")}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <svg width={size} height={size}>
        <defs>
          {/* Clip everything to inside the ring */}
          <clipPath id={clipId}>
            <circle cx={hub} cy={hub} r={clipR} />
          </clipPath>
          <radialGradient id={gradId} cx="50%" cy="30%" r="70%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.04)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
        </defs>

        {/* Outer ring — drawn outside clip so it's always fully visible */}
        <circle
          cx={hub} cy={hub} r={r}
          fill="#060402"
          stroke={warn ? "rgba(180, 30, 10, 0.6)" : "rgba(50, 30, 10, 0.8)"}
          strokeWidth={2.5}
        />

        {/* All interior content clipped to circle */}
        <g clipPath={`url(#${clipId})`}>
          {/* Inner gradient */}
          <circle cx={hub} cy={hub} r={clipR} fill={`url(#${gradId})`} />

          {/* Background track arc */}
          <path
            d={arcPath}
            fill="none"
            stroke="rgba(80, 50, 15, 0.45)"
            strokeWidth={3}
            strokeLinecap="round"
          />

          {/* Value fill arc */}
          {valPath && (
            <path
              d={valPath}
              fill="none"
              stroke={warn ? "#ff3010" : color}
              strokeWidth={3}
              strokeLinecap="round"
            />
          )}

          {/* Tick marks */}
          {Array.from({ length: 13 }, (_, i) => {
            const a = -135 + i * 22.5;
            const isMajor = i % 3 === 0;
            const outer = polar(a, r - 3);
            const inner = polar(a, r - (isMajor ? 11 : 7));
            return (
              <line
                key={i}
                x1={outer.x} y1={outer.y}
                x2={inner.x} y2={inner.y}
                stroke={isMajor ? "#b08840" : "#705025"}
                strokeWidth={isMajor ? 1.5 : 1}
              />
            );
          })}

          {/* Needle */}
          <line
            x1={nx1} y1={ny1}
            x2={nx2} y2={ny2}
            stroke={warn ? "#ff3010" : color}
            strokeWidth={2}
            strokeLinecap="round"
          />

          {/* Hub dot */}
          <circle cx={hub} cy={hub} r={3.5} fill={warn ? "#ff3010" : color} />
          <circle cx={hub} cy={hub} r={1.5} fill="rgba(255,255,255,0.3)" />
        </g>

        {/* Warm glow ring overlay when warning (rendered over the ring, inside SVG) */}
        {warn && (
          <circle
            cx={hub} cy={hub} r={r}
            fill="none"
            stroke="#ff3010"
            strokeWidth={1}
            opacity={0.4}
          />
        )}
      </svg>

      {/* Numeric value */}
      <div
        style={{
          fontFamily: "var(--font-mono, monospace)",
          fontSize: 11,
          fontWeight: 700,
          color: warn ? "#ff7050" : "#c09850",
          textShadow: warn ? "0 0 8px rgba(255, 80, 30, 0.5)" : "none",
          letterSpacing: "0.02em",
        }}
      >
        {v.toFixed(v < 100 ? 1 : 0)}
      </div>

      {/* Label */}
      <div
        style={{
          fontFamily: "var(--font-display, monospace)",
          fontSize: 8.5,
          fontWeight: 700,
          color: "#b89050",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
    </div>
  );
}
