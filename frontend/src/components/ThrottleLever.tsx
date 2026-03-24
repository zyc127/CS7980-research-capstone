export function ThrottleLever({ speed, maxKn = 18 }: { speed: number; maxKn?: number }) {
  const pct = (speed + 3) / (maxKn + 3);
  const top = (1 - pct) * 90;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
      <div
        style={{
          position: "relative",
          width: 14,
          height: 104,
          background: "#070402",
          border: "1.5px solid #382010",
          borderRadius: 4,
        }}
      >
        {["FWD", "½", "STP", "REV"].map((l, i) => (
          <div
            key={l}
            style={{
              position: "absolute",
              left: -30,
              top: `${(i / 3) * 100}%`,
              fontSize: 7,
              color: "#504030",
              transform: "translateY(-50%)",
              whiteSpace: "nowrap",
            }}
          >
            {l}
          </div>
        ))}
        <div
          style={{
            position: "absolute",
            left: -9,
            top: `${top}%`,
            width: 32,
            height: 13,
            background: "#c07830",
            borderRadius: 3,
            border: "1px solid #e09848",
            transform: "translateY(-50%)",
            transition: "top 0.15s",
          }}
        />
      </div>
      <div style={{ fontSize: 8, color: "#504030", letterSpacing: 0.4 }}>THROTTLE</div>
    </div>
  );
}

