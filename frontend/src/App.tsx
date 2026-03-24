import { useCallback, useEffect, useRef, useState } from "react";
import { createApiClient } from "./services/apiClient";
import {
  CH,
  CW,
  K2PX,
  LOCAL_ACCEL,
  MAX_RUDDER,
  CAMERA_FOLLOW_LERP,
  PATH_END_X,
  WORLD_X_MIN,
  WORLD_X_MAX,
  WORLD_Y_MIN,
  WORLD_Y_MAX,
  SCORE_PASSIVE_ACC_PER_FRAME,
  RUDDER_RATE,
  RUDDER_RTN,
  THROTTLE_MAX_KN,
  THROTTLE_MIN_KN,
  type WeatherKey,
} from "./constants";
import { makeLocalState } from "./localState";
import { advanceNpcVessel } from "./npcSteer";
import { pruneAndSpawnEphemeralBoats } from "./trafficSpawn";
import { render } from "./renderer";
import { ControlPanel } from "./components/ControlPanel";
import { ExplanationPanel } from "./components/ExplanationPanel";
import { PortCompleteModal } from "./components/PortCompleteModal";
import { TopBar } from "./components/TopBar";
import { useBackendPolling } from "./hooks/useBackendPolling";
import { useKeyboardControls } from "./hooks/useKeyboardControls";
import type { BackendState, ExplanationOut, LocalState, LocalVessel } from "./types";

