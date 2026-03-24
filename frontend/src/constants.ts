export const CW = 800;
/** Taller canvas = more vertical “water” to race in (see horizY in renderer). */
export const CH = 520;

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
export const RUDDER_RATE = 0.52;
/** Return-to-amidships when keys released (slightly slower = more damped feel). */
export const RUDDER_RTN = 0.26;
export const LOCAL_ACCEL = 0.03;
export const LOCAL_DRAG = 0.012;
export const K2PX = 0.55; // knots → pixels/frame for local rendering
/** Camera lerp toward tug each frame (higher = tighter follow when turning). */
export const CAMERA_FOLLOW_LERP = 0.11;

/** Passive score gain while moving (accumulator per frame-dt ≈1 @ 60fps → ~0.7 pts/s). */
export const SCORE_PASSIVE_ACC_PER_FRAME = 0.011;

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
    sky: ["#5a8faa", "#b8d8f0"],
    water: ["#1a5a7a", "#0d3a55"],
    fog: 0,
    waves: 0.4,
    rain: false,
    label: "☀ Clear",
  },
  fog: {
    sky: ["#8a9aaa", "#aabbc8"],
    water: ["#4a6070", "#2a4050"],
    fog: 0.7,
    waves: 0.5,
    rain: false,
    label: "🌫 Fog",
  },
};

