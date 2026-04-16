export function ThrottleLever({ speed, maxKn = 18 }: { speed: number; maxKn?: number }) {
  const pct = (speed + 3) / (maxKn + 3);
  const top = (1 - pct) * 90;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div
        style={{
          position: "relative",
          width: 16,
          height: 110,
          background: "#141008",
          border: "1.5px solid rgba(185, 135, 50, 0.55)",
          borderRadius: 4,
        }}
      >
        {["FWD", "½", "STP", "REV"].map((l, i) => (
          <div
            key={l}
            style={{
              position: "absolute",
              left: -34,
              top: `${(i / 3) * 100}%`,
              fontSize: 9,
              fontWeight: 700,
              color: "#c09050",
              transform: "translateY(-50%)",
              whiteSpace: "nowrap",
              fontFamily: "var(--font-mono, monospace)",
              letterSpacing: "0.03em",
            }}
          >
            {l}
          </div>
        ))}
        <div
          style={{
            position: "absolute",
            left: -10,
            top: `${top}%`,
            width: 36,
            height: 14,
            background: "#c07830",
            borderRadius: 3,
            border: "1px solid #e09848",
            transform: "translateY(-50%)",
            transition: "top 0.15s",
            boxShadow: "0 0 6px rgba(200, 120, 40, 0.45)",
          }}
        />
      </div>
      <div style={{ fontSize: 9, fontWeight: 700, color: "#c09050", letterSpacing: "0.08em", fontFamily: "var(--font-display, monospace)" }}>THROTTLE</div>
    </div>
  );
}
