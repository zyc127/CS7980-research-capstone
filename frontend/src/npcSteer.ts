import { WORLD_X_MAX, WORLD_X_MIN, WORLD_Y_MAX, WORLD_Y_MIN } from "./constants";
import type { LocalVessel } from "./types";

/** Shortest-path turn toward target, max `maxRate` degrees per step. */
export function smoothTurn(heading: number, target: number, maxRate: number): number {
  let d = ((target - heading + 540) % 360) - 180;
  const step = Math.sign(d) * Math.min(Math.abs(d), maxRate);
  return (heading + step + 360) % 360;
}

/**
 * Stable NPC motion: holds `targetHeading` at sea; near world bounds steers smoothly back.
 * Sunk vessels stop moving and sink animation progresses.
 */
export function advanceNpcVessel(v: LocalVessel, dt: number, opts: { k: number; turnRate: number }) {
  if (v.sunk) {
    v.sinkT = Math.min(1, (v.sinkT ?? 0) + 0.017 * dt);
    v.speed *= 0.93;
    return;
  }
  const margin = 240;
  let target = v.targetHeading ?? v.heading;
  if (v.x < WORLD_X_MIN + margin) target = 88;
  else if (v.x > WORLD_X_MAX - margin) target = 268;
  else if (v.y < WORLD_Y_MIN + margin) target = 178;
  else if (v.y > WORLD_Y_MAX - margin) target = 2;

  v.heading = smoothTurn(v.heading, target, opts.turnRate * dt);
  const r2 = (v.heading * Math.PI) / 180;
  const k = opts.k;
  v.x += v.speed * k * Math.sin(r2) * dt;
  v.y -= v.speed * k * Math.cos(r2) * dt;
}
