type Props = {
  finalScore: number;
  onReplay: () => void;
};

/** View: end-of-run overlay when the tug reaches the port line. */
export function PortCompleteModal({ finalScore, onReplay }: Props) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="run-complete-title"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(6,10,18,0.72)",
        backdropFilter: "blur(4px)",
        zIndex: 20,
      }}
    >
      <div
        style={{
          background: "linear-gradient(165deg, #1a2434 0%, #0e141c 100%)",
          border: "1px solid rgba(255,200,120,0.35)",
          borderRadius: 14,
          padding: "28px 36px",
          minWidth: 280,
          textAlign: "center",
          boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
        }}
      >
        <div id="run-complete-title" style={{ fontSize: 13, color: "rgba(255,220,160,0.75)", letterSpacing: 2, marginBottom: 8 }}>
          PORT REACHED
        </div>
        <div style={{ fontSize: 36, fontWeight: 800, color: "#ffd898", fontFamily: "monospace", marginBottom: 6 }}>{finalScore}</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 18 }}>Final score</div>
        <button type="button" className="pillBtn" onClick={onReplay}>
          Replay
        </button>
      </div>
    </div>
  );
}
