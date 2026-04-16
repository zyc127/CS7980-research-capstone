export const CW = 1200;
/** Taller canvas = more vertical “water” to race in (see horizY in renderer). */
export const CH = 780;

/** World bounds for local kinematics (longer run along X / Y). */
export const WORLD_X_MIN = 50;
export const WORLD_X_MAX = 12000;
export const WORLD_Y_MIN = 400;
export const WORLD_Y_MAX = 5200;

/** Legacy constant (backend / docs); client zones use `App` + `renderer` band wx. */
export const ZONE_HARBOUR_ENTRY_END = 7000;
/** Shared waterline Y for piers / port quay (world). */
export const DOCK_WATERLINE_Y = 756;
/** Two independent docks along the course (world X, pier faces water). */
export const DOCK_A_CENTER_X = 3300;
export const DOCK_B_CENTER_X = 5900;
/** Starting port — tug always spawns here (world X). */
export const START_PORT_X = 200;
/** After berth: water gives way to port basin (world X). */
export const PORT_BASIN_START_X = 7800;
/** End of navigable channel — stop & score here. */
export const PATH_END_X = 11200;
/** Throttle cap range (kn) for Arrow Up/Down. */
export const THROTTLE_MIN_KN = 5;
export const THROTTLE_MAX_KN = 18;

export const MAX_RUDDER = 35;

// Local physics constants (client-side interpolation only)
/** Degrees per frame-unit when holding Q/E (lower = heavier helm). */
export const RUDDER_RATE = 0.32;
/** Return-to-amidships when keys released (higher = faster centering, less overshoot). */
export const RUDDER_RTN = 0.42;
export const LOCAL_ACCEL = 0.03;
export const LOCAL_DRAG = 0.012;
export const K2PX = 0.55; // knots → pixels/frame for local rendering
/** Camera lerp toward tug each frame (higher = tighter follow when turning). */
export const CAMERA_FOLLOW_LERP = 0.11;

/** Passive score gain while moving (accumulator per frame-dt ≈1 @ 60fps → ~0.7 pts/s). */
export const SCORE_PASSIVE_ACC_PER_FRAME = 0.011;

/**
 * Static moored ships at the port quay.
 * [center_world_x, bow_half_len, stern_half_len, half_width, type]
 * bow and stern are measured eastward/westward from center_x.
 * Ship north side always abuts DOCK_WATERLINE_Y.
 */
export const MOORED_SHIPS: { cx: number; bowLen: number; sternLen: number; hw: number; type: "bulk" | "tanker" | "cruise" }[] = [
  { cx: 8700,  bowLen: 90,  sternLen: 45,  hw: 20, type: "bulk"   },
  { cx: 9950,  bowLen: 80,  sternLen: 38,  hw: 16, type: "tanker" },
  { cx: 11050, bowLen: 110, sternLen: 52,  hw: 26, type: "cruise" },
];

/**
 * World-anchored reef/rock positions: [world_x, world_y, avoidance_radius].
 * Used by both the renderer (visual) and App (NPC avoidance steering).
 */
export const WATER_ROCKS: [number, number, number][] = [
  [1800, 1450, 22], [2200, 1700, 26], [2900, 1600, 20],
  [3500, 1900, 28], [4100, 1550, 23], [4800, 1800, 24],
  [5400, 1650, 21], [6200, 1750, 30], [7100, 1500, 25],
  [8400, 1850, 22], [9200, 1700, 27],
];

export type WeatherKey = "clear" | "fog";

export const WEATHER_CFG: Record<
  WeatherKey,
  {
    sky: [string, string];
    water: [string, string];
    fog: number;
    waves: number;
    rain: boolean;
    label: string;
  }
> = {
  clear: {
    sky: ["#0d5c96", "#6ad4f8"],   // deep royal blue → bright azure at horizon
    water: ["#5ac4e4", "#074e7c"], // horizon azure (matches sky) → deep navy
    fog: 0,
    waves: 0.4,
    rain: false,
    label: "☀ Clear",
  },
  fog: {
    sky: ["#7888a2", "#beccda"],
    water: ["#6a8c9e", "#223850"], // horizon grey-blue (matches sky) → dark slate
    fog: 0.7,
    waves: 0.5,
    rain: false,
    label: "🌫 Fog",
  },
};

