import type { ExplanationOut } from "../types";

const CAT_COLOR: Record<string, string> = {
  navigation: "#3898ee",
  safety:     "#eebb30",
  emergency:  "#ee3820",
};

const CAT_BG: Record<string, string> = {
  navigation: "rgba(30, 80, 160, 0.18)",
  safety:     "rgba(160, 110, 10, 0.18)",
  emergency:  "rgba(160, 20, 10, 0.22)",
};

export function ExplanationPanel({ explanations }: { explanations: ExplanationOut[] }) {
  if (!explanations || !explanations.length) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 10,
        right: 10,
        width: 220,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        zIndex: 10,
      }}
    >
      {explanations.slice(0, 2).map((exp, i) => {
        const cat = (exp.educational_summary?.category as string | undefined) ?? "navigation";
        const col = CAT_COLOR[cat] ?? "#c09850";
        const bg  = CAT_BG[cat]  ?? "rgba(30, 20, 5, 0.75)";

        return (
          <div
            key={i}
            className="explanationCard"
            style={{
              background: `rgba(5, 3, 1, 0.82)`,
              borderLeft: `3px solid ${col}`,
              border: `1px solid ${col}44`,
              borderLeftWidth: 3,
              borderLeftColor: col,
              borderRadius: 8,
              padding: "9px 11px",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
              boxShadow: `0 4px 20px rgba(0,0,0,0.4), inset 0 0 20px ${bg}`,
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
              <span
                style={{
                  fontFamily: "var(--font-display, 'Orbitron', monospace)",
                  fontSize: 8.5,
                  fontWeight: 700,
                  color: col,
                  letterSpacing: "0.1em",
                }}
              >
                {cat.toUpperCase()}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono, monospace)",
                  fontSize: 8,
                  color: `${col}99`,
                  background: `${col}18`,
                  padding: "1px 5px",
                  borderRadius: 4,
                }}
              >
                P{exp.priority}
              </span>
            </div>

            {/* Rule ID */}
            <div
              style={{
                fontFamily: "var(--font-display, monospace)",
                fontSize: 9.5,
                fontWeight: 600,
                color: "#d4aa60",
                marginBottom: 3,
                letterSpacing: "0.04em",
              }}
            >
              {exp.rule_id.replace(/_/g, " ")}
            </div>

            {/* Message */}
            <div style={{ fontSize: 9, color: "#a08858", lineHeight: 1.5, marginBottom: 5 }}>
              {exp.message}
            </div>

            {/* Conditions */}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {exp.conditions?.slice(0, 3).map((c, j) => (
                <div
                  key={j}
                  style={{
                    fontSize: 8,
                    display: "flex",
                    gap: 5,
                    alignItems: "center",
                    padding: "2px 0",
                    borderTop: j === 0 ? "1px solid rgba(100,70,20,0.25)" : "none",
                    paddingTop: j === 0 ? 5 : 0,
                  }}
                >
                  <span
                    style={{
                      color: c.result ? "#30cc70" : "#cc3030",
                      fontWeight: 700,
                      fontSize: 9,
                      lineHeight: 1,
                    }}
                  >
                    {c.result ? "✓" : "✗"}
                  </span>
                  <span style={{ color: "rgba(120, 95, 55, 0.85)", fontFamily: "var(--font-mono, monospace)" }}>
                    {c.field} {c.operator}{" "}
                    <span style={{ color: "rgba(180, 140, 70, 0.75)" }}>{String(c.threshold)}</span>
                    {" "}
                    <span style={{ color: "rgba(80, 65, 40, 0.9)" }}>
                      ={String(c.actual_value).slice(0, 6)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
