import { DOCK_WATERLINE_Y, START_PORT_X } from "./constants";
import type { BackendState, LocalState } from "./types";

/** World Y of the tug when moored at the start port (just off the dock face). */
const START_TUG_Y = DOCK_WATERLINE_Y + 44;

/** Fixed tow distance: cargo sits this many world-units astern of the tug. */
export const TOW_LENGTH = 90;

export function makeLocalState(backendState: BackendState | null): LocalState {
  // Always spawn at the fixed start port regardless of backend position.
  const startHeading = 90; // facing east
  const hdgRad = (startHeading * Math.PI) / 180;
  return {
    tug: { x: START_PORT_X, y: START_TUG_Y, heading: startHeading, speed: 0, rudder: 0 },
    // Cargo ship rigidly towed at TOW_LENGTH astern of the tug (active from the start).
    cargo: {
      x: START_PORT_X - Math.sin(hdgRad) * TOW_LENGTH,
      y: START_TUG_Y + Math.cos(hdgRad) * TOW_LENGTH,
      heading: startHeading,
      speed: 0,
      targetHeading: startHeading,
      sunk: false,
      sinkT: 0,
    },
    ferry: { x: 800, y: 1400, heading: 92, speed: 0, targetHeading: 92, sunk: true, sinkT: 1 },
    // Fewer but larger NPC vessels for visual clarity.
    fishers: [
      { x: 900, y: 1700, heading: 90, speed: 1.45, targetHeading: 90 },
    ],
    traffic: [
      { x: 700, y: 1500, heading: 89, speed: 2.9, targetHeading: 89 },
    ],
    cam: { x: START_PORT_X, y: START_TUG_Y },
    zone: backendState?.environment?.zone ?? "open_water",
    time: 0,
    cherryFlowers: [],
    collisionParticles: [],
    screenFlash: 0,
  };
}
