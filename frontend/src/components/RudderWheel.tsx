import { MAX_RUDDER } from "../constants";

export function RudderWheel({ rudder }: { rudder: number }) {
  const rot = (rudder / MAX_RUDDER) * 128;
  const R = 38;
  const C = 46;
  let arc: React.ReactNode = null;
  if (Math.abs(rudder) > 0.5) {
    const sa = -Math.PI / 2;
    const ea = sa + (rudder / MAX_RUDDER) * Math.PI * 1.4;
    const lg = Math.abs((rudder / MAX_RUDDER) * 1.4) > 1 ? 1 : 0;
    const sx = C + R * Math.cos(sa);
    const sy = C + R * Math.sin(sa);
    const ex = C + R * Math.cos(ea);
    const ey = C + R * Math.sin(ea);
    arc = (
      <path
        d={`M${sx},${sy} A${R},${R} 0 ${lg},${rudder > 0 ? 1 : 0} ${ex},${ey}`}
        fill="none"
        stroke={Math.abs(rudder) > 20 ? "#ff6020" : "#3090ff"}
        strokeWidth={5}
        strokeLinecap="round"
      />
    );
  }
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 0,
        flexShrink: 0,
        minWidth: 96,
      }}
    >
      {/* Shift wheel graphic up so it clears the caption below (layout box stays 92px tall) */}
      <div
        style={{
          position: "relative",
          width: 92,
          height: 92,
          transform: "translateY(-16px)",
          isolation: "isolate",
        }}
      >
        {/* Shadow sits under the wheel (lower z-index) */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 86,
            height: 86,
            marginLeft: -43,
            marginTop: -43,
            borderRadius: "50%",
            background: "radial-gradient(circle at 50% 45%, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.22) 45%, transparent 72%)",
            filter: "blur(5px)",
            transform: "translateY(4px)",
            zIndex: 0,
            pointerEvents: "none",
          }}
        />
        <svg
          width={92}
          height={92}
          style={{ position: "absolute", top: 0, left: 0, zIndex: 1 }}
        >
          <circle cx={C} cy={C} r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={5} />
          {arc}
        </svg>
        <div
          style={{
            position: "absolute",
            top: 5,
            left: 5,
            width: 82,
            height: 82,
            borderRadius: "50%",
            border: "9px solid #4a1e00",
            transform: `rotate(${rot}deg)`,
            transition: "transform 0.05s",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2,
            boxShadow: "0 2px 0 rgba(255,255,255,0.06) inset",
          }}
        >
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
            <div
              key={a}
              style={{
                position: "absolute",
                width: 3,
                height: 30,
                background: "#7a3010",
                borderRadius: 2,
                transformOrigin: "50% 100%",
                transform: `rotate(${a}deg) translateX(-50%)`,
                left: "50%",
                bottom: "50%",
              }}
            />
          ))}
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: "#c07830",
              border: "2.5px solid #e0a050",
              zIndex: 2,
              position: "relative",
            }}
          />
        </div>
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 10,
          color: "#d0a860",
          fontWeight: 700,
          letterSpacing: 0.5,
          textAlign: "center",
          lineHeight: 1.35,
          whiteSpace: "nowrap",
          maxWidth: "100%",
        }}
      >
        {rudder >= 0 ? "+" : ""}
        {Math.round(rudder)}°{" "}
        {rudder < -1 ? "◄ PORT" : rudder > 1 ? "STBD ►" : "MID"}
      </div>
    </div>
  );
}

