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
  DOCK_A_CENTER_X,
  DOCK_B_CENTER_X,
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
import type { BackendState, CollisionParticle, ExplanationOut, LocalState, LocalVessel } from "./types";

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
  const shakeRef = useRef({ x: 0, y: 0, t: 0 });
  const particleIdRef = useRef(0);
  const fpvHudRef = useRef<FpvHud>({ scenario: "default", targetDockX: 0, visibility: 1.0, guidanceRequested: false, engineFailed: false });

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
  const [liveHud, setLiveHud] = useState({
    speed: 0,
    heading: 0,
    zone: "open_water",
    throttleCap: 12,
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
      // 同步 HUD 状态到渲染器 ref
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
          // 去重：同一规则 8 秒内不重复记录，避免连续满足条件时刷屏
          const DEDUP_MS = 8000;
          const newEntries = triggeredExplanations
            .filter((e) => {
              const last = prev.find((p) => p.rule_id === e.rule_id);
              return !last || now - last.loggedAt > DEDUP_MS;
            })
            .map((e) => ({ ...e, loggedAt: now }));
          if (newEntries.length === 0) return prev;
          return [...newEntries, ...prev].slice(0, 10);
        });
      } else if (Date.now() - lastExplanationAtRef.current > EXPLANATION_HOLD_MS) {
        setExplanations([]);
      }

      const bt = res.state?.agents?.tugboat;
      const bc = res.state?.agents?.cargo_ship;
      if (bt && ls) {
        // 后端只能降低速度（规则限速），不覆盖前端加速物理
        // 这样规则上限依然有效，但不会在每次轮询时硬置速度导致卡顿
        ls.tug.speed = Math.min(ls.tug.speed, bt.speed);
        ls.zone = res.state?.environment?.zone ?? ls.zone;
      }
      if (bc && ls) {
        ls.cargo.speed = bc.speed;
        ls.cargo.heading = bc.heading;
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
      if (tx < 4500) ls.zone = "open_water";
      else if (tx < 8200) ls.zone = "sea_lanes";
      else if (tx < PATH_END_X) ls.zone = "channel";
      else ls.zone = "port";

      // Escort ship: tight stern follow — low inertia, short leash.
      // The escort should feel like it's lashed to the tug, not free-floating.
      {
        const STATION_DIST = 120; // target following distance (px)
        const MAX_LEASH    = 180; // hard max distance before position snap
        const SAFE_DIST    = 28;  // minimum clearance before braking
        const CRIT_DIST    = 16;  // emergency: steer away immediately

        // Station point = directly astern of the tug.
        // Y clamped so the station never drifts into the shore when tug turns south.
        const tugRad   = (ls.tug.heading * Math.PI) / 180;
        const stationX = ls.tug.x - Math.sin(tugRad) * STATION_DIST;
        const stationY = Math.max(DOCK_WATERLINE_Y + 50,
                                  ls.tug.y + Math.cos(tugRad) * STATION_DIST);

        const stDx = stationX - ls.escort.x;
        const stDy = stationY - ls.escort.y;
        const stDist = Math.sqrt(stDx * stDx + stDy * stDy);

        const tugDx = ls.tug.x - ls.escort.x;
        const tugDy = ls.tug.y - ls.escort.y;
        const tugDist = Math.sqrt(tugDx * tugDx + tugDy * tugDy);

        if (tugDist < CRIT_DIST) {
          ls.escort.targetHeading = ((Math.atan2(-tugDx, tugDy) * 180) / Math.PI + 360) % 360;
          ls.escort.speed = Math.max(0, ls.escort.speed * 0.3 - 0.8 * dt);
        } else if (tugDist < SAFE_DIST) {
          ls.escort.speed = Math.max(0, ls.escort.speed * 0.5 - 0.3 * dt);
        } else {
          if (stDist > 4) {
            ls.escort.targetHeading = ((Math.atan2(stDx, -stDy) * 180) / Math.PI + 360) % 360;
          }
          // Responsive speed: snap quickly to tug speed, boost when far from station
          const distRatio = Math.min(3, stDist / STATION_DIST);
          const targetSpd = ls.tug.speed * (0.9 + distRatio * 0.5);
          // High lerp factor = low inertia — escort matches speed almost immediately
          ls.escort.speed += (targetSpd - ls.escort.speed) * Math.min(0.35 * dt, 1);
          ls.escort.speed  = Math.max(0, Math.min(ls.tug.speed * 2.5, ls.escort.speed));
        }

        // Hard leash: if escort drifts too far, snap it back to MAX_LEASH from tug
        if (tugDist > MAX_LEASH && tugDist > 0.01) {
          const t = (tugDist - MAX_LEASH) / tugDist;
          ls.escort.x += tugDx * t;
          ls.escort.y += tugDy * t;
        }
      }
      advanceNpcVessel(ls.escort, dt, { k: K2PX, turnRate: 3.5 });

      // Shore bounce: keep escort in navigable water (y >= dock waterline).
      // When the tug turns toward the shore the computed station point can land
      // north of DOCK_WATERLINE_Y, causing the escort to drift into the "sky".
      {
        const ESCORT_Y_MIN = DOCK_WATERLINE_Y + 28;
        if (ls.escort.y < ESCORT_Y_MIN) {
          ls.escort.y = ESCORT_Y_MIN;
          // If moving northward (cos(heading) > 0 → y is decreasing), reflect heading
          if (Math.cos((ls.escort.heading * Math.PI) / 180) > 0) {
            ls.escort.heading = (180 - ls.escort.heading + 360) % 360;
            ls.escort.targetHeading = ls.escort.heading;
          }
        }
      }

      advanceNpcVessel(ls.cargo, dt, { k: 0.3, turnRate: 0.92 });

      advanceNpcVessel(ls.ferry, dt, { k: 0.35, turnRate: 1.02 });
      ls.fishers.forEach((f) => advanceNpcVessel(f, dt, { k: 0.35, turnRate: 1.12 }));
      ls.traffic.forEach((t) => advanceNpcVessel(t, dt, { k: 0.32, turnRate: 1.0 }));

      // Bidirectional cargo-ship avoidance: NPC vessels steer away from cargo, and cargo steers away from NPCs
      const cargoDodge = (v: LocalVessel, avoidDist = 170) => {
        if (v.sunk) return;
        const dx = v.x - ls.cargo.x;
        const dy = v.y - ls.cargo.y;
        const dist2 = dx * dx + dy * dy;
        if (dist2 < avoidDist * avoidDist) {
          v.targetHeading = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
          ls.cargo.targetHeading = ((Math.atan2(-dx, dy) * 180) / Math.PI + 360) % 360;
        }
      };
      cargoDodge(ls.ferry);
      ls.fishers.forEach(cargoDodge);
      ls.traffic.forEach(cargoDodge);

      // Hard separation: physically push NPC vessels out of cargo ship's hull
      // (steering-only avoidance is too slow when vessels are already overlapping)
      const cargoSepRadius = 55; // cargo hull collision radius (px / world units)
      const separateFromCargo = (v: LocalVessel, vRadius: number) => {
        if (v.sunk) return;
        const dx = v.x - ls.cargo.x;
        const dy = v.y - ls.cargo.y;
        const distSq = dx * dx + dy * dy;
        const minDist = vRadius + cargoSepRadius;
        if (distSq < minDist * minDist && distSq > 0.01) {
          const dist = Math.sqrt(distSq);
          const overlap = (minDist - dist) / dist;
          // Push both vessels apart equally
          v.x += dx * overlap * 0.55;
          v.y += dy * overlap * 0.55;
          ls.cargo.x -= dx * overlap * 0.45;
          ls.cargo.y -= dy * overlap * 0.45;
        }
      };
      separateFromCargo(ls.ferry, 52);
      ls.fishers.forEach((f) => separateFromCargo(f, 38));
      ls.traffic.forEach((t) => separateFromCargo(t, 40));

      // Rock/reef avoidance: all NPC vessels (including cargo) steer clear of reefs
      WATER_ROCKS.forEach(([rwx, rwy, avoidR]) => {
        const threshold = avoidR + 55; // add margin beyond visual radius
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
        rockAvoid(ls.cargo);
      });

      // ── Cargo ship constraints (applied AFTER all avoidance forces) ──────
      if (!ls.cargo.sunk) {
        // Dynamic Y_MIN: cargo cannot go north of the tug's lane (follows tug northward)
        const CARGO_Y_MIN = Math.max(DOCK_WATERLINE_Y + 20, ls.tug.y - 80);
        const CARGO_Y_MAX = WORLD_Y_MAX - 100; // cargo can follow tug anywhere south
        const MAX_DIST    = 320; // hard max distance tug↔cargo

        // Hard distance snap: every frame, force cargo within MAX_DIST of tug.
        // Unlike a soft pull this cannot be outrun by velocity.
        const ldx = ls.cargo.x - ls.tug.x;
        const ldy = ls.cargo.y - ls.tug.y;
        const ldist = Math.sqrt(ldx * ldx + ldy * ldy);
        if (ldist > MAX_DIST) {
          ls.cargo.x = ls.tug.x + (ldx / ldist) * MAX_DIST;
          ls.cargo.y = ls.tug.y + (ldy / ldist) * MAX_DIST;
        }

        // Lane Y: cargo should stay at roughly the same Y as the tug
        const yErr = ls.cargo.y - ls.tug.y;
        if (Math.abs(yErr) > 50) {
          ls.cargo.targetHeading = yErr > 0 ? 352 : 8;
        } else if (Math.abs(yErr) < 20) {
          ls.cargo.targetHeading = 90;
        }

        // Absolute position bounds
        ls.cargo.x = Math.max(WORLD_X_MIN, Math.min(WORLD_X_MAX, ls.cargo.x));
        ls.cargo.y = Math.max(CARGO_Y_MIN, Math.min(CARGO_Y_MAX, ls.cargo.y));
      }

      const camLx = Math.min(CAMERA_FOLLOW_LERP * dt, 1);
      ls.cam.x += (ls.tug.x - ls.cam.x) * camLx;

      // Dead-zone Y camera: tug can move freely through the middle 60% of the water
      // area without the camera following. Camera only catches up when the tug gets
      // close to the top or bottom edge, allowing the tug to actually "reach" either edge.
      {
        const horizY     = CH * 0.36;             // same as renderer
        const topBound   = horizY + 35;           // min screen Y for tug (just inside water)
        const bottomBound= CH - 35;               // max screen Y for tug (near screen bottom)
        const tugScreenY = ls.tug.y - ls.cam.y + CH / 2;
        const camLy      = Math.min(CAMERA_FOLLOW_LERP * 1.5 * dt, 1);
        if (tugScreenY < topBound) {
          // tug too close to top — push camera north to keep it at topBound
          const targetCamY = ls.tug.y - topBound + CH / 2;
          ls.cam.y += (targetCamY - ls.cam.y) * camLy;
        } else if (tugScreenY > bottomBound) {
          // tug too close to bottom — push camera south to keep it at bottomBound
          const targetCamY = ls.tug.y - bottomBound + CH / 2;
          ls.cam.y += (targetCamY - ls.cam.y) * camLy;
        }
        // else: camera Y stays fixed, tug moves freely up/down the screen
      }

      // After camera settles, enforce that cargo screen-Y stays inside the water area.
      // horizY = CH * 0.36 (same formula as renderer); add 28px safety margin.
      if (!ls.cargo.sunk) {
        const horizY = CH * 0.36;
        const worldCargoMin = ls.cam.y - CH / 2 + horizY + 28;
        if (ls.cargo.y < worldCargoMin) {
          ls.cargo.y = worldCargoMin;
          if (Math.cos((ls.cargo.heading * Math.PI) / 180) > 0)
            ls.cargo.targetHeading = 180;
        }
      }

      pruneAndSpawnEphemeralBoats(ls, dt, trafficSpawnAccRef);

      // Clamp all NPC vessels to water area (screen Y > horizY + margin)
      {
        const horizY = CH * 0.36;
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
      // Decay camera shake
      if (shakeRef.current.t > 0) {
        shakeRef.current.t = Math.max(0, shakeRef.current.t - dt * 0.06);
        const mag = shakeRef.current.t * 14;
        shakeRef.current.x = (Math.random() - 0.5) * mag;
        shakeRef.current.y = (Math.random() - 0.5) * mag;
      } else {
        shakeRef.current.x = 0;
        shakeRef.current.y = 0;
      }

      // Decay screen flash
      if (ls.screenFlash > 0) ls.screenFlash = Math.max(0, ls.screenFlash - dt * 0.055);

      // Update collision particles
      ls.collisionParticles = ls.collisionParticles.filter((p) => {
        p.life = Math.min(1, p.life + p.decay * dt);
        p.x += p.vx * dt * 60;
        p.y += p.vy * dt * 60;
        if (p.type === "debris") p.vy += 0.04 * dt; // gravity
        return p.life < 1;
      });

      if (collisionCdRef.current > 0) collisionCdRef.current = Math.max(0, collisionCdRef.current - dt * 0.055);
      else {
        const candidates: { o: LocalVessel; r: number }[] = [
          // escort is excluded — it is towed by the tug and cannot be sunk by collision
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

            // Spawn collision particles at impact point (midpoint between tug and hit ship)
            const cx = (tugx + o.x) / 2;
            const cy = (tugy + o.y) / 2;
            const newParticles: CollisionParticle[] = [];
            // Water splash drops
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
            // Debris chunks
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
            // Foam ring (single large expanding ring)
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

        // NPC collision with escort ship (no sinking, just effects + score deduction)
        if (!ls.escort.sunk) {
          const escortNpcs: { o: LocalVessel; r: number }[] = [
            { o: ls.ferry,  r: 52 },
            ...ls.fishers.map((f) => ({ o: f, r: 38 })),
            ...ls.traffic.map((t) => ({ o: t, r: 40 })),
          ];
          for (const { o, r } of escortNpcs) {
            if (o.sunk) continue;
            const hitR = r + 22; // escort radius ≈ 22
            if (dist2(ls.escort.x, ls.escort.y, o.x, o.y) < hitR * hitR) {
              o.sunk = true;
              o.sinkT = 0;
              collisionCdRef.current = 0.85;
              setScore((s) => Math.max(0, s - 15));
              const cx = (ls.escort.x + o.x) / 2;
              const cy = (ls.escort.y + o.y) / 2;
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
                  life: 0, decay: 0.9 + Math.random() * 0.6, r: 2 + Math.random() * 5, type: "splash",
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
                  life: 0, decay: 0.4 + Math.random() * 0.4, r: 3 + Math.random() * 6, type: "debris",
                });
              }
              particleIdRef.current += 1;
              newParticles.push({ id: particleIdRef.current, x: cx, y: cy, vx: 0, vy: 0, life: 0, decay: 0.7, r: 20, type: "foam" });
              ls.collisionParticles.push(...newParticles);
              ls.screenFlash = 1;
              shakeRef.current.t = 1;
              break;
            }
          }
        }

        // Moored ship separation: tug cannot overlap moored ships (hard pushback)
        // Moored ships are static—only push the tug away.
        for (const { cx, bowLen, sternLen, hw } of MOORED_SHIPS) {
          const northY = DOCK_WATERLINE_Y;
          const southY = northY + hw * 2;
          const bowX   = cx + bowLen;
          const sternX = cx - sternLen;
          const TUG_R = 18; // tug collision radius (world units)
          // Closest point on the ship rectangle to the tug center
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
            // Light shake on first contact
            if (shakeRef.current.t < 0.3) {
              shakeRef.current.t = 0.3;
              setScore((s) => Math.max(0, s - 3));
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

      if (fpvRef.current) renderFPV(ctx, ls, weather, shakeRef.current, fpvHudRef.current);
      else render(ctx, ls, weather, shakeRef.current, fpvHudRef.current.targetDockX ?? 0);
      const nowMs = performance.now();
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
      // 雾导航模式自动切换到雾天气；其他模式恢复晴天
      if (sc === "fog") {
        setWeather("fog");
      } else {
        setWeather("clear");
      }
      // 靠泊模式随机分配目标泊位
      let targetDockX = 0;
      if (sc === "docking") {
        const docks = [DOCK_A_CENTER_X, DOCK_B_CENTER_X];
        targetDockX = docks[Math.floor(Math.random() * docks.length)];
      }
      fpvHudRef.current = { ...fpvHudRef.current, scenario: sc, targetDockX, guidanceRequested: false, visibility: 1.0, engineFailed: false };
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
        fpv={fpv}
        onScenario={handleScenario}
        onWeather={setWeather}
        onReplay={handleReplay}
        onToggleFpv={toggleFpv}
      />

      <div className="panel canvasWrap" style={{ position: "relative" }}>
        <canvas ref={canvasRef} width={CW} height={CH} className="simCanvas" />
        <ExplanationPanel explanations={explanations} />
        {finalScore !== null && <PortCompleteModal finalScore={finalScore} onReplay={handleReplay} />}
      </div>

      {!fpv && (
        <div className="panel" style={{ padding: 8 }}>
          <ControlPanel
            backendState={backendState}
            explanations={explanations}
            liveSpeed={liveHud.speed}
            liveHeading={liveHud.heading}
            liveZone={liveHud.zone}
            throttleCapKn={liveHud.throttleCap}
          />
        </div>
      )}

      <RuleLog entries={ruleHistory} />
    </div>
  );
}
