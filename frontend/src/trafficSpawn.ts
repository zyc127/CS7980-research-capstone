import { WORLD_X_MAX, WORLD_X_MIN, WORLD_Y_MAX, WORLD_Y_MIN } from "./constants";
import type { LocalState, LocalVessel } from "./types";

/** Boats farther than this from camera are removed (unless sinking). */
const FAR_FROM_CAM = 1800;
/** Try to keep about this many NPC boats near the center view. */
const TARGET_NEAR_CAM = 2;
const SPAWN_ACCUM_SEC = 1.55;
const MAX_TRAFFIC = 3;
const MAX_FISHERS = 1;
const SPAWN_MIN_DIST = 220;
const SPAWN_MAX_DIST = 520;
const KEEP_AROUND_CAM_DIST = 980;

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function spawnOne(ls: LocalState, asFisher: boolean) {
  const cx = ls.cam.x;
  const cy = ls.cam.y;
  const ang = Math.random() * Math.PI * 2;
  const dist = SPAWN_MIN_DIST + Math.random() * (SPAWN_MAX_DIST - SPAWN_MIN_DIST);
  let x = cx + Math.cos(ang) * dist;
  let y = cy + Math.sin(ang) * dist;
  x = clamp(x, WORLD_X_MIN + 100, WORLD_X_MAX - 100);
  y = clamp(y, WORLD_Y_MIN + 100, WORLD_Y_MAX - 100);
  const toCamHeading = ((Math.atan2(cx - x, -(cy - y)) * 180) / Math.PI + 360) % 360;
  const h = toCamHeading + (Math.random() * 70 - 35);
  const v: LocalVessel = {
    x,
    y,
    heading: h,
    speed: asFisher ? 0.9 + Math.random() * 0.35 : 1.5 + Math.random() * 0.7,
    targetHeading: h,
  };
  if (asFisher) {
    if (ls.fishers.length < MAX_FISHERS) ls.fishers.push(v);
  } else if (ls.traffic.length < MAX_TRAFFIC) {
    ls.traffic.push(v);
  }
}

/**
 * Drops boats that have sailed out of range (player didn’t hit them) and spawns new ones near the camera.
 */
export function pruneAndSpawnEphemeralBoats(ls: LocalState, dt: number, spawnAcc: { current: number }) {
  const cx = ls.cam.x;
  const cy = ls.cam.y;

  const keepNear = (v: LocalVessel) => {
    if (v.sunk && (v.sinkT ?? 0) >= 1) return false;
    const d = Math.hypot(v.x - cx, v.y - cy);
    if (v.sunk) return d < FAR_FROM_CAM * 1.25;
    return d < FAR_FROM_CAM;
  };

  ls.traffic = ls.traffic.filter(keepNear);
  ls.fishers = ls.fishers.filter(keepNear);
  for (const v of [...ls.traffic, ...ls.fishers]) {
    if (v.sunk) continue;
    const d = Math.hypot(v.x - cx, v.y - cy);
    if (d > KEEP_AROUND_CAM_DIST) {
      const returnHeading = ((Math.atan2(cx - v.x, -(cy - v.y)) * 180) / Math.PI + 360) % 360;
      v.targetHeading = returnHeading;
    }
  }

  const near = [...ls.traffic, ...ls.fishers].filter(
    (v) => !v.sunk && Math.hypot(v.x - cx, v.y - cy) < 700,
  ).length;

  spawnAcc.current += dt;
  if (spawnAcc.current < SPAWN_ACCUM_SEC) return;
  spawnAcc.current = 0;

  if (near >= TARGET_NEAR_CAM) return;
  const toAdd = Math.min(1, TARGET_NEAR_CAM - near);
  for (let i = 0; i < toAdd; i++) {
    if (ls.traffic.length + ls.fishers.length >= MAX_TRAFFIC + MAX_FISHERS) break;
    spawnOne(ls, Math.random() < 0.4);
  }
}
