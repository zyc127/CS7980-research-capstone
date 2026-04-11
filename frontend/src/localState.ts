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
  const tugHeadingRad = (tug.heading * Math.PI) / 180;
  return {
    // Historical: original prototype had a y-offset, keep it so visuals match previous layout.
    tug: { x: tug.position_x, y: tug.position_y + 800, heading: tug.heading, speed: tug.speed, rudder: 0 },
    // Escort ship starts 100px directly behind the tug
    escort: {
      x: tug.position_x - Math.sin(tugHeadingRad) * 100,
      y: tug.position_y + 800 + Math.cos(tugHeadingRad) * 100,
      heading: tug.heading,
      speed: tug.speed,
      targetHeading: tug.heading,
    },
    cargo: {
      x: cargo.position_x,
      y: cargo.position_y + 800,
      heading: ch,
      speed: cargo.speed,
      targetHeading: ch,
    },
    ferry: { x: 800, y: 1400, heading: 92, speed: 3.5, targetHeading: 92 },
    // Fewer but larger NPC vessels for visual clarity.
    fishers: [
      { x: 900, y: 1700, heading: 90, speed: 1.45, targetHeading: 90 },
    ],
    traffic: [
      { x: 700, y: 1500, heading: 89, speed: 2.9, targetHeading: 89 },
    ],
    cam: { x: tug.position_x, y: tug.position_y + 800 },
    zone: backendState?.environment?.zone ?? "open_water",
    time: 0,
    cherryFlowers: [],
    collisionParticles: [],
    screenFlash: 0,
  };
}

