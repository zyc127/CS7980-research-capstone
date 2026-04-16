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
  DOCK_WATERLINE_Y,
  MOORED_SHIPS,
  WATER_ROCKS,
  type WeatherKey,
} from "./constants";
import { makeLocalState } from "./localState";
import { advanceNpcVessel } from "./npcSteer";
import { pruneAndSpawnEphemeralBoats } from "./trafficSpawn";
import { render } from "./renderer";
import { renderFPV } from "./fpvRenderer";
import type { FpvHud } from "./fpvRenderer";
import { ControlPanel } from "./components/ControlPanel";
import { ExplanationPanel } from "./components/ExplanationPanel";
import { PortCompleteModal } from "./components/PortCompleteModal";
import { RuleLog } from "./components/RuleLog";
import type { RuleLogEntry } from "./components/RuleLog";
import { TopBar } from "./components/TopBar";
import { useBackendPolling } from "./hooks/useBackendPolling";
import { useKeyboardControls } from "./hooks/useKeyboardControls";
import type { BackendState, CollisionParticle, ExplanationOut, LocalState, LocalVessel, ScorePopup } from "./types";

const Api = createApiClient();
const EXPLANATION_HOLD_MS = 7000;

/** Score milestones: [threshold, message] */
const MILESTONES: readonly [number, string][] = [
  [10,  "Nice Start!"],
  [20,  "Smooth Sailing!"],
  [50,  "Flower Collector!"],
  [100, "Master Navigator!"],
  [200, "Sea Legend!"],
];

/** Points awarded per flower depending on current combo streak. */
function comboPoints(n: number) {
  if (n <= 2) return 10;
  if (n <= 4) return 12;
  if (n <= 7) return 15;
  return 18;
}

