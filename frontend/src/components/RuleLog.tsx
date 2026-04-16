import type { ExplanationOut } from "../types";

export type RuleLogEntry = ExplanationOut & { loggedAt: number };

const CAT_COLOR: Record<string, string> = {
  navigation: "#3898ee",
  safety:     "#eebb30",
  emergency:  "#ee3820",
  educational:"#a060ee",
};

const CAT_ICON: Record<string, string> = {
  navigation:  "NAV",
  safety:      "SAFE",
  emergency:   "SOS",
  educational: "EDU",
};

function getCategory(exp: ExplanationOut): string {
  const fromSummary = exp.educational_summary?.category as string | undefined;
  if (fromSummary) return fromSummary;
  const id = exp.rule_id;
  if (id.includes("emergency") || id.includes("anchor") || id.includes("collision")) return "emergency";
  if (id.includes("fog") || id.includes("visibility") || id.includes("wind") || id.includes("guidance")) return "safety";
  if (id.includes("educational")) return "educational";
  return "navigation";
}

export function RuleLog({ entries }: { entries: RuleLogEntry[] }) {
  return (
    <div className="panel" style={{ padding: "12px 14px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, borderBottom: "1px solid rgba(160,120,50,0.18)", paddingBottom: 8 }}>
        <span style={{ fontFamily: "var(--font-display,'Orbitron',monospace)", fontSize: 11, fontWeight: 700, color: "#c8a054", letterSpacing: "0.1em" }}>
          RULE ENGINE LOG
        </span>
        <span style={{ fontSize: 9, color: "rgba(180,140,60,0.55)", marginLeft: "auto" }}>
          {entries.length === 0 ? "no rules triggered" : `${entries.length} rule${entries.length > 1 ? "s" : ""} triggered`}
        </span>
      </div>

      {entries.length === 0 ? (
        <div style={{ textAlign: "center", padding: "18px 0", color: "rgba(120,95,45,0.55)", fontSize: 11, fontStyle: "italic" }}>
          Navigate the vessel — triggered rules will appear here with explanations.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto" }}>
          {entries.map((exp, i) => {
            const cat = getCategory(exp);
            const col = CAT_COLOR[cat] ?? "#c09850";
            const icon = CAT_ICON[cat] ?? "NAV";
            const eduFocus = exp.educational_summary?.educational_focus as string | undefined;
            const tags = (exp.educational_summary?.tags as string[] | undefined) ?? [];

            return (
              <div
                key={i}
                style={{
                  background: "rgba(8,5,2,0.7)",
                  border: `1px solid ${col}33`,
                  borderLeft: `3px solid ${col}`,
                  borderRadius: 7,
                  padding: "9px 11px",
                }}
              >
                {/* Rule header row */}
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                  <span style={{
                    background: `${col}22`,
                    color: col,
                    fontFamily: "var(--font-display,monospace)",
                    fontSize: 7.5,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    padding: "1px 5px",
                    borderRadius: 3,
                    border: `1px solid ${col}44`,
                  }}>
                    {icon}
                  </span>
                  <span style={{
                    fontFamily: "var(--font-display,monospace)",
                    fontSize: 9.5,
                    fontWeight: 600,
                    color: "#d4aa60",
                    letterSpacing: "0.04em",
                    flex: 1,
                  }}>
                    {exp.rule_id.replace(/_/g, " ").toUpperCase()}
                  </span>
                  <span style={{ fontSize: 8, color: "rgba(160,120,50,0.5)", fontFamily: "monospace" }}>
                    P{exp.priority}
                  </span>
                </div>

                {/* Main message */}
                <div style={{ fontSize: 10, color: "#b09060", lineHeight: 1.55, marginBottom: eduFocus ? 6 : 0 }}>
                  {exp.message}
                </div>

                {/* Educational focus question */}
                {eduFocus && (
                  <div style={{
                    marginTop: 6,
                    padding: "5px 8px",
                    background: `${col}12`,
                    borderRadius: 4,
                    fontSize: 9,
                    color: col,
                    fontStyle: "italic",
                    lineHeight: 1.4,
                  }}>
                    {eduFocus}
                  </div>
                )}

                {/* Conditions summary */}
                {exp.conditions && exp.conditions.length > 0 && (
                  <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>
                    {exp.conditions.slice(0, 3).map((c, j) => (
                      <div key={j} style={{ display: "flex", gap: 5, alignItems: "center", fontSize: 8, fontFamily: "var(--font-mono,monospace)" }}>
                        <span style={{ color: c.result ? "#30cc70" : "#cc3030", fontWeight: 700 }}>
                          {c.result ? "✓" : "✗"}
                        </span>
                        <span style={{ color: "rgba(140,110,60,0.8)" }}>
                          {c.field.split(".").pop()} {c.operator}{" "}
                          <span style={{ color: "rgba(200,160,70,0.8)" }}>{String(c.threshold)}</span>
                          {" "}
                          <span style={{ color: "rgba(100,80,40,0.9)" }}>(={String(c.actual_value).slice(0, 7)})</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Tags */}
                {tags.length > 0 && (
                  <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 3 }}>
                    {tags.map((tag, j) => (
                      <span key={j} style={{
                        fontSize: 7.5,
                        color: "rgba(160,120,50,0.6)",
                        background: "rgba(160,120,50,0.08)",
                        border: "1px solid rgba(160,120,50,0.15)",
                        borderRadius: 3,
                        padding: "1px 4px",
                        fontFamily: "monospace",
                      }}>
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
