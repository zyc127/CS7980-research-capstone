export function WarningLight({ label, on, color = "#ee2010" }: { label: string; on: boolean; color?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: on ? color : "#1e1510",
          border: `1.5px solid ${on ? color : "rgba(180, 130, 55, 0.45)"}`,
          boxShadow: on
            ? `0 0 6px ${color}, 0 0 14px ${color}88, 0 0 22px ${color}44`
            : "inset 0 1px 0 rgba(255,255,255,0.06)",
          transition: "background 0.12s, box-shadow 0.12s",
          animation: on ? "warn-flash 1s ease-in-out infinite" : "none",
          flexShrink: 0,
        }}
      />
      <div
        style={{
          fontFamily: "var(--font-display, 'Orbitron', monospace)",
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.04em",
          color: on ? "rgba(255, 200, 190, 0.95)" : "rgba(185, 148, 85, 0.82)",
          textAlign: "center",
          maxWidth: 48,
          lineHeight: 1.3,
          transition: "color 0.12s",
        }}
      >
        {label}
      </div>
    </div>
  );
}