const Api = createApiClient();
const EXPLANATION_HOLD_MS = 7000;

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number | null>(null);
  const sessionRef = useRef<string | null>(null);
  const localStateRef = useRef<LocalState | null>(null);
  const keysRef = useKeyboardControls();
  const pendingStep = useRef(false);
  const raceCompleteRef = useRef(false);
  const throttleCapRef = useRef(12);
  const collisionCdRef = useRef(0);
  const cherryFlowerIdRef = useRef(0);
  const teleUiRef = useRef({ lastSetAt: 0 });
  const lastExplanationAtRef = useRef(0);
  const rampFwdRef = useRef(0);
  const rampRevRef = useRef(0);
  const passiveScoreAccRef = useRef(0);
  const trafficSpawnAccRef = useRef(0);

  const [scenario, setScenario] = useState("default");
  const [weather, setWeather] = useState<WeatherKey>("clear");
  const [backendState, setBackendState] = useState<BackendState | null>(null);
  const [explanations, setExplanations] = useState<ExplanationOut[]>([]);
  const [localRudder, setLocalRudder] = useState(0);
  const [status, setStatus] = useState<"connecting" | "ok" | "error" | "no-backend">("connecting");
  const [score, setScore] = useState(0);
  const rudderUiRef = useRef({ lastSetAt: 0, lastVal: 0 });
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [liveHud, setLiveHud] = useState({
    speed: 0,
    heading: 0,
    zone: "open_water",
    throttleCap: 12,
  });

  const resetRaceFlags = useCallback(() => {
    raceCompleteRef.current = false;
    setFinalScore(null);
    throttleCapRef.current = 12;
    collisionCdRef.current = 0;
    cherryFlowerIdRef.current = 0;
    rampFwdRef.current = 0;
    rampRevRef.current = 0;
    passiveScoreAccRef.current = 0;
    trafficSpawnAccRef.current = 0;
  }, []);

  const connect = useCallback(async (sc: string) => {
    setStatus("connecting");
    try {
      await Api.health();
      if (sessionRef.current) await Api.deleteSession(sessionRef.current).catch(() => {});
      const res = await Api.createSession(sc);
      sessionRef.current = res.session_id;
      setBackendState(res.state);
      localStateRef.current = makeLocalState(res.state);
      setExplanations([]);
      lastExplanationAtRef.current = 0;
      setScore(0);
      resetRaceFlags();
      setStatus("ok");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("Backend not available, running in demo mode:", msg);
      localStateRef.current = makeLocalState(null);
      resetRaceFlags();
      setScore(0);
      setStatus("no-backend");
    }
  }, [resetRaceFlags]);

  useEffect(() => {
    void connect(scenario);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendStep = useCallback(async () => {
    if (raceCompleteRef.current) return;
    if (!sessionRef.current || pendingStep.current || status === "no-backend") return;
    pendingStep.current = true;
    const ls = localStateRef.current;
    if (!ls) {
      pendingStep.current = false;
      return;
    }
    try {
      const res = await Api.step(sessionRef.current, {
        target_speed: ls.tug.speed,
        target_heading: ls.tug.heading,
        emergency_stop: keysRef.current.brake && Math.abs(ls.tug.speed) < 0.2,
      });

      setBackendState(res.state);
      const triggeredExplanations = res.explanations?.filter((e) => e.triggered) ?? [];
      if (triggeredExplanations.length > 0) {
        setExplanations(triggeredExplanations);
        lastExplanationAtRef.current = Date.now();
      } else if (Date.now() - lastExplanationAtRef.current > EXPLANATION_HOLD_MS) {
        setExplanations([]);
      }

      const bt = res.state?.agents?.tugboat;
      const bc = res.state?.agents?.cargo_ship;
      if (bt && ls) {
        ls.tug.speed = bt.speed;
        ls.tug.heading = bt.heading;
        ls.zone = res.state?.environment?.zone ?? ls.zone;
      }
      if (bc && ls) {
        ls.cargo.speed = bc.speed;
        ls.cargo.heading = bc.heading;
      }

      if (res.rules_triggered?.length) setScore((s) => Math.max(0, s - res.rules_triggered.length * 2));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("Step failed:", msg);
    }
    pendingStep.current = false;
  }, [status, keysRef]);

  useBackendPolling({
    status,
    localStateRef,
    keysRef,
    raceCompleteRef,
    sendStep,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let last = performance.now();

    const loop = (now: number) => {
      animRef.current = requestAnimationFrame(loop);
      const dt = Math.min((now - last) / 16.67, 3);
      last = now;
      const ls = localStateRef.current;
      if (!ls) return;

      ls.time += 0.016 * dt;

      if (raceCompleteRef.current) {
        render(ctx, ls, weather);
        const nowMs = performance.now();
        if (nowMs - teleUiRef.current.lastSetAt > 120) {
          teleUiRef.current.lastSetAt = nowMs;
          setLiveHud({
            speed: ls.tug.speed,
            heading: ls.tug.heading,
            zone: ls.zone,
            throttleCap: throttleCapRef.current,
          });
        }
        return;
      }

      const k = keysRef.current;
      let cap = throttleCapRef.current;
      if (k.throttleUp) cap = Math.min(THROTTLE_MAX_KN, cap + 0.14 * dt);
      if (k.throttleDown) cap = Math.max(THROTTLE_MIN_KN, cap - 0.14 * dt);
      throttleCapRef.current = cap;

      if (Math.abs(ls.tug.speed) > 0.12) {
        passiveScoreAccRef.current += dt * SCORE_PASSIVE_ACC_PER_FRAME;
        if (passiveScoreAccRef.current >= 1) {
          const add = Math.floor(passiveScoreAccRef.current);
          passiveScoreAccRef.current -= add;
          setScore((s) => s + add);
        }
      }

      const rudderResist = (goingHarderPortOrStbd: boolean) => {
        const t = Math.abs(ls.tug.rudder) / MAX_RUDDER;
        if (!goingHarderPortOrStbd) return 1.12;
        return Math.max(0.42, 1 - 0.58 * t * t);
      };
      if (k.left) {
        const harderPort = ls.tug.rudder <= 0;
        const step = RUDDER_RATE * rudderResist(harderPort) * dt;
        ls.tug.rudder = Math.max(-MAX_RUDDER, ls.tug.rudder - step);
      } else if (k.right) {
        const harderStbd = ls.tug.rudder >= 0;
        const step = RUDDER_RATE * rudderResist(harderStbd) * dt;
        ls.tug.rudder = Math.min(MAX_RUDDER, ls.tug.rudder + step);
      } else
        ls.tug.rudder +=
          ls.tug.rudder > 0
            ? -Math.min(RUDDER_RTN * dt, ls.tug.rudder)
            : ls.tug.rudder < 0
              ? Math.min(RUDDER_RTN * dt, -ls.tug.rudder)
              : 0;

      const vmax = Math.max(throttleCapRef.current, 1);
      const revMax = -3.8;
      if (!k.brake) {
        if (k.fwd) {
          rampFwdRef.current = Math.min(1, rampFwdRef.current + 0.052 * dt);
          rampRevRef.current = Math.max(0, rampRevRef.current - 0.09 * dt);
          const boost = 1 + rampFwdRef.current * 3.2;
          ls.tug.speed = Math.min(
            vmax,
            ls.tug.speed + LOCAL_ACCEL * boost * (1 - (Math.max(0, ls.tug.speed) / vmax) * 0.48) * dt,
          );
          if (ls.tug.speed >= vmax - 0.02) {
            ls.tug.speed = vmax;
          } else {
            const powerDrag = (0.0045 + Math.abs(ls.tug.speed) * 0.0022) * dt;
            if (ls.tug.speed > 0) ls.tug.speed = Math.max(0, ls.tug.speed - powerDrag);
            else if (ls.tug.speed < 0) ls.tug.speed = Math.min(0, ls.tug.speed + powerDrag);
          }
        } else if (k.rev) {
          rampRevRef.current = Math.min(1, rampRevRef.current + 0.052 * dt);
          rampFwdRef.current = Math.max(0, rampFwdRef.current - 0.09 * dt);
          const boost = 1 + rampRevRef.current * 2.6;
          ls.tug.speed = Math.max(revMax, ls.tug.speed - LOCAL_ACCEL * 1.15 * boost * dt);
          if (ls.tug.speed <= revMax + 0.02) {
            ls.tug.speed = revMax;
          } else {
            const powerDrag = (0.0045 + Math.abs(ls.tug.speed) * 0.0022) * dt;
            if (ls.tug.speed > 0) ls.tug.speed = Math.max(0, ls.tug.speed - powerDrag);
            else if (ls.tug.speed < 0) ls.tug.speed = Math.min(0, ls.tug.speed + powerDrag);
          }
        } else {
          rampFwdRef.current = Math.max(0, rampFwdRef.current - 0.032 * dt);
          rampRevRef.current = Math.max(0, rampRevRef.current - 0.032 * dt);
          const coast = (0.011 + Math.abs(ls.tug.speed) * 0.005) * dt;
          if (ls.tug.speed > 0) ls.tug.speed = Math.max(0, ls.tug.speed - coast);
          else if (ls.tug.speed < 0) ls.tug.speed = Math.min(0, ls.tug.speed + coast);
        }
      } else {
        rampFwdRef.current *= Math.pow(0.88, dt);
        rampRevRef.current *= Math.pow(0.88, dt);
        ls.tug.speed = ls.tug.speed > 0 ? Math.max(0, ls.tug.speed - 0.085 * dt) : Math.min(0, ls.tug.speed + 0.085 * dt);
      }

      const turnRate = ls.tug.rudder * ls.tug.speed * 0.06;
      ls.tug.heading = (ls.tug.heading + turnRate * dt + 360) % 360;
      const rad = (ls.tug.heading * Math.PI) / 180;
      ls.tug.x = Math.max(WORLD_X_MIN, Math.min(WORLD_X_MAX, ls.tug.x + ls.tug.speed * K2PX * Math.sin(rad) * dt));
      ls.tug.y = Math.max(WORLD_Y_MIN, Math.min(WORLD_Y_MAX, ls.tug.y - ls.tug.speed * K2PX * Math.cos(rad) * dt));

      const tx = ls.tug.x;
      if (tx < 4500) ls.zone = "open_water";
      else if (tx < 8200) ls.zone = "sea_lanes";
      else if (tx < PATH_END_X) ls.zone = "channel";
      else ls.zone = "port";

      advanceNpcVessel(ls.cargo, dt, { k: 0.3, turnRate: 0.92 });
      advanceNpcVessel(ls.ferry, dt, { k: 0.35, turnRate: 1.02 });
      ls.fishers.forEach((f) => advanceNpcVessel(f, dt, { k: 0.35, turnRate: 1.12 }));
      ls.traffic.forEach((t) => advanceNpcVessel(t, dt, { k: 0.32, turnRate: 1.0 }));

      const camLx = Math.min(CAMERA_FOLLOW_LERP * dt, 1);
      const camLy = Math.min(CAMERA_FOLLOW_LERP * 0.65 * dt, 1);
      ls.cam.x += (ls.tug.x - ls.cam.x) * camLx;
      ls.cam.y += (ls.tug.y - ls.cam.y) * camLy;

      pruneAndSpawnEphemeralBoats(ls, dt, trafficSpawnAccRef);

      const dist2 = (ax: number, ay: number, bx: number, by: number) => {
        const dx = ax - bx;
        const dy = ay - by;
        return dx * dx + dy * dy;
      };
      const tugx = ls.tug.x;
      const tugy = ls.tug.y;
      if (collisionCdRef.current > 0) collisionCdRef.current = Math.max(0, collisionCdRef.current - dt * 0.055);
      else {
        const candidates: { o: LocalVessel; r: number }[] = [
          { o: ls.cargo, r: 52 },
          { o: ls.ferry, r: 52 },
          ...ls.fishers.map((f) => ({ o: f, r: 38 })),
          ...ls.traffic.map((t) => ({ o: t, r: 40 })),
        ];
        for (const { o, r } of candidates) {
          if (o.sunk) continue;
          if (dist2(tugx, tugy, o.x, o.y) < r * r) {
            o.sunk = true;
            o.sinkT = 0;
            collisionCdRef.current = 0.85;
            setScore((s) => Math.max(0, s - 15));
            break;
          }
        }
      }

      if (Math.random() < 0.018 && ls.cherryFlowers.length < 30) {
        cherryFlowerIdRef.current += 1;
        ls.cherryFlowers.push({
          id: cherryFlowerIdRef.current,
          x: ls.cam.x + (Math.random() - 0.5) * 720,
          y: ls.cam.y - 320 - Math.random() * 220,
          rot: Math.random() * Math.PI * 2,
          vy: 0.22 + Math.random() * 0.28,
          vx: (Math.random() - 0.5) * 0.32,
        });
      }
      ls.cherryFlowers = ls.cherryFlowers.filter((fl) => {
        fl.y += fl.vy * dt * 6.2;
        fl.x += fl.vx * dt * 6.2;
        fl.rot += 0.022 * dt;
        if (dist2(fl.x, fl.y, tugx, tugy) < 38 * 38) {
          setScore((s) => s + 8);
          return false;
        }
        return fl.y < ls.cam.y + 520 && fl.x > ls.cam.x - 900 && fl.x < ls.cam.x + 900;
      });

      if (ls.tug.x >= PATH_END_X) {
        ls.tug.x = PATH_END_X;
        ls.tug.speed = 0;
        if (!raceCompleteRef.current) {
          raceCompleteRef.current = true;
          setScore((s) => {
            setFinalScore(s);
            return s;
          });
        }
      }

      render(ctx, ls, weather);
      const nowMs = performance.now();
      const rounded = Math.round(ls.tug.rudder);
      if ((rounded !== rudderUiRef.current.lastVal && nowMs - rudderUiRef.current.lastSetAt > 120) || nowMs - rudderUiRef.current.lastSetAt > 300) {
        rudderUiRef.current.lastVal = rounded;
        rudderUiRef.current.lastSetAt = nowMs;
        setLocalRudder(rounded);
      }
      if (nowMs - teleUiRef.current.lastSetAt > 110) {
        teleUiRef.current.lastSetAt = nowMs;
        setLiveHud({
          speed: ls.tug.speed,
          heading: ls.tug.heading,
          zone: ls.zone,
          throttleCap: throttleCapRef.current,
        });
      }
    };

    animRef.current = requestAnimationFrame(loop);
    return () => {
      if (animRef.current != null) cancelAnimationFrame(animRef.current);
    };
  }, [weather]);

  const handleScenario = useCallback(
    (sc: string) => {
      setScenario(sc);
      void connect(sc);
    },
    [connect],
  );

  const handleReplay = useCallback(() => {
    void connect(scenario);
  }, [connect, scenario]);

  return (
    <div className="appShell" style={{ userSelect: "none" }}>
      <TopBar
        scenario={scenario}
        weather={weather}
        score={score}
        onScenario={handleScenario}
        onWeather={setWeather}
        onReplay={handleReplay}
      />

      <div className="panel canvasWrap" style={{ position: "relative" }}>
        <canvas ref={canvasRef} width={CW} height={CH} className="simCanvas" />
        <ExplanationPanel explanations={explanations} />
        {finalScore !== null && <PortCompleteModal finalScore={finalScore} onReplay={handleReplay} />}
      </div>

      <div className="panel" style={{ padding: 10 }}>
        <ControlPanel
          backendState={backendState}
          localRudder={localRudder}
          explanations={explanations}
          liveSpeed={liveHud.speed}
          liveHeading={liveHud.heading}
          liveZone={liveHud.zone}
          throttleCapKn={liveHud.throttleCap}
        />
      </div>
    </div>
  );
}
