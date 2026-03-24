import type { BackendState, LocalState } from "./types";

export function makeLocalState(backendState: BackendState | null): LocalState {
  const tug = backendState?.agents?.tugboat ?? {
    position_x: 0,
    position_y: 0,
    heading: 90,
    speed: 0,
  };
  const cargo = backendState?.agents?.cargo_ship ?? {
    position_x: 200,
    position_y: 0,
    heading: 90,
    speed: 4,
  };
  const ch = cargo.heading;
  return {
    // Historical: original prototype had a y-offset, keep it so visuals match previous layout.
    tug: { x: tug.position_x, y: tug.position_y + 800, heading: tug.heading, speed: tug.speed, rudder: 0 },
    cargo: {
      x: cargo.position_x,
      y: cargo.position_y + 800,
      heading: ch,
      speed: cargo.speed,
      targetHeading: ch,
    },
    ferry: { x: 800, y: 1400, heading: 92, speed: 3.5, targetHeading: 92 },
    // Cluster near spawn; `trafficSpawn` tops up lightly as you sail.
    fishers: [
      { x: 800, y: 1750, heading: 90, speed: 1.45, targetHeading: 90 },
      { x: 1500, y: 2100, heading: 268, speed: 1.5, targetHeading: 268 },
    ],
    traffic: [
      { x: 700, y: 1500, heading: 89, speed: 2.9, targetHeading: 89 },
      { x: 1400, y: 1650, heading: 91, speed: 2.95, targetHeading: 91 },
      { x: 1100, y: 1200, heading: 90, speed: 3, targetHeading: 90 },
    ],
    cam: { x: tug.position_x, y: tug.position_y + 800 },
    zone: backendState?.environment?.zone ?? "open_water",
    time: 0,
    cherryFlowers: [],
  };
}