/** World-X range for the automatic mid-path fog bank. */
const FOG_ZONE_X_START = 4500;
const FOG_ZONE_X_END   = 7500;

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
  const shakeRef = useRef({ x: 0, y: 0, t: 0 });
  const particleIdRef = useRef(0);
  const comboRef = useRef(0);
  const comboResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safeNavAccRef = useRef(0);          // seconds of collision-free movement
  const milestonesHitRef = useRef(new Set<number>());
  const popupIdRef = useRef(0);
  const toastIdRef = useRef(0);
  const scoreRef = useRef(0);              // mirrors `score` state for read-access inside rAF
  const fpvHudRef = useRef<FpvHud>({ scenario: "default", targetDockX: 0, visibility: 1.0, guidanceRequested: false, engineFailed: false });
  /** True until the player presses a movement key for the first time after (re)start. */
  const waitingForInputRef = useRef(true);
  /** Tracks whether the tug is currently in the geographic fog zone. */
  const fogZoneActiveRef = useRef(false);
  /** True once the "docking" backend scenario has been triggered this run. */
  const dockingScenarioRef = useRef(false);
  /** Set to true to force one backend sendStep on the next polling tick (regardless of movement). */
  const forceSyncRef = useRef(false);
  const nearNpcRef   = useRef(false);
  const [showLog, setShowLog] = useState(false);

  const [scenario, setScenario] = useState("default");
  const [weather, setWeather] = useState<WeatherKey>("clear");
  const [backendState, setBackendState] = useState<BackendState | null>(null);
  const [explanations, setExplanations] = useState<ExplanationOut[]>([]);
  const [ruleHistory, setRuleHistory] = useState<RuleLogEntry[]>([]);
  const [status, setStatus] = useState<"connecting" | "ok" | "error" | "no-backend">("connecting");
  const [score, setScore] = useState(0);
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [fpv, setFpv] = useState(false);
  const fpvRef = useRef(false);
  const [scorePopups, setScorePopups] = useState<ScorePopup[]>([]);
  const [milestoneToasts, setMilestoneToasts] = useState<{ id: number; text: string }[]>([]);
  const [liveHud, setLiveHud] = useState({
    speed: 0,
    heading: 0,
    zone: "open_water",
    throttleCap: 12,
    nearNpc: false,
  });

  const toggleFpv = useCallback(() => {
    setFpv((v) => {
      fpvRef.current = !v;
      return !v;
    });
  }, []);

  // 'V' key toggles first-person / top-down view
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "v") toggleFpv();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleFpv]);

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
    waitingForInputRef.current = true;
    fogZoneActiveRef.current = false;
    dockingScenarioRef.current = false;
    // Combo / safe-nav / milestone reset
    comboRef.current = 0;
    if (comboResetTimerRef.current) clearTimeout(comboResetTimerRef.current);
    comboResetTimerRef.current = null;
    safeNavAccRef.current = 0;
    milestonesHitRef.current = new Set();
    scoreRef.current = 0;
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
      setRuleHistory([]);
      lastExplanationAtRef.current = 0;
      setScore(0);
      scoreRef.current = 0;
      resetRaceFlags();
      setStatus("ok");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("Backend not available, running in demo mode:", msg);
      localStateRef.current = makeLocalState(null);
      resetRaceFlags();
      setScore(0);
      scoreRef.current = 0;
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
      fpvHudRef.current.visibility = res.state?.environment?.visibility ?? 1.0;
      fpvHudRef.current.guidanceRequested = !!(res.state?.active_events?.guidance_request_sent);
      fpvHudRef.current.engineFailed = !!(res.state?.active_events?.engine_failure)
        || ((res.state?.global_metrics?.engine_status as number ?? 1) < 0.5);
      const triggeredExplanations = res.explanations?.filter((e) => e.triggered) ?? [];
      if (triggeredExplanations.length > 0) {
        setExplanations(triggeredExplanations);
        lastExplanationAtRef.current = Date.now();
        const now = Date.now();
        setRuleHistory((prev) => {
          const DEDUP_MS = 8000;
          const newEntries = triggeredExplanations
            .filter((e) => {
              const last = prev.find((p) => p.rule_id === e.rule_id);
              return !last || now - last.loggedAt > DEDUP_MS;
            })
            .map((e) => ({ ...e, loggedAt: now }));
          if (newEntries.length === 0) return prev;
          return [...prev, ...newEntries].slice(-20);
        });
      } else if (Date.now() - lastExplanationAtRef.current > EXPLANATION_HOLD_MS) {
        setExplanations([]);
      }

      const bt = res.state?.agents?.tugboat;
      if (bt && ls) {
        // Only let the backend override speed on engine failure — rule evaluations
        // (fog limits, docking rules, etc.) are informational and must not modify
        // frontend physics, otherwise entering a fog zone or any rule trigger
        // would artificially slow the boat.
        const engineFailed =
          !!(res.state?.active_events?.engine_failure) ||
          ((res.state?.global_metrics?.engine_status as number ?? 1) < 0.5);
        if (engineFailed) {
          ls.tug.speed = Math.min(ls.tug.speed, bt.speed);
        }
        ls.zone = res.state?.environment?.zone ?? ls.zone;
      }

      // Rules are informational only — score penalties come from physics collisions only.
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
    forceSyncRef,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let last = performance.now();

    // ── Popup / toast helpers (stable closures over stable refs/setters) ──
    const spawnPopup = (
      text: string, color: string,
      worldX: number, worldY: number,
      camX: number,  camY: number,
    ) => {
      const canvasX = worldX - camX + CW / 2;
      const canvasY = worldY - camY + CH / 2;
      const leftPct = Math.max(4, Math.min(87, (canvasX / CW) * 100));
      const topPct  = Math.max(4, Math.min(80, (canvasY / CH) * 100));
      popupIdRef.current += 1;
      const pid = popupIdRef.current;
      setScorePopups(prev => [...prev, { id: pid, text, color, leftPct, topPct }]);
      setTimeout(() => setScorePopups(prev => prev.filter(p => p.id !== pid)), 1400);
    };

    const spawnToast = (text: string) => {
      toastIdRef.current += 1;
      const tid = toastIdRef.current;
      setMilestoneToasts(prev => [...prev, { id: tid, text }]);
      setTimeout(() => setMilestoneToasts(prev => prev.filter(t => t.id !== tid)), 2900);
    };

    const checkMilestones = (oldScore: number, newScore: number) => {
      for (const [thresh, msg] of MILESTONES) {
        if (oldScore < thresh && newScore >= thresh && !milestonesHitRef.current.has(thresh)) {
          milestonesHitRef.current.add(thresh);
          spawnToast(msg);
        }
      }
    };

    const loop = (now: number) => {
      animRef.current = requestAnimationFrame(loop);
      const dt = Math.min((now - last) / 16.67, 3);
      last = now;
      const ls = localStateRef.current;
      if (!ls) return;

      ls.time += 0.016 * dt;

      if (raceCompleteRef.current) {
        if (fpvRef.current) renderFPV(ctx, ls, weather, shakeRef.current, fpvHudRef.current);
        else render(ctx, ls, weather, shakeRef.current, fpvHudRef.current.targetDockX ?? 0);
        const nowMs = performance.now();
        if (nowMs - teleUiRef.current.lastSetAt > 120) {
          teleUiRef.current.lastSetAt = nowMs;
          setLiveHud({
            speed: ls.tug.speed,
            heading: ls.tug.heading,
            zone: ls.zone,
            throttleCap: throttleCapRef.current,
            nearNpc: false,
          });
        }
        return;
      }

      const k = keysRef.current;

      // ── Waiting-for-input gate: hold boat at start until first keypress ──
      if (waitingForInputRef.current) {
        const anyKey = k.fwd || k.rev || k.left || k.right || k.brake || k.throttleUp || k.throttleDown;
        if (anyKey) {
          waitingForInputRef.current = false;
        } else {
          if (fpvRef.current) renderFPV(ctx, ls, weather, shakeRef.current, fpvHudRef.current);
          else render(ctx, ls, weather, shakeRef.current, fpvHudRef.current.targetDockX ?? 0);
          const pulse = 0.55 + Math.sin(ls.time * 4.0) * 0.45;
          ctx.save();
          ctx.fillStyle = `rgba(0,0,0,${0.38 * pulse})`;
          ctx.fillRect(0, 0, CW, CH);
          ctx.fillStyle = `rgba(200,240,160,${0.82 + pulse * 0.18})`;
          ctx.font = "bold 18px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("Press any key to depart", CW / 2, CH / 2 - 10);
          ctx.font = "12px sans-serif";
          ctx.fillStyle = `rgba(180,220,140,${0.65 + pulse * 0.20})`;
          ctx.fillText("Arrow keys to steer & throttle  ·  Q / E for rudder  ·  Space to brake", CW / 2, CH / 2 + 14);
          ctx.restore();
          return;
        }
      }

      let cap = throttleCapRef.current;
      if (k.throttleUp) cap = Math.min(THROTTLE_MAX_KN, cap + 0.14 * dt);
      if (k.throttleDown) cap = Math.max(THROTTLE_MIN_KN, cap - 0.14 * dt);
      throttleCapRef.current = cap;

      if (Math.abs(ls.tug.speed) > 0.12) {
        passiveScoreAccRef.current += dt * SCORE_PASSIVE_ACC_PER_FRAME;
        if (passiveScoreAccRef.current >= 1) {
          const add = Math.floor(passiveScoreAccRef.current);
          passiveScoreAccRef.current -= add;
          const oldS = scoreRef.current;
          const newS = oldS + add;
          scoreRef.current = newS;
          setScore(newS);
          checkMilestones(oldS, newS);
        }

        // Safe navigation bonus: +5 every 20 s of collision-free movement
        safeNavAccRef.current += dt * 0.01667;
        if (safeNavAccRef.current >= 20) {
          safeNavAccRef.current -= 20;
          const oldS = scoreRef.current;
          const newS = oldS + 5;
          scoreRef.current = newS;
          setScore(newS);
          checkMilestones(oldS, newS);
          spawnPopup("+5 SAFE NAV", "#60e090", ls.tug.x, ls.tug.y - 30, ls.cam.x, ls.cam.y);
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
      const engineFailed = fpvHudRef.current.engineFailed ?? false;
      if (!k.brake) {
        if (k.fwd && !engineFailed) {
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
        } else if (k.rev && !engineFailed) {
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

      const turnRate = ls.tug.rudder * ls.tug.speed * 0.018;
      ls.tug.heading = (ls.tug.heading + turnRate * dt + 360) % 360;
      const rad = (ls.tug.heading * Math.PI) / 180;
      ls.tug.x = Math.max(WORLD_X_MIN, Math.min(WORLD_X_MAX, ls.tug.x + ls.tug.speed * K2PX * Math.sin(rad) * dt));
      ls.tug.y = Math.max(WORLD_Y_MIN, Math.min(WORLD_Y_MAX, ls.tug.y - ls.tug.speed * K2PX * Math.cos(rad) * dt));

      const tx = ls.tug.x;
      if (tx < FOG_ZONE_X_START) ls.zone = "open_water";
      else if (tx < 8200) ls.zone = "sea_lanes";
      else if (tx < PATH_END_X) ls.zone = "channel";
      else ls.zone = "port";

      // ── Geographic fog zone: auto-activate fog when tug enters SEA LANES ──
      const inFogZone = tx >= FOG_ZONE_X_START && tx <= FOG_ZONE_X_END;
      if (inFogZone !== fogZoneActiveRef.current) {
        fogZoneActiveRef.current = inFogZone;
        setWeather(inFogZone ? "fog" : "clear");
        if (inFogZone) setShowLog(true);
        if (sessionRef.current) {
          const nextScenario = inFogZone ? "fog" : "default";
          void Api.startScenario(sessionRef.current, nextScenario)
            .then(() => { forceSyncRef.current = true; })
            .catch(() => { forceSyncRef.current = true; });
        }
      }

      // ── Docking approach: switch backend to "docking" when near the final berth ──
      if (!dockingScenarioRef.current && tx >= PATH_END_X - 1200) {
        dockingScenarioRef.current = true;
        setShowLog(true);
        if (sessionRef.current) {
          void Api.startScenario(sessionRef.current, "docking")
            .then(() => { forceSyncRef.current = true; })
            .catch(() => { forceSyncRef.current = true; });
        }
      }


      // ── Rigid tow: cargo locked at fixed offset directly astern of tug ──
      {
        const TOW_LENGTH = 90;
        const hdgRad = (ls.tug.heading * Math.PI) / 180;
        ls.cargo.x = ls.tug.x - Math.sin(hdgRad) * TOW_LENGTH;
        ls.cargo.y = ls.tug.y + Math.cos(hdgRad) * TOW_LENGTH;
        ls.cargo.heading = ls.tug.heading;
        ls.cargo.speed = ls.tug.speed;
        ls.cargo.sunk = false;
        ls.cargo.sinkT = 0;
      }

      advanceNpcVessel(ls.ferry, dt, { k: 0.35, turnRate: 1.02 });
      ls.fishers.forEach((f) => advanceNpcVessel(f, dt, { k: 0.35, turnRate: 1.12 }));
      ls.traffic.forEach((t) => advanceNpcVessel(t, dt, { k: 0.32, turnRate: 1.0 }));

      // Rock/reef avoidance: NPC vessels steer clear of reefs
      WATER_ROCKS.forEach(([rwx, rwy, avoidR]) => {
        const threshold = avoidR + 55;
        const rockAvoid = (v: LocalVessel) => {
          if (v.sunk) return;
          const dx = v.x - rwx;
          const dy = v.y - rwy;
          if (dx * dx + dy * dy < threshold * threshold) {
            v.targetHeading = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
          }
        };
        rockAvoid(ls.ferry);
        ls.fishers.forEach(rockAvoid);
        ls.traffic.forEach(rockAvoid);
      });

      const camLx = Math.min(CAMERA_FOLLOW_LERP * dt, 1);
      ls.cam.x += (ls.tug.x - ls.cam.x) * camLx;

      // Dead-zone Y camera
      {
        const horizY      = CH * 0.44;
        const topBound    = horizY + 35;
        const bottomBound = CH - 35;
        const tugScreenY  = ls.tug.y - ls.cam.y + CH / 2;
        const camLy       = Math.min(CAMERA_FOLLOW_LERP * 1.5 * dt, 1);
        if (tugScreenY < topBound) {
          const targetCamY = ls.tug.y - topBound + CH / 2;
          ls.cam.y += (targetCamY - ls.cam.y) * camLy;
        } else if (tugScreenY > bottomBound) {
          const targetCamY = ls.tug.y - bottomBound + CH / 2;
          ls.cam.y += (targetCamY - ls.cam.y) * camLy;
        }
      }

      pruneAndSpawnEphemeralBoats(ls, dt, trafficSpawnAccRef);

      // Clamp all NPC vessels to water area
      {
        const horizY = CH * 0.44;
        const npcWorldMin = ls.cam.y - CH / 2 + horizY + 20;
        [ls.ferry, ...ls.fishers, ...ls.traffic].forEach(v => {
          if (!v.sunk && v.y < npcWorldMin) v.y = npcWorldMin;
        });
      }

      const dist2 = (ax: number, ay: number, bx: number, by: number) => {
        const dx = ax - bx;
        const dy = ay - by;
        return dx * dx + dy * dy;
      };
      const tugx = ls.tug.x;
      const tugy = ls.tug.y;

      if (shakeRef.current.t > 0) {
        shakeRef.current.t = Math.max(0, shakeRef.current.t - dt * 0.06);
        const mag = shakeRef.current.t * 14;
        shakeRef.current.x = (Math.random() - 0.5) * mag;
        shakeRef.current.y = (Math.random() - 0.5) * mag;
      } else {
        shakeRef.current.x = 0;
        shakeRef.current.y = 0;
      }

      if (ls.screenFlash > 0) ls.screenFlash = Math.max(0, ls.screenFlash - dt * 0.055);

      ls.collisionParticles = ls.collisionParticles.filter((p) => {
        p.life = Math.min(1, p.life + p.decay * dt);
        p.x += p.vx * dt * 60;
        p.y += p.vy * dt * 60;
        if (p.type === "debris") p.vy += 0.04 * dt;
        return p.life < 1;
      });

      if (collisionCdRef.current > 0) collisionCdRef.current = Math.max(0, collisionCdRef.current - dt * 0.055);
      else {
        const candidates: { o: LocalVessel; r: number }[] = [
          // cargo is rigidly towed — only NPCs can collide with tug
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
            // Reset combo + safe-nav streak
            comboRef.current = 0;
            if (comboResetTimerRef.current) clearTimeout(comboResetTimerRef.current);
            comboResetTimerRef.current = null;
            safeNavAccRef.current = 0;
            const deduct = Math.min(15, scoreRef.current);
            scoreRef.current = Math.max(0, scoreRef.current - 15);
            setScore(scoreRef.current);
            const cx = (tugx + o.x) / 2;
            spawnPopup(`-${deduct}`, "#ff3333", cx, (tugy + o.y) / 2, ls.cam.x, ls.cam.y);
            const cy = (tugy + o.y) / 2;
            const newParticles: CollisionParticle[] = [];
            for (let i = 0; i < 18; i++) {
              const angle = Math.random() * Math.PI * 2;
              const speed = 0.8 + Math.random() * 2.8;
              particleIdRef.current += 1;
              newParticles.push({
                id: particleIdRef.current,
                x: cx + (Math.random() - 0.5) * 16,
                y: cy + (Math.random() - 0.5) * 16,
                vx: Math.sin(angle) * speed,
                vy: -Math.abs(Math.cos(angle)) * speed - 0.5,
                life: 0,
                decay: 0.9 + Math.random() * 0.6,
                r: 2 + Math.random() * 5,
                type: "splash",
              });
            }
            for (let i = 0; i < 8; i++) {
              const angle = Math.random() * Math.PI * 2;
              const speed = 0.4 + Math.random() * 1.6;
              particleIdRef.current += 1;
              newParticles.push({
                id: particleIdRef.current,
                x: cx + (Math.random() - 0.5) * 24,
                y: cy + (Math.random() - 0.5) * 24,
                vx: Math.sin(angle) * speed,
                vy: -Math.abs(Math.cos(angle)) * speed * 0.8,
                life: 0,
                decay: 0.4 + Math.random() * 0.4,
                r: 3 + Math.random() * 6,
                type: "debris",
              });
            }
            particleIdRef.current += 1;
            newParticles.push({
              id: particleIdRef.current,
              x: cx, y: cy, vx: 0, vy: 0,
              life: 0, decay: 0.7,
              r: 20,
              type: "foam",
            });
            ls.collisionParticles.push(...newParticles);
            ls.screenFlash = 1;
            shakeRef.current.t = 1;
            break;
          }
        }

        // Moored ship separation: tug cannot overlap moored ships
        for (const { cx, bowLen, sternLen, hw } of MOORED_SHIPS) {
          const northY = DOCK_WATERLINE_Y;
          const southY = northY + hw * 2;
          const bowX   = cx + bowLen;
          const sternX = cx - sternLen;
          const TUG_R = 18;
          const clampX = Math.max(sternX, Math.min(bowX, tugx));
          const clampY = Math.max(northY, Math.min(southY, tugy));
          const dx = tugx - clampX;
          const dy = tugy - clampY;
          const distSq = dx * dx + dy * dy;
          if (distSq < TUG_R * TUG_R && distSq > 0.01) {
            const dist = Math.sqrt(distSq);
            const push = (TUG_R - dist) / dist;
            ls.tug.x += dx * push;
            ls.tug.y += dy * push;
            if (shakeRef.current.t < 0.3) {
              shakeRef.current.t = 0.3;
              comboRef.current = 0;
              safeNavAccRef.current = 0;
              const mDeduct = Math.min(3, scoreRef.current);
              scoreRef.current = Math.max(0, scoreRef.current - 3);
              setScore(scoreRef.current);
              spawnPopup(`-${mDeduct}`, "#ff5555", tugx, tugy, ls.cam.x, ls.cam.y);
            }
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
          // Combo streak
          comboRef.current += 1;
          const n   = comboRef.current;
          const pts = comboPoints(n);
          // Reset combo timer (4 s of inactivity resets it)
          if (comboResetTimerRef.current) clearTimeout(comboResetTimerRef.current);
          comboResetTimerRef.current = setTimeout(() => { comboRef.current = 0; }, 4000);
          // Score + milestone
          const oldS = scoreRef.current;
          const newS = oldS + pts;
          scoreRef.current = newS;
          setScore(newS);
          checkMilestones(oldS, newS);
          // Popup text: show combo label from ×3 onward
          const label = n >= 3 ? `+${pts}  ×${n} COMBO` : `+${pts}`;
          spawnPopup(label, "#ff88cc", fl.x, fl.y, ls.cam.x, ls.cam.y);
          return false;
        }
        return fl.y < ls.cam.y + 520 && fl.x > ls.cam.x - 900 && fl.x < ls.cam.x + 900;
      });

      if (ls.tug.x >= PATH_END_X) {
        ls.tug.x = PATH_END_X;
        ls.tug.speed = 0;
        if (!raceCompleteRef.current) {
          raceCompleteRef.current = true;
          setFinalScore(scoreRef.current);
        }
      }

      if (fpvRef.current) renderFPV(ctx, ls, weather, shakeRef.current, fpvHudRef.current);
      else render(ctx, ls, weather, shakeRef.current, fpvHudRef.current.targetDockX ?? 0);
      const nowMs = performance.now();
      if (nowMs - teleUiRef.current.lastSetAt > 110) {
        teleUiRef.current.lastSetAt = nowMs;
        const NPC_WARN_DIST = 200;
        const nearNpc = [...ls.fishers, ...ls.traffic].some(
          (v) => !v.sunk && Math.sqrt(dist2(tugx, tugy, v.x, v.y)) < NPC_WARN_DIST,
        );
        if (nearNpc && !nearNpcRef.current) {
          nearNpcRef.current = true;
          forceSyncRef.current = true;
          setShowLog(true);
        } else if (!nearNpc) {
          nearNpcRef.current = false;
        }
        setLiveHud({
          speed: ls.tug.speed,
          heading: ls.tug.heading,
          zone: ls.zone,
          throttleCap: throttleCapRef.current,
          nearNpc,
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
      // Non-fog scenarios always clear the weather (fog is now geographic mid-path)
      setWeather("clear");
      fogZoneActiveRef.current = false;
      dockingScenarioRef.current = false;
      fpvHudRef.current = { ...fpvHudRef.current, scenario: sc, targetDockX: 0, guidanceRequested: false, visibility: 1.0, engineFailed: false };
      void connect(sc).then(() => {
        // Force a backend step right after the new session is ready so rules show immediately
        window.setTimeout(() => { forceSyncRef.current = true; setShowLog(true); }, 200);
      });
    },
    [connect],
  );

  /** Weather button handler: also forces a backend rule-engine poll immediately. */
  const handleWeather = useCallback((w: WeatherKey) => {
    setWeather(w);
    setShowLog(true);
    if (sessionRef.current) {
      void Api.startScenario(sessionRef.current, w === "fog" ? "fog" : "default")
        .then(() => { forceSyncRef.current = true; })
        .catch(() => { forceSyncRef.current = true; });
    }
  }, []);

  const handleReplay = useCallback(() => {
    setWeather("clear");
    fogZoneActiveRef.current = false;
    dockingScenarioRef.current = false;
    void connect(scenario);
  }, [connect, scenario]);

  return (
    <div className="appShell" style={{ userSelect: "none" }}>
      {/* In FPV mode lift the TopBar above the canvas overlay via z-index */}
      <div style={fpv ? { position: "relative", zIndex: 1001 } : undefined}>
        <TopBar
          scenario={scenario}
          weather={weather}
          score={score}
          fpv={fpv}
          onScenario={handleScenario}
          onWeather={handleWeather}
          onReplay={handleReplay}
          onToggleFpv={toggleFpv}
        />
      </div>

      <div className={fpv ? "fpvFullscreen" : "panel canvasWrap"} style={fpv ? undefined : { position: "relative" }}>
        {/* Inner wrapper so popup % coordinates map exactly onto canvas pixels */}
        <div className="canvasOverlay">
          <canvas
            ref={canvasRef}
            width={CW}
            height={CH}
            className="simCanvas"
          />
          {/* Floating score popups */}
          {scorePopups.map(p => (
            <div
              key={p.id}
              className="scorePopup"
              style={{ left: `${p.leftPct}%`, top: `${p.topPct}%`, color: p.color }}
            >
              {p.text}
            </div>
          ))}
          {/* Milestone toasts */}
          {milestoneToasts.map(t => (
            <div key={t.id} className="milestoneToast">{t.text}</div>
          ))}
        </div>
        {showLog && <ExplanationPanel
          explanations={explanations}
          onClose={() => { setShowLog(false); setExplanations([]); }}
        />}
        {finalScore !== null && <PortCompleteModal finalScore={finalScore} onReplay={handleReplay} />}
      </div>

      {!fpv && (
        <div className="panel" style={{ padding: "6px 8px", flexShrink: 0 }}>
          <ControlPanel
            backendState={backendState}
            explanations={explanations}
            liveSpeed={liveHud.speed}
            liveHeading={liveHud.heading}
            liveZone={liveHud.zone}
            throttleCapKn={liveHud.throttleCap}
            nearNpc={liveHud.nearNpc}
          />
        </div>
      )}
      {!fpv && (
        <div className="panel" style={{ padding: "0 8px 6px", flexShrink: 0 }}>
          <RuleLog entries={ruleHistory} />
        </div>
      )}
    </div>
  );
}
