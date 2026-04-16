import type { LocalState } from "./types";

/** Closest distance from tug center to ferry / fishers / traffic (excludes cargo & escort). */
export function minDistanceToNpcVessels(ls: LocalState): number | null {
  const tx = ls.tug.x;
  const ty = ls.tug.y;
  let d = Infinity;
  if (!ls.ferry.sunk) d = Math.min(d, Math.hypot(ls.ferry.x - tx, ls.ferry.y - ty));
  for (const f of ls.fishers) {
    if (!f.sunk) d = Math.min(d, Math.hypot(f.x - tx, f.y - ty));
  }
  for (const t of ls.traffic) {
    if (!t.sunk) d = Math.min(d, Math.hypot(t.x - tx, t.y - ty));
  }
  return d === Infinity ? null : d;
}

/**
 * Single “closest hazard” reading for HUD: local tug↔cargo, local NPCs, and last backend
 * tug↔cargo metric (when present). Uses the minimum so the alarm tracks visual traffic
 * even though NPCs are not in the rule engine.
 */
export function effectiveHazardDistanceM(
  tugCargoCenterDist: number,
  backendTugCargoM: number | undefined,
  npcMin: number | null,
): number {
  const parts: number[] = [tugCargoCenterDist];
  if (npcMin != null && Number.isFinite(npcMin)) parts.push(npcMin);
  if (typeof backendTugCargoM === "number" && Number.isFinite(backendTugCargoM)) {
    parts.push(backendTugCargoM);
  }
  return Math.min(...parts);
}
