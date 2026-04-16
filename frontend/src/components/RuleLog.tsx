import { useEffect, useRef, useState } from "react";
import type { ExplanationOut } from "../types";

export type RuleLogEntry = ExplanationOut & { loggedAt: number };

const CAT_COLOR: Record<string, string> = {
  navigation:  "#3898ee",
  safety:      "#eebb30",
  emergency:   "#ee3820",
  educational: "#a060ee",
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

const PANEL_STYLE: React.CSSProperties = {
  background: "rgba(6,4,2,0.88)",
  border: "1px solid rgba(200,155,60,0.28)",
  borderRadius: 10,
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  boxShadow: "0 4px 24px rgba(0,0,0,0.55)",
};

const BTN: React.CSSProperties = {
  background: "rgba(160,100,30,0.18)",
  border: "1px solid rgba(200,140,50,0.30)",
  borderRadius: 4,
  color: "rgba(220,160,70,0.9)",
  cursor: "pointer",
  fontSize: 10,
  fontWeight: 700,
  fontFamily: "var(--font-display,'Orbitron',monospace)",
  letterSpacing: "0.05em",
  padding: "3px 9px",
  lineHeight: 1.4,
};

export function RuleLog({ entries }: { entries: RuleLogEntry[] }) {
  const [open, setOpen] = useState(false);

  const listRef      = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  // Auto-scroll to latest entry when the log is open and new entries arrive
  useEffect(() => {
    const el = listRef.current;
    if (!el || !autoScrollRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [entries]);

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    autoScrollRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
  };

  const latest = entries[entries.length - 1];
  const latestCat  = latest ? getCategory(latest) : null;
  const latestCol  = latestCat ? (CAT_COLOR[latestCat] ?? "#c09850") : "#c09850";
  const latestIcon = latestCat ? (CAT_ICON[latestCat]  ?? "NAV") : null;

  // ── Collapsed thin bar ─────────────────────────────────────────
  if (!open) {
    return (
      <div
        style={{
          ...PANEL_STYLE,
          height: 36,
          display: "flex",
          alignItems: "center",
          padding: "0 12px",
          gap: 10,
        }}
      >
        {/* Dot + label */}
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: entries.length > 0 ? latestCol : "rgba(120,90,40,0.4)",
            flexShrink: 0,
            boxShadow: entries.length > 0 ? `0 0 6px ${latestCol}88` : "none",
          }}
        />
        <span
          style={{
            fontFamily: "var(--font-display,'Orbitron',monospace)",
            fontSize: 9.5,
            fontWeight: 700,
            color: "#c8a054",
            letterSpacing: "0.1em",
            flexShrink: 0,
          }}
        >
          RULE ENGINE LOG
        </span>

        {/* Latest entry preview */}
        {latest && (
          <>
            <span
              style={{
                background: `${latestCol}22`,
                color: latestCol,
                fontSize: 7.5,
                fontWeight: 700,
                fontFamily: "var(--font-display,monospace)",
                letterSpacing: "0.07em",
                padding: "1px 5px",
                borderRadius: 3,
                border: `1px solid ${latestCol}44`,
                flexShrink: 0,
              }}
            >
              {latestIcon}
            </span>
            <span
              style={{
                fontSize: 9.5,
                color: "rgba(180,140,70,0.75)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
                minWidth: 0,
              }}
            >
              {latest.rule_id.replace(/_/g, " ").toUpperCase()}
            </span>
          </>
        )}

        {!latest && (
          <span style={{ flex: 1, fontSize: 9, color: "rgba(120,90,40,0.5)", fontStyle: "italic" }}>
            no rules triggered yet
          </span>
        )}

        {/* Entry count */}
        <span style={{ fontSize: 8.5, color: "rgba(160,120,50,0.5)", flexShrink: 0 }}>
          {entries.length} {entries.length === 1 ? "entry" : "entries"}
        </span>

        {/* Open button */}
        <button style={BTN} onClick={() => setOpen(true)}>
          OPEN LOGS ▲
        </button>

      </div>
    );
  }

  // ── Expanded log window ────────────────────────────────────────
  return (
    <div
      style={{
        ...PANEL_STYLE,
        height: 380,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 14px 7px",
          borderBottom: "1px solid rgba(200,155,60,0.18)",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-display,'Orbitron',monospace)",
            fontSize: 11,
            fontWeight: 700,
            color: "#c8a054",
            letterSpacing: "0.1em",
          }}
        >
          RULE ENGINE LOG
        </span>
        <span style={{ fontSize: 9, color: "rgba(160,120,50,0.5)", marginLeft: 4 }}>
          {entries.length} {entries.length === 1 ? "entry" : "entries"}
        </span>

        <div style={{ flex: 1 }} />

        {/* Collapse */}
        <button style={BTN} onClick={() => setOpen(false)}>
          COLLAPSE ▼
        </button>

      </div>

      {/* Scrollable entries — newest at bottom */}
      <div
        ref={listRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: "auto",
          minHeight: 0,
          padding: "8px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {entries.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "18px 0",
              color: "rgba(120,95,45,0.5)",
              fontSize: 11,
              fontStyle: "italic",
            }}
          >
            Navigate the vessel — triggered rules will appear here.
          </div>
        ) : (
          entries.map((exp, i) => {
            const cat  = getCategory(exp);
            const col  = CAT_COLOR[cat]  ?? "#c09850";
            const icon = CAT_ICON[cat]   ?? "NAV";
            const eduFocus = exp.educational_summary?.educational_focus as string | undefined;
            const tags = (exp.educational_summary?.tags as string[] | undefined) ?? [];

            return (
              <div
                key={i}
                style={{
                  background: "rgba(10,6,2,0.72)",
                  border: `1px solid ${col}33`,
                  borderLeft: `3px solid ${col}`,
                  borderRadius: 7,
                  padding: "9px 11px",
                  flexShrink: 0,
                }}
              >
                {/* Rule header */}
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                  <span
                    style={{
                      background: `${col}22`,
                      color: col,
                      fontFamily: "var(--font-display,monospace)",
                      fontSize: 7.5,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      padding: "1px 5px",
                      borderRadius: 3,
                      border: `1px solid ${col}44`,
                    }}
                  >
                    {icon}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-display,monospace)",
                      fontSize: 9.5,
                      fontWeight: 600,
                      color: "#d4aa60",
                      letterSpacing: "0.04em",
                      flex: 1,
                    }}
                  >
                    {exp.rule_id.replace(/_/g, " ").toUpperCase()}
                  </span>
                  <span style={{ fontSize: 8, color: "rgba(160,120,50,0.5)", fontFamily: "monospace" }}>
                    P{exp.priority}
                  </span>
                </div>

                {/* Message */}
                <div style={{ fontSize: 10, color: "#b09060", lineHeight: 1.55, marginBottom: eduFocus ? 6 : 0 }}>
                  {exp.message}
                </div>

                {/* Educational focus */}
                {eduFocus && (
                  <div
                    style={{
                      marginTop: 6,
                      padding: "5px 8px",
                      background: `${col}12`,
                      borderRadius: 4,
                      fontSize: 9,
                      color: col,
                      fontStyle: "italic",
                      lineHeight: 1.4,
                    }}
                  >
                    {eduFocus}
                  </div>
                )}

                {/* Conditions */}
                {exp.conditions && exp.conditions.length > 0 && (
                  <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>
                    {exp.conditions.slice(0, 3).map((c, j) => (
                      <div
                        key={j}
                        style={{
                          display: "flex",
                          gap: 5,
                          alignItems: "center",
                          fontSize: 8,
                          fontFamily: "var(--font-mono,monospace)",
                        }}
                      >
                        <span style={{ color: c.result ? "#30cc70" : "#cc3030", fontWeight: 700 }}>
                          {c.result ? "+" : "-"}
                        </span>
                        <span style={{ color: "rgba(140,110,60,0.8)" }}>
                          {c.field.split(".").pop()} {c.operator}{" "}
                          <span style={{ color: "rgba(200,160,70,0.8)" }}>{String(c.threshold)}</span>
                          {" "}
                          <span style={{ color: "rgba(100,80,40,0.9)" }}>
                            (={String(c.actual_value).slice(0, 7)})
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Tags */}
                {tags.length > 0 && (
                  <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 3 }}>
                    {tags.map((tag, j) => (
                      <span
                        key={j}
                        style={{
                          fontSize: 7.5,
                          color: "rgba(160,120,50,0.6)",
                          background: "rgba(160,120,50,0.08)",
                          border: "1px solid rgba(160,120,50,0.15)",
                          borderRadius: 3,
                          padding: "1px 4px",
                          fontFamily: "monospace",
                        }}
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
