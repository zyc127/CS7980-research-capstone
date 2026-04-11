/**
 * First-person bridge view — full canvas, wheelhouse overlay + mini-map.
 */
import { CW, CH, WEATHER_CFG, DOCK_A_CENTER_X, DOCK_B_CENTER_X, PORT_BASIN_START_X, type WeatherKey } from "./constants";
import type { CherryFlower, LocalState, LocalVessel } from "./types";

/** 场景专属 HUD 数据，传入 renderFPV 以在第一人称驾驶台覆盖显示。 */
export type FpvHud = {
  scenario?: string;
  /** 泊位目标世界 X（docking 模式）*/
  targetDockX?: number;
  /** 当前能见度（公里，fog 模式，来自后端）*/
  visibility?: number;
  /** VHF 引导已请求（fog 模式）*/
  guidanceRequested?: boolean;
  /** 引擎已故障（emergency 模式）*/
  engineFailed?: boolean;
};

// ── Layout ────────────────────────────────────────────────────────────
const PILLAR_W  = 32;          // side pillar width
const DASH_TOP  = 330;         // top of dashboard (bottom of scene window)
const HORIZ_Y   = 210;         // horizon line in screen Y
const SCENE_CX  = CW / 2;     // 400
const HALF_FOV  = 45;          // ±degrees
// Camera eye height above the waterline (world units). Used for perspective-
// correct placement of sea-level objects: closer objects appear lower on screen.
const EYE_HEIGHT = 6;

// Focal length derived from FOV (for perspective projection)
const FOCAL = SCENE_CX / Math.tan((HALF_FOV * Math.PI) / 180); // ≈400

// Mini-map
const MM_X = PILLAR_W + 6;
const MM_Y = 6;
const MM_W = 152;
const MM_H = 108;
const MM_SCALE = 0.018; // world units → mini-map pixels

// ── Helpers ───────────────────────────────────────────────────────────

function relBearing(tugX: number, tugY: number, hdg: number, wx: number, wy: number): number {
  const dx = wx - tugX;
  const dy = wy - tugY;
  const a = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
  return ((a - hdg + 540) % 360) - 180;
}

function dist2D(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

/** True perspective projection: bearing (deg) → screen X */
function perspX(b: number): number {
  return SCENE_CX + Math.tan((b * Math.PI) / 180) * FOCAL;
}

/** Project a world point at a given altitude (world units above sea) to screen coords. */
function project(
  tugX: number, tugY: number, hdg: number,
  wx: number, wy: number, altitude: number,
): { sx: number; sy: number; dist: number } | null {
  const dx = wx - tugX;
  const dy = wy - tugY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 6) return null;
  const bearing = relBearing(tugX, tugY, hdg, wx, wy);
  if (Math.abs(bearing) > HALF_FOV + 14) return null;
  const sx = perspX(bearing);
  // Altitude in screen Y (positive altitude → above horizon)
  const sy = HORIZ_Y - (altitude / dist) * FOCAL;
  return { sx, sy, dist };
}

// ── Main export ───────────────────────────────────────────────────────

export function renderFPV(ctx: CanvasRenderingContext2D, ls: LocalState, weather: WeatherKey, shake = { x: 0, y: 0 }, hud?: FpvHud) {
  const w = WEATHER_CFG[weather] ?? WEATHER_CFG.clear;

  // Camera shake (applied to scene, not dashboard)
  ctx.save();
  ctx.translate(shake.x * 0.6, shake.y * 0.6);
  // 1. Sky
  drawSky(ctx, ls, w);
  // 2. Water
  drawWater(ctx, ls, w);
  // 3. Horizon scenery
  drawHorizonScenery(ctx, ls);
  // 4. Clip scene area, draw projected objects
  ctx.save();
  ctx.beginPath();
  ctx.rect(PILLAR_W, 0, CW - PILLAR_W * 2, DASH_TOP);
  ctx.clip();
  drawVessels(ctx, ls);
  drawCherryBlossoms(ctx, ls);
  ctx.restore();
  // 5. Fog
  if (w.fog > 0) drawFog(ctx, w);

  ctx.restore(); // end shake translate

  // 5.5 场景专属 HUD 横幅（优先级：emergency > fog > docking）
  if (hud?.engineFailed) {
    drawEmergencyBanner(ctx, ls);
  } else if (hud?.scenario === "fog") {
    drawFogSceneBanner(ctx, ls, hud);
  } else if (hud?.scenario === "docking" && hud.targetDockX) {
    drawDockingTargetBanner(ctx, ls, hud.targetDockX);
  }

  // 6. Wheelhouse overlay (draws on top of everything)
  drawWheelhouse(ctx, ls, hud);
  // 7. Mini-map (top-left, inside pillar + margin)
  drawMiniMap(ctx, ls);

  // 8. Screen flash on collision
  if (ls.screenFlash > 0) {
    ctx.fillStyle = `rgba(255,60,30,${ls.screenFlash * 0.42})`;
    ctx.fillRect(0, 0, CW, CH);
    const vg = ctx.createRadialGradient(CW / 2, CH / 2, 40, CW / 2, CH / 2, CW * 0.8);
    vg.addColorStop(0, "rgba(255,0,0,0)");
    vg.addColorStop(1, `rgba(180,0,0,${ls.screenFlash * 0.55})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, CW, CH);
    if (ls.screenFlash > 0.5) {
      ctx.fillStyle = `rgba(255,220,200,${(ls.screenFlash - 0.5) * 2})`;
      ctx.font = "bold 22px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("COLLISION", CW / 2, CH / 2 - 10);
    }
  }
}

// ── Sky ───────────────────────────────────────────────────────────────

function drawSky(ctx: CanvasRenderingContext2D, ls: LocalState, w: { sky: [string, string]; fog: number }) {
  const ww = w;
  const sky = ctx.createLinearGradient(0, 0, 0, HORIZ_Y);
  sky.addColorStop(0, ww.sky[0]);
  sky.addColorStop(1, ww.sky[1]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, CW, HORIZ_Y);

  // Sun
  const sunAngle = (ls.tug.heading * Math.PI) / 180 - 0.6; // sun slightly off-axis
  const sunBearing = relBearing(ls.tug.x, ls.tug.y, ls.tug.heading,
    ls.tug.x + Math.sin(sunAngle) * 2000,
    ls.tug.y - Math.cos(sunAngle) * 2000,
  );
  if (Math.abs(sunBearing) < HALF_FOV + 20) {
    const sunX = perspX(sunBearing);
    const sunY = 52;
    const sunR = ctx.createRadialGradient(sunX, sunY, 2, sunX, sunY, 42);
    sunR.addColorStop(0, "rgba(255,250,220,0.95)");
    sunR.addColorStop(0.22, "rgba(255,230,120,0.55)");
    sunR.addColorStop(0.6, "rgba(255,200,80,0.12)");
    sunR.addColorStop(1, "rgba(255,180,50,0)");
    ctx.fillStyle = sunR;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,252,230,0.95)";
    ctx.beginPath();
    ctx.arc(sunX, sunY, 9, 0, Math.PI * 2);
    ctx.fill();
  }

  // Clouds
  const clouds = [
    { b: -35, alt: 85, w: 120, h: 30 },
    { b:  -8, alt: 105, w: 160, h: 40 },
    { b:  22, alt: 75, w: 100, h: 26 },
    { b:  38, alt: 95, w: 130, h: 32 },
    { b: -20, alt: 130, w: 90, h: 22 },
  ];
  clouds.forEach(({ b, alt, w: cw, h: ch }) => {
    if (Math.abs(b) > HALF_FOV + 20) return;
    const cx2 = perspX(b);
    const cy2 = HORIZ_Y - (alt / 2000) * FOCAL * 8;
    const cg = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, cw * 0.7);
    cg.addColorStop(0, "rgba(255,255,255,0.55)");
    cg.addColorStop(0.5, "rgba(240,245,255,0.3)");
    cg.addColorStop(1, "rgba(220,235,255,0)");
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.ellipse(cx2, cy2, cw * 0.7, ch * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  // Seagulls — animated birds drifting across the sky
  const gulls = [
    { b: -38, sy:  98, spd: 0.14, phase: 0.0, sz: 5.5 },
    { b:  16, sy:  64, spd: 0.10, phase: 1.3, sz: 7.0 },
    { b:  -9, sy: 138, spd: 0.18, phase: 2.2, sz: 4.0 },
    { b:  44, sy:  82, spd: 0.12, phase: 0.8, sz: 6.0 },
    { b: -22, sy: 162, spd: 0.20, phase: 1.9, sz: 3.5 },
    { b:   5, sy: 115, spd: 0.15, phase: 3.1, sz: 4.8 },
    { b:  30, sy: 145, spd: 0.11, phase: 0.5, sz: 3.8 },
  ];
  ctx.save();
  gulls.forEach(({ b, sy, spd, phase, sz }) => {
    // Slowly drift bearing over time
    const movB = ((b + ls.time * spd * 12 + 360) % 360);
    const nb = movB > 180 ? movB - 360 : movB;
    if (Math.abs(nb) > HALF_FOV + 8) return;
    if (sy < 8 || sy > HORIZ_Y - 10) return;
    const gx = perspX(nb);
    // Wing-flap — sinusoidal dihedral
    const flap = Math.sin(ls.time * 4.2 + phase) * 0.45;
    const ws = sz * 2.4;  // half wingspan
    ctx.strokeStyle = "rgba(225,230,235,0.78)";
    ctx.lineWidth = Math.max(0.7, sz * 0.28);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(gx - ws, sy - flap * sz * 0.8);
    ctx.quadraticCurveTo(gx - ws * 0.45, sy - sz * (0.55 + flap * 0.45), gx, sy);
    ctx.quadraticCurveTo(gx + ws * 0.45, sy - sz * (0.55 + flap * 0.45), gx + ws, sy - flap * sz * 0.8);
    ctx.stroke();
  });
  ctx.restore();
}

// ── Water ─────────────────────────────────────────────────────────────

function drawWater(ctx: CanvasRenderingContext2D, ls: LocalState, w: { water: [string, string]; waves: number }) {
  const WL = PILLAR_W;
  const WR = CW - PILLAR_W;

  // ── Dynamic left shore: project north shore (Y=SHORE_Y) into screen space ─
  // For each bearing b, the ray from the tug hits Y=SHORE_Y at distance
  //   t = (tug.y - SHORE_Y) / cos((hdg+b)°)
  // giving screen Y = HORIZ_Y + (EYE_HEIGHT/t)*FOCAL.
  // The shore "vanishing point" is where the E-W shore line converges on screen:
  //   bearing to east direction of shore = (90 - hdg), giving screen X = perspX(90-hdg).

  const shoreVisible = ls.tug.y > SHORE_Y + 5;

  // Sample shore line from left FOV edge to its VP
  type Pt = [number, number];
  const shoreLinePts: Pt[] = [];
  let shoreVPX = SCENE_CX;   // where the north shore converges on screen

  if (shoreVisible) {
    // Vanishing point of E-W shore (bearing to east direction)
    const vpBearing = ((90 - ls.tug.heading) + 540) % 360 - 180;  // −180…+180
    const vpBearingClamped = Math.max(-HALF_FOV + 1, Math.min(HALF_FOV - 1, vpBearing));
    shoreVPX = perspX(vpBearingClamped);

    // Sample bearings from left edge to VP bearing
    const bMax = Math.min(HALF_FOV, vpBearing);
    for (let b = -HALF_FOV; b <= bMax; b += 2) {
      const compassRad = ((ls.tug.heading + b) * Math.PI) / 180;
      const cosC = Math.cos(compassRad);
      if (cosC < 0.015) continue;
      const t = (ls.tug.y - SHORE_Y) / cosC;
      if (t < 5) continue;
      const sy = Math.min(HORIZ_Y + (EYE_HEIGHT / t) * FOCAL, DASH_TOP - 3);
      shoreLinePts.push([perspX(b), sy]);
    }
  }

  // VPL: where the left shore meets the horizon (= shoreVPX when visible)
  const VPL = shoreVisible && shoreLinePts.length > 0 ? shoreVPX : WL;
  const VPR = WR;   // right horizon extends to right scene edge (open water)

  // ── Water channel (trapezoid) ──────────────────────────────────────────
  // Use full width (WL) so the left region also shows water, not a dark void.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(WL, HORIZ_Y);
  ctx.lineTo(VPR, HORIZ_Y);
  ctx.lineTo(WR,  DASH_TOP);
  ctx.lineTo(WL,  DASH_TOP);
  ctx.closePath();
  ctx.clip();

  const wg = ctx.createLinearGradient(0, HORIZ_Y, 0, DASH_TOP);
  wg.addColorStop(0,   w.water[0]);
  wg.addColorStop(0.5, w.water[1]);
  wg.addColorStop(1,   "#0a2030");
  ctx.fillStyle = wg;
  ctx.fillRect(WL, HORIZ_Y, WR - WL, DASH_TOP - HORIZ_Y);

  const spec = ctx.createLinearGradient(0, HORIZ_Y, 0, HORIZ_Y + 28);
  spec.addColorStop(0, "rgba(200,230,255,0.22)");
  spec.addColorStop(1, "rgba(200,230,255,0)");
  ctx.fillStyle = spec;
  ctx.fillRect(WL, HORIZ_Y, WR - WL, 28);

  // Perspective fan lines
  for (let i = -14; i <= 14; i++) {
    if (Math.abs(i) < 1) continue;
    const bx = SCENE_CX + i * 52;
    const alpha = Math.max(0, 0.07 - Math.abs(i) * 0.003) * w.waves;
    ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(SCENE_CX, HORIZ_Y);
    ctx.lineTo(bx, DASH_TOP);
    ctx.stroke();
  }

  // Wave bands
  for (let i = 1; i <= 10; i++) {
    const t = i / 10;
    const wy = HORIZ_Y + (DASH_TOP - HORIZ_Y) * (t * t);
    const leftX  = VPL + t * (WL - VPL);
    const rightX = VPR + t * (WR - VPR);
    const amp = t * 3.2 * w.waves;
    ctx.strokeStyle = `rgba(255,255,255,${0.04 + t * 0.06})`;
    ctx.lineWidth = 0.6 + t * 0.7;
    ctx.beginPath();
    for (let x = leftX; x <= rightX; x += 28) {
      const y = wy + Math.sin(ls.time * 2.0 + x * 0.035 + i) * amp;
      x === leftX ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Foam / wake
  for (let i = 0; i < 6; i++) {
    const wy = DASH_TOP - 20 - i * 15;
    const wx = (ls.time * 55 * (0.5 + i * 0.2) + i * 300) % (CW + 200) - 100;
    ctx.strokeStyle = `rgba(255,255,255,${0.06 * w.waves})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(wx, wy);
    ctx.bezierCurveTo(wx + 20, wy - 3, wx + 50, wy + 3, wx + 80, wy);
    ctx.stroke();
  }
  ctx.restore();

  // ── Left shore edge line (world-projected, moves with heading) ──────────
  // Only draw the thin projected shore line and riprap — no large polygon fill
  // that would incorrectly cover the water area below the shore line.
  if (shoreVisible && shoreLinePts.length > 0) {
    ctx.save();

    // Seawall edge line along the projected shore
    ctx.strokeStyle = "rgba(180,185,170,0.75)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(VPL, HORIZ_Y);
    for (let i = shoreLinePts.length - 1; i >= 0; i--) {
      ctx.lineTo(shoreLinePts[i][0], shoreLinePts[i][1]);
    }
    ctx.stroke();

    // Thin shore-line highlight strip just below the line
    const shoreGrad = ctx.createLinearGradient(0, HORIZ_Y, 0, HORIZ_Y + 10);
    shoreGrad.addColorStop(0,   "rgba(160,175,145,0.30)");
    shoreGrad.addColorStop(0.5, "rgba(120,140,105,0.12)");
    shoreGrad.addColorStop(1,   "rgba(80,100,65,0)");
    ctx.fillStyle = shoreGrad;
    ctx.beginPath();
    ctx.moveTo(VPL, HORIZ_Y);
    for (let i = shoreLinePts.length - 1; i >= 0; i--) {
      ctx.lineTo(shoreLinePts[i][0], shoreLinePts[i][1]);
    }
    // Close the thin strip (just a few px below)
    for (let i = 0; i < shoreLinePts.length; i++) {
      ctx.lineTo(shoreLinePts[i][0], Math.min(shoreLinePts[i][1] + 6, DASH_TOP));
    }
    ctx.lineTo(VPL, Math.min(HORIZ_Y + 6, DASH_TOP));
    ctx.closePath();
    ctx.fill();

    // Riprap rocks along the seawall line
    for (let i = 0; i < shoreLinePts.length - 1; i++) {
      const [sx, sy] = shoreLinePts[i];
      if (sy < HORIZ_Y + 1 || sy > DASH_TOP - 2) continue;
      const rockAlpha = 0.28 + Math.abs(Math.sin(sx * 0.4 + ls.tug.x * 0.003)) * 0.20;
      ctx.fillStyle = `rgba(100,110,90,${rockAlpha})`;
      ctx.fillRect(sx - 3, sy - 1, 8, 2);
    }
    ctx.restore();
  }
}

// ── Horizon scenery (all elements use real world coordinates = synced with top-down) ──

const SHORE_Y = 350; // north-shore world Y (same scenery band as top-down bg)

// North-shore buildings: world X matches top-down renderer + extended along route
// col: body color  winCol: window tint
const WORLD_BUILDINGS: { wx: number; h: number; bw: number; col: string; winCol?: string }[] = [
  { wx: 830,   h: 100, bw: 22, col: "#1c3a58", winCol: "rgba(120,205,255,0.30)" }, // glass blue
  { wx: 860,   h: 74,  bw: 18, col: "#342c3e", winCol: "rgba(255,205,85,0.22)"  }, // dark stone, warm
  { wx: 885,   h: 118, bw: 28, col: "#1a4270", winCol: "rgba(100,195,255,0.32)" }, // tall glass tower
  { wx: 922,   h: 85,  bw: 18, col: "#2e3848", winCol: "rgba(255,215,90,0.20)"  }, // steel grey
  { wx: 948,   h: 99,  bw: 22, col: "#1c3e66", winCol: "rgba(115,210,255,0.28)" }, // glass
  { wx: 1510,  h: 82,  bw: 20, col: "#283848", winCol: "rgba(255,210,80,0.22)"  },
  { wx: 1538,  h: 115, bw: 29, col: "#1a3e68", winCol: "rgba(130,215,255,0.30)" },
  { wx: 1578,  h: 66,  bw: 16, col: "#342e3e", winCol: "rgba(255,200,75,0.18)"  },
  { wx: 2180,  h: 72,  bw: 20, col: "#1e3a58", winCol: "rgba(110,200,255,0.26)" },
  { wx: 2230,  h: 96,  bw: 26, col: "#263442", winCol: "rgba(255,215,88,0.22)"  },
  { wx: 2290,  h: 58,  bw: 18, col: "#1c4068", winCol: "rgba(125,212,255,0.28)" },
  { wx: 3080,  h: 90,  bw: 24, col: "#1e3858", winCol: "rgba(255,218,90,0.22)"  },
  { wx: 3160,  h: 112, bw: 30, col: "#1a4272", winCol: "rgba(105,198,255,0.30)" },
  { wx: 3240,  h: 68,  bw: 20, col: "#30283c", winCol: "rgba(255,205,82,0.20)"  },
  { wx: 4400,  h: 76,  bw: 22, col: "#243440", winCol: "rgba(255,212,85,0.22)"  },
  { wx: 4480,  h: 104, bw: 28, col: "#1c3c60", winCol: "rgba(120,208,255,0.28)" },
  { wx: 5480,  h: 88,  bw: 24, col: "#1e3a58", winCol: "rgba(115,205,255,0.26)" },
  { wx: 5560,  h: 62,  bw: 18, col: "#343040", winCol: "rgba(255,200,78,0.18)"  },
  { wx: 6180,  h: 98,  bw: 26, col: "#243642", winCol: "rgba(255,215,88,0.22)"  },
  { wx: 6260,  h: 70,  bw: 20, col: "#1c4270", winCol: "rgba(110,200,255,0.28)" },
  { wx: 7000,  h: 80,  bw: 22, col: "#1e3858", winCol: "rgba(255,210,80,0.20)"  },
  { wx: 7100,  h: 108, bw: 30, col: "#1a4070", winCol: "rgba(118,208,255,0.30)" },
  { wx: 8000,  h: 94,  bw: 26, col: "#1e3a58", winCol: "rgba(255,215,85,0.22)"  },
  { wx: 8100,  h: 118, bw: 32, col: "#243442", winCol: "rgba(128,218,255,0.32)" },
  { wx: 9200,  h: 86,  bw: 24, col: "#1c4068", winCol: "rgba(255,210,80,0.22)"  },
  { wx: 9320,  h: 130, bw: 34, col: "#1a3c60", winCol: "rgba(115,205,255,0.30)" },
  { wx: 10480, h: 110, bw: 28, col: "#283848", winCol: "rgba(255,218,88,0.24)"  },
  { wx: 10600, h: 142, bw: 36, col: "#1c3c62", winCol: "rgba(120,210,255,0.32)" },
];

function drawHorizonScenery(ctx: CanvasRenderingContext2D, ls: LocalState) {
  // Mountains — North Shore Vancouver (bearing relative to north, parallax backdrop)
  const bearingToNorth = ((540 - ls.tug.heading) % 360) - 180;

  // ── LAYER 1: Distant hazy mountains (atmospheric perspective) ──────────────
  [
    { off: -50, mw: 220, mh: 45, col: "#6a6488" },
    { off: -28, mw: 200, mh: 38, col: "#787090" },
    { off:  -4, mw: 230, mh: 52, col: "#6a6488" },
    { off:  20, mw: 195, mh: 40, col: "#787090" },
    { off:  44, mw: 212, mh: 47, col: "#6a6488" },
  ].forEach(({ off, mw, mh, col }) => {
    const b = bearingToNorth + off;
    if (Math.abs(b) > HALF_FOV + 25) return;
    const sx = perspX(b);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(sx - mw / 2, HORIZ_Y + 1);
    ctx.lineTo(sx - mw * 0.15, HORIZ_Y - mh * 0.6);
    ctx.lineTo(sx + mw * 0.02, HORIZ_Y - mh);
    ctx.lineTo(sx + mw * 0.18, HORIZ_Y - mh * 0.65);
    ctx.lineTo(sx + mw / 2, HORIZ_Y + 1);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
    // Snow — clipped to mountain shape, so always inside
    ctx.clip();
    const sg = ctx.createLinearGradient(sx, HORIZ_Y - mh, sx, HORIZ_Y - mh * 0.62);
    sg.addColorStop(0, "rgba(230,242,252,0.52)");
    sg.addColorStop(1, "rgba(230,242,252,0)");
    ctx.fillStyle = sg;
    ctx.fillRect(sx - mw / 2 - 4, HORIZ_Y - mh - 2, mw + 8, mh * 0.55);
    ctx.restore();
  });

  // ── LAYER 2: North Shore peaks — The Lions (blue-purple), Grouse (forest teal) ──
  [
    { b: bearingToNorth - 26, mw: 80,  mh: 84, col: "#3a3c5e", snow: 0.38 },  // West Lion — blue-purple
    { b: bearingToNorth - 17, mw: 76,  mh: 90, col: "#322e52", snow: 0.40 },  // East Lion — deepest purple
    { b: bearingToNorth -  4, mw: 198, mh: 78, col: "#28485a", snow: 0.32 },  // Grouse — forest teal
    { b: bearingToNorth + 15, mw: 185, mh: 70, col: "#304a5c", snow: 0.30 },  // Mount Seymour — slate
    { b: bearingToNorth + 37, mw: 192, mh: 74, col: "#264855", snow: 0.34 },  // Cypress — deep teal
    { b: bearingToNorth - 48, mw: 175, mh: 52, col: "#464060", snow: 0.25 },  // fill west — purple
    { b: bearingToNorth + 56, mw: 168, mh: 48, col: "#3a4858", snow: 0.25 },  // fill east — slate
  ].forEach(({ b, mw, mh, col, snow }) => {
    if (Math.abs(b) > HALF_FOV + 25) return;
    const sx = perspX(b);
    const isLion = mw < 100; // The Lions are narrow
    ctx.save();
    ctx.beginPath();
    if (isLion) {
      // Steep, craggy lion profile
      ctx.moveTo(sx - mw / 2, HORIZ_Y + 1);
      ctx.lineTo(sx - mw * 0.28, HORIZ_Y - mh * 0.42);
      ctx.lineTo(sx - mw * 0.08, HORIZ_Y - mh * 0.78);
      ctx.lineTo(sx,             HORIZ_Y - mh);
      ctx.lineTo(sx + mw * 0.10, HORIZ_Y - mh * 0.72);
      ctx.lineTo(sx + mw * 0.30, HORIZ_Y - mh * 0.38);
      ctx.lineTo(sx + mw / 2, HORIZ_Y + 1);
    } else {
      // Broader mountain with secondary ridge
      ctx.moveTo(sx - mw / 2, HORIZ_Y + 1);
      ctx.lineTo(sx - mw * 0.30, HORIZ_Y - mh * 0.44);
      ctx.lineTo(sx - mw * 0.16, HORIZ_Y - mh * 0.70);
      ctx.lineTo(sx - mw * 0.04, HORIZ_Y - mh * 0.88);
      ctx.lineTo(sx,             HORIZ_Y - mh);
      ctx.lineTo(sx + mw * 0.08, HORIZ_Y - mh * 0.82);
      ctx.lineTo(sx + mw * 0.22, HORIZ_Y - mh * 0.62);
      ctx.lineTo(sx + mw * 0.36, HORIZ_Y - mh * 0.42);
      ctx.lineTo(sx + mw / 2, HORIZ_Y + 1);
    }
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
    // Clip snow and lighting to mountain body
    ctx.clip();
    // Snow gradient from peak downward (always aligned because clipped)
    const snowGrad = ctx.createLinearGradient(sx, HORIZ_Y - mh, sx, HORIZ_Y - mh + mh * snow * 1.8);
    snowGrad.addColorStop(0,   "rgba(248,254,255,0.90)");
    snowGrad.addColorStop(0.45,"rgba(238,250,255,0.50)");
    snowGrad.addColorStop(1,   "rgba(238,250,255,0)");
    ctx.fillStyle = snowGrad;
    ctx.fillRect(sx - mw / 2 - 4, HORIZ_Y - mh - 2, mw + 8, mh * snow * 2.0);
    // Directional light: left face brighter, right face in shadow
    const lightGrad = ctx.createLinearGradient(sx - mw / 2, 0, sx + mw / 2, 0);
    lightGrad.addColorStop(0,   "rgba(255,255,255,0.07)");
    lightGrad.addColorStop(0.38,"rgba(255,255,255,0.00)");
    lightGrad.addColorStop(1,   "rgba(0,0,0,0.16)");
    ctx.fillStyle = lightGrad;
    ctx.fillRect(sx - mw / 2 - 4, HORIZ_Y - mh - 2, mw + 8, mh + 4);
    // Mid-mountain mist band (Vancouver's characteristic cloud collar)
    const mistGrad = ctx.createLinearGradient(sx, HORIZ_Y - mh * 0.52, sx, HORIZ_Y - mh * 0.38);
    mistGrad.addColorStop(0, "rgba(200,218,235,0)");
    mistGrad.addColorStop(0.5,"rgba(200,218,235,0.18)");
    mistGrad.addColorStop(1, "rgba(200,218,235,0)");
    ctx.fillStyle = mistGrad;
    ctx.fillRect(sx - mw / 2 - 4, HORIZ_Y - mh * 0.55, mw + 8, mh * 0.22);
    ctx.restore();
  });

  // ── LAYER 3: Coastal forest — North Shore rainforest silhouette ────────────
  // Two rows: back row (darker, smaller) + front row (slightly taller)
  ctx.save();
  for (let row = 0; row < 2; row++) {
    const rowOff = row * 2.2;      // front row slightly offset
    const rowH   = row === 0 ? 7 : 11;
    ctx.fillStyle = row === 0 ? "#1e2e1e" : "#253525";
    for (let ti = -20; ti <= 20; ti++) {
      const tb = bearingToNorth + ti * 4.6 + rowOff;
      if (Math.abs(tb) > HALF_FOV + 2) continue;
      const tx = perspX(tb);
      const th = rowH + Math.abs(Math.sin(ti * 2.3 + row * 1.1)) * 6;
      ctx.beginPath();
      ctx.moveTo(tx - 7, HORIZ_Y + 1);
      ctx.lineTo(tx, HORIZ_Y - th);
      ctx.lineTo(tx + 7, HORIZ_Y + 1);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();

  // ── LAYER 3.5: Subtle horizon-waterline accent ────────────────────────
  // Thin bright cap at the very horizon — blends far shore into sky glow.
  {
    const capGrad = ctx.createLinearGradient(0, HORIZ_Y - 2, 0, HORIZ_Y + 1);
    capGrad.addColorStop(0, "rgba(180,210,230,0.28)");
    capGrad.addColorStop(1, "rgba(140,175,200,0)");
    ctx.fillStyle = capGrad;
    ctx.fillRect(PILLAR_W, HORIZ_Y - 2, CW - PILLAR_W * 2, 4);
  }

  // ── LAYER 4: Shore buildings — perspective-correct base Y ─────────────────
  WORLD_BUILDINGS.forEach(({ wx, h, bw, col, winCol }) => {
    const wdist = dist2D(ls.tug.x, ls.tug.y, wx, SHORE_Y);
    if (wdist > 3500 || wdist < 50) return;
    const bearing = relBearing(ls.tug.x, ls.tug.y, ls.tug.heading, wx, SHORE_Y);
    if (Math.abs(bearing) > HALF_FOV + 12) return;
    const edgeFade = Math.min(1, (HALF_FOV + 12 - Math.abs(bearing)) / 12);
    const distFade = Math.max(0.1, 1 - wdist / 3500);
    const scale    = Math.max(0.12, Math.min(2.8, 500 / wdist));
    const screenH  = h * scale;
    const screenW  = Math.max(3, bw * scale);
    const bsx = perspX(bearing);
    // North shore buildings sit AT the horizon — clamp base to max 8px below HORIZ_Y
    const baseY = Math.min(HORIZ_Y + Math.min(8, (EYE_HEIGHT / wdist) * FOCAL), DASH_TOP - 16);

    ctx.save();
    ctx.globalAlpha = distFade * edgeFade * 0.92;

    // 3-D extrusion depth (northwest — matches sun bearing)
    const dx = Math.max(1.5, screenW * 0.10);  // leftward
    const dy = Math.max(1.0, screenH * 0.030); // upward

    // Right side face (darker — east face in shadow)
    ctx.fillStyle = "rgba(0,0,0,0.30)";
    ctx.beginPath();
    ctx.moveTo(bsx + screenW / 2,      baseY - screenH);
    ctx.lineTo(bsx + screenW / 2 + dx, baseY - screenH - dy);
    ctx.lineTo(bsx + screenW / 2 + dx, baseY            - dy);
    ctx.lineTo(bsx + screenW / 2,      baseY);
    ctx.closePath();
    ctx.fill();

    // Building front face
    ctx.fillStyle = col;
    ctx.fillRect(bsx - screenW / 2, baseY - screenH, screenW, screenH);

    // Roof face (parallelogram — lighter, lit from northwest)
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    ctx.beginPath();
    ctx.moveTo(bsx - screenW / 2,      baseY - screenH);
    ctx.lineTo(bsx + screenW / 2,      baseY - screenH);
    ctx.lineTo(bsx + screenW / 2 + dx, baseY - screenH - dy);
    ctx.lineTo(bsx - screenW / 2 + dx, baseY - screenH - dy);
    ctx.closePath();
    ctx.fill();

    // Left-face glass highlight
    ctx.fillStyle = "rgba(160,225,255,0.07)";
    ctx.fillRect(bsx - screenW / 2, baseY - screenH, screenW * 0.18, screenH);
    // Front-face right-side shadow gradient
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.fillRect(bsx + screenW * 0.32, baseY - screenH, screenW * 0.22, screenH);
    // Window grid
    if (scale > 0.4) {
      ctx.fillStyle = winCol ?? "rgba(255,215,90,0.22)";
      const rs = Math.max(1, 7 * scale), cs = Math.max(1, 4 * scale);
      for (let ry = baseY - screenH + rs; ry < baseY - 4; ry += rs) {
        for (let rx = bsx - screenW / 2 + 2; rx < bsx + screenW / 2 - 2; rx += cs + 1) {
          if (Math.sin(rx * 2.1 + ry * 1.7) > 0.15) ctx.fillRect(rx, ry, cs, rs * 0.6);
        }
      }
    }
    // Ground shadow at base
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(bsx - screenW / 2 - 2, baseY, screenW + 4 + dx, 3);
    ctx.restore();
  });

  // === Canada Place — iconic white sail fins on waterfront ===
  {
    const cpWX = 1055, cpWY = SHORE_Y - 60; // set slightly south of shore for waterfront position
    const wdist = dist2D(ls.tug.x, ls.tug.y, cpWX, cpWY);
    if (wdist >= 50 && wdist <= 2800) {
      const bearing = relBearing(ls.tug.x, ls.tug.y, ls.tug.heading, cpWX, cpWY);
      if (Math.abs(bearing) <= HALF_FOV + 12) {
        const edgeFade = Math.min(1, (HALF_FOV + 12 - Math.abs(bearing)) / 12);
        const distFade = Math.max(0.15, 1 - wdist / 2800);
        const scale = Math.max(0.14, Math.min(2.6, 420 / wdist));
        const bsx = perspX(bearing);
        const baseY = Math.min(HORIZ_Y + Math.min(8, (EYE_HEIGHT / wdist) * FOCAL), DASH_TOP - 16);
        ctx.save();
        ctx.globalAlpha = distFade * edgeFade * 0.95;
        const baseH = 72 * scale, baseW = 140 * scale;
        // Pier / lower base (concrete)
        ctx.fillStyle = "#1e2e44";
        ctx.fillRect(bsx - baseW * 0.6, baseY - baseH * 0.22, baseW * 1.2, baseH * 0.22);
        // Main building body (glass curtain wall — layered gradient)
        const bldGrad = ctx.createLinearGradient(bsx - baseW / 2, 0, bsx + baseW / 2, 0);
        bldGrad.addColorStop(0,   "#1e3452");
        bldGrad.addColorStop(0.4, "#264268");
        bldGrad.addColorStop(0.7, "#1e3452");
        bldGrad.addColorStop(1,   "#162840");
        ctx.fillStyle = bldGrad;
        ctx.fillRect(bsx - baseW / 2, baseY - baseH, baseW, baseH);
        // Glass horizontal bands
        if (scale > 0.3) {
          for (let fl = 1; fl <= 6; fl++) {
            ctx.fillStyle = `rgba(140,210,255,${0.06 + fl * 0.01})`;
            ctx.fillRect(bsx - baseW / 2, baseY - baseH * (fl / 7), baseW, 2 * scale);
          }
        }
        // === 7 iconic white sail fins ===
        const sailHeights = [28, 35, 42, 46, 40, 34, 26];
        for (let si = 0; si < 7; si++) {
          const sailX = bsx - baseW * 0.48 + si * (baseW * 0.16);
          const sailH = sailHeights[si] * scale;
          const sailW = 10 * scale;
          // Sail shadow (right face)
          ctx.fillStyle = "rgba(180,210,240,0.55)";
          ctx.beginPath();
          ctx.moveTo(sailX + sailW * 0.1, baseY - baseH);
          ctx.lineTo(sailX + sailW * 0.6, baseY - baseH - sailH * 0.9);
          ctx.lineTo(sailX + sailW, baseY - baseH);
          ctx.closePath();
          ctx.fill();
          // Main sail face (bright white)
          ctx.fillStyle = "rgba(248,254,255,0.96)";
          ctx.beginPath();
          ctx.moveTo(sailX - sailW * 0.5, baseY - baseH);
          ctx.lineTo(sailX + sailW * 0.1, baseY - baseH - sailH);
          ctx.lineTo(sailX + sailW * 0.6, baseY - baseH - sailH * 0.9);
          ctx.lineTo(sailX + sailW * 0.1, baseY - baseH);
          ctx.closePath();
          ctx.fill();
          // Thin cable from fin tip to mast
          if (scale > 0.5) {
            ctx.strokeStyle = "rgba(200,220,240,0.4)";
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(sailX + sailW * 0.1, baseY - baseH - sailH);
            ctx.lineTo(bsx, baseY - baseH - 46 * scale);
            ctx.stroke();
          }
        }
        // Central mast
        ctx.fillStyle = "#c8d8e8";
        ctx.fillRect(bsx - 1.5 * scale, baseY - baseH - 46 * scale, 3 * scale, 46 * scale);
        // Flag at top
        if (scale > 0.55) {
          ctx.fillStyle = "rgba(220,30,30,0.9)";
          ctx.fillRect(bsx, baseY - baseH - 46 * scale, 8 * scale, 5 * scale);
        }
        // Base reflection / glow on water
        if (scale > 0.4) {
          const refGrad = ctx.createLinearGradient(0, baseY, 0, baseY + 14 * scale);
          refGrad.addColorStop(0, "rgba(160,220,255,0.18)");
          refGrad.addColorStop(1, "rgba(160,220,255,0)");
          ctx.fillStyle = refGrad;
          ctx.fillRect(bsx - baseW * 0.6, baseY, baseW * 1.2, 14 * scale);
        }
        // Label
        if (scale > 0.5) {
          ctx.fillStyle = "rgba(255,245,210,0.95)";
          ctx.font = `bold ${Math.max(8, Math.round(9 * scale))}px sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText("CANADA PLACE", bsx, baseY - baseH - 56 * scale);
        }
        ctx.restore();
      }
    }
  }

  // === Harbour Centre — slim tower with observation deck disc ===
  {
    const hcWX = 1240, hcWY = SHORE_Y + 100;
    const wdist = dist2D(ls.tug.x, ls.tug.y, hcWX, hcWY);
    if (wdist <= 3200 && wdist >= 50) {
      const bearing = relBearing(ls.tug.x, ls.tug.y, ls.tug.heading, hcWX, hcWY);
      if (Math.abs(bearing) <= HALF_FOV + 12) {
        const edgeFade = Math.min(1, (HALF_FOV + 12 - Math.abs(bearing)) / 12);
        const distFade = Math.max(0.12, 1 - wdist / 3200);
        const scale = Math.max(0.12, Math.min(3.0, 480 / wdist));
        const bsx = perspX(bearing);
        const baseY = Math.min(HORIZ_Y + Math.min(8, (EYE_HEIGHT / wdist) * FOCAL), DASH_TOP - 16);
        ctx.save();
        ctx.globalAlpha = distFade * edgeFade * 0.94;
        const towerH = 200 * scale;
        const shaftW = 8 * scale;
        // Tower base podium
        ctx.fillStyle = "#1e2e44";
        ctx.fillRect(bsx - 18 * scale, baseY - 20 * scale, 36 * scale, 20 * scale);
        // Tower shaft with floor markings
        const shaftGrad = ctx.createLinearGradient(bsx - shaftW / 2, 0, bsx + shaftW / 2, 0);
        shaftGrad.addColorStop(0, "#182438");
        shaftGrad.addColorStop(0.5, "#1e3050");
        shaftGrad.addColorStop(1, "#142030");
        ctx.fillStyle = shaftGrad;
        ctx.fillRect(bsx - shaftW / 2, baseY - towerH, shaftW, towerH);
        // Floor lines on shaft
        if (scale > 0.45) {
          for (let fl = 1; fl <= 8; fl++) {
            ctx.fillStyle = "rgba(140,180,220,0.18)";
            ctx.fillRect(bsx - shaftW / 2, baseY - towerH * (fl / 10), shaftW, 1);
          }
        }
        // === Observation disc — wide saucer shape ===
        const discW = 54 * scale, discH = 14 * scale;
        const discY = baseY - towerH;
        // Lower overhang (shadow side)
        ctx.fillStyle = "#1a2840";
        ctx.fillRect(bsx - discW * 0.62, discY, discW * 1.24, discH * 0.55);
        // Main disc top surface
        const discTopGrad = ctx.createLinearGradient(bsx - discW / 2, 0, bsx + discW / 2, 0);
        discTopGrad.addColorStop(0,   "#1e3456");
        discTopGrad.addColorStop(0.3, "#2a4270");
        discTopGrad.addColorStop(0.7, "#243060");
        discTopGrad.addColorStop(1,   "#1a2844");
        ctx.fillStyle = discTopGrad;
        ctx.fillRect(bsx - discW / 2, discY - discH, discW, discH);
        // Glass window strip (bright strip around disc mid)
        if (scale > 0.35) {
          ctx.fillStyle = "rgba(255,230,140,0.60)";
          for (let wi = 0; wi < 12; wi++) {
            const wx2 = bsx - discW / 2 + (wi + 0.3) * (discW / 12);
            ctx.fillRect(wx2, discY - discH * 0.7, discW / 14, discH * 0.4);
          }
        }
        // Disc underside glow
        const discGlow = ctx.createLinearGradient(0, discY, 0, discY + 10 * scale);
        discGlow.addColorStop(0, "rgba(255,220,100,0.22)");
        discGlow.addColorStop(1, "rgba(255,200,80,0)");
        ctx.fillStyle = discGlow;
        ctx.fillRect(bsx - discW * 0.6, discY, discW * 1.2, 10 * scale);
        // Antenna spire
        ctx.fillStyle = "#2e4466";
        ctx.fillRect(bsx - 1.5 * scale, discY - discH - 26 * scale, 3 * scale, 26 * scale);
        // Blinking beacon at tip
        const blink = Math.sin(ls.time * 3.5) > 0.4;
        if (scale > 0.4 && blink) {
          ctx.fillStyle = "rgba(255,80,60,0.9)";
          ctx.beginPath();
          ctx.arc(bsx, discY - discH - 26 * scale, 2 * scale, 0, Math.PI * 2);
          ctx.fill();
        }
        // Label
        if (scale > 0.45) {
          ctx.fillStyle = "rgba(255,242,205,0.92)";
          ctx.font = `bold ${Math.max(8, Math.round(9 * scale))}px sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText("HARBOUR CENTRE", bsx, discY - discH - 32 * scale);
        }
        ctx.restore();
      }
    }
  }

  // === BC Place Stadium — dome roof visible from water ===
  {
    const bcWX = 1680, bcWY = SHORE_Y + 200;
    const wdist = dist2D(ls.tug.x, ls.tug.y, bcWX, bcWY);
    if (wdist <= 3500 && wdist >= 50) {
      const bearing = relBearing(ls.tug.x, ls.tug.y, ls.tug.heading, bcWX, bcWY);
      if (Math.abs(bearing) <= HALF_FOV + 12) {
        const edgeFade = Math.min(1, (HALF_FOV + 12 - Math.abs(bearing)) / 12);
        const distFade = Math.max(0.1, 1 - wdist / 3500);
        const scale = Math.max(0.10, Math.min(2.2, 400 / wdist));
        const bsx = perspX(bearing);
        const baseY = Math.min(HORIZ_Y + Math.min(8, (EYE_HEIGHT / wdist) * FOCAL), DASH_TOP - 16);
        ctx.save();
        ctx.globalAlpha = distFade * edgeFade * 0.90;
        const stW = 120 * scale, stH = 38 * scale;
        // Lower base / stadium walls
        const wallGrad = ctx.createLinearGradient(bsx - stW / 2, 0, bsx + stW / 2, 0);
        wallGrad.addColorStop(0,   "#1e2c3e");
        wallGrad.addColorStop(0.5, "#253448");
        wallGrad.addColorStop(1,   "#1a2838");
        ctx.fillStyle = wallGrad;
        ctx.fillRect(bsx - stW / 2, baseY - stH, stW, stH);
        // Facade windows / arches
        if (scale > 0.28) {
          for (let ai = 0; ai < 8; ai++) {
            const ax = bsx - stW * 0.44 + ai * (stW * 0.125);
            ctx.fillStyle = "rgba(100,160,220,0.18)";
            ctx.fillRect(ax, baseY - stH * 0.78, stW * 0.08, stH * 0.5);
          }
        }
        // === Dome (retractable white roof) ===
        // Dome shadow (slightly behind/below)
        ctx.fillStyle = "rgba(160,180,210,0.35)";
        ctx.beginPath();
        ctx.ellipse(bsx + 2 * scale, baseY - stH + 3 * scale, stW * 0.52, stH * 0.62, 0, Math.PI, 0);
        ctx.fill();
        // Main dome surface
        const domeGrad = ctx.createRadialGradient(bsx - stW * 0.1, baseY - stH - stH * 0.4, 0,
                                                   bsx, baseY - stH, stW * 0.5);
        domeGrad.addColorStop(0,   "rgba(240,250,255,0.96)");
        domeGrad.addColorStop(0.55,"rgba(210,230,248,0.88)");
        domeGrad.addColorStop(1,   "rgba(160,190,220,0.70)");
        ctx.fillStyle = domeGrad;
        ctx.beginPath();
        ctx.ellipse(bsx, baseY - stH, stW / 2, stH * 0.65, 0, Math.PI, 0);
        ctx.fill();
        // Dome ribs (structural lines)
        if (scale > 0.25) {
          ctx.strokeStyle = "rgba(140,180,220,0.30)";
          ctx.lineWidth = Math.max(0.5, scale * 0.7);
          for (let ri = -3; ri <= 3; ri++) {
            const rx2 = bsx + ri * (stW * 0.14);
            const ry = baseY - stH - Math.sqrt(Math.max(0, (stW / 2) ** 2 - (rx2 - bsx) ** 2)) * 0.65;
            ctx.beginPath();
            ctx.moveTo(rx2, baseY - stH);
            ctx.lineTo(bsx, ry);
            ctx.stroke();
          }
        }
        // Dome interior glow (when close)
        if (scale > 0.6) {
          const innerGlow = ctx.createRadialGradient(bsx, baseY - stH - stH * 0.2, 0, bsx, baseY - stH, stW * 0.45);
          innerGlow.addColorStop(0, "rgba(200,230,255,0.14)");
          innerGlow.addColorStop(1, "rgba(200,230,255,0)");
          ctx.fillStyle = innerGlow;
          ctx.beginPath();
          ctx.ellipse(bsx, baseY - stH, stW * 0.45, stH * 0.6, 0, Math.PI, 0);
          ctx.fill();
        }
        // Mast & cables (4 masts around dome)
        if (scale > 0.35) {
          ctx.strokeStyle = "rgba(180,200,220,0.45)";
          ctx.lineWidth = Math.max(0.5, scale * 0.6);
          [-0.38, -0.13, 0.13, 0.38].forEach((frac) => {
            const mx = bsx + frac * stW;
            const mTopY = baseY - stH - 24 * scale;
            ctx.beginPath();
            ctx.moveTo(mx, baseY - stH);
            ctx.lineTo(mx, mTopY);
            ctx.stroke();
            // Cable to dome
            ctx.beginPath();
            ctx.moveTo(mx, mTopY);
            ctx.quadraticCurveTo(bsx, baseY - stH - stH * 0.5, bsx, baseY - stH - stH * 0.62);
            ctx.stroke();
          });
        }
        if (scale > 0.4) {
          ctx.fillStyle = "rgba(255,242,205,0.88)";
          ctx.font = `bold ${Math.max(7, Math.round(8 * scale))}px sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText("BC PLACE", bsx, baseY - stH - stH * 0.7 - 8 * scale);
        }
        ctx.restore();
      }
    }
  }

  // ── LAYER 5a: Cherry blossom trees — large, layered, with falling petals ─────
  [
    { wx: 720,  sz: 30 }, { wx: 782,  sz: 36 }, { wx: 846,  sz: 28 },
    { wx: 1102, sz: 34 }, { wx: 1164, sz: 40 }, { wx: 1312, sz: 30 },
    { wx: 1398, sz: 36 }, { wx: 1452, sz: 32 }, { wx: 1608, sz: 28 },
    { wx: 2820, sz: 30 }, { wx: 2878, sz: 38 }, { wx: 3520, sz: 34 },
  ].forEach(({ wx, sz }) => {
    const wdist = dist2D(ls.tug.x, ls.tug.y, wx, SHORE_Y);
    if (wdist > 3000 || wdist < 40) return;
    const bearing = relBearing(ls.tug.x, ls.tug.y, ls.tug.heading, wx, SHORE_Y);
    if (Math.abs(bearing) > HALF_FOV + 10) return;
    const edgeFade = Math.min(1, (HALF_FOV + 10 - Math.abs(bearing)) / 10);
    const distFade = Math.max(0.12, 1 - wdist / 3000);
    const scale    = Math.max(0.10, Math.min(3.0, 450 / wdist));
    const bsx  = perspX(bearing);
    const baseY = Math.min(HORIZ_Y + Math.min(8, (EYE_HEIGHT / wdist) * FOCAL), DASH_TOP - 16);
    const crownR = sz * scale;
    const trunkH = sz * scale * 1.8;
    ctx.save();
    ctx.globalAlpha = distFade * edgeFade * 0.94;

    // === Trunk — tapered, two-tone bark ===
    const trW = Math.max(3, 4 * scale);
    ctx.fillStyle = "#2e1e10";
    ctx.beginPath();
    ctx.moveTo(bsx - trW * 0.5, baseY);
    ctx.lineTo(bsx - trW * 0.3, baseY - trunkH);
    ctx.lineTo(bsx + trW * 0.3, baseY - trunkH);
    ctx.lineTo(bsx + trW * 0.5, baseY);
    ctx.closePath();
    ctx.fill();
    // Bark highlight
    ctx.fillStyle = "rgba(90,56,28,0.45)";
    ctx.fillRect(bsx - trW * 0.05, baseY - trunkH, trW * 0.35, trunkH);

    // === Crown — 5 layered puffs for full, lush look ===
    const cY = baseY - trunkH;  // crown centre Y

    // Layer 0: wide background puff (deepest pink, spread wide)
    const pg0 = ctx.createRadialGradient(bsx, cY + crownR * 0.1, 0, bsx, cY + crownR * 0.1, crownR * 1.35);
    pg0.addColorStop(0,   "rgba(240,138,162,0.55)");
    pg0.addColorStop(0.6, "rgba(225,118,148,0.28)");
    pg0.addColorStop(1,   "rgba(210,100,135,0)");
    ctx.fillStyle = pg0;
    ctx.beginPath(); ctx.arc(bsx, cY + crownR * 0.1, crownR * 1.35, 0, Math.PI * 2); ctx.fill();

    // Layer 1: left sub-crown (rosy)
    const pg1 = ctx.createRadialGradient(bsx - crownR * 0.42, cY + crownR * 0.05, 0,
                                          bsx - crownR * 0.42, cY + crownR * 0.05, crownR * 0.85);
    pg1.addColorStop(0,   "rgba(255,172,190,0.85)");
    pg1.addColorStop(0.6, "rgba(248,152,175,0.50)");
    pg1.addColorStop(1,   "rgba(245,140,168,0)");
    ctx.fillStyle = pg1;
    ctx.beginPath(); ctx.arc(bsx - crownR * 0.42, cY + crownR * 0.05, crownR * 0.85, 0, Math.PI * 2); ctx.fill();

    // Layer 2: right sub-crown (slightly lighter)
    const pg2 = ctx.createRadialGradient(bsx + crownR * 0.40, cY + crownR * 0.08, 0,
                                          bsx + crownR * 0.40, cY + crownR * 0.08, crownR * 0.80);
    pg2.addColorStop(0,   "rgba(255,178,196,0.80)");
    pg2.addColorStop(0.6, "rgba(248,158,180,0.45)");
    pg2.addColorStop(1,   "rgba(245,145,170,0)");
    ctx.fillStyle = pg2;
    ctx.beginPath(); ctx.arc(bsx + crownR * 0.40, cY + crownR * 0.08, crownR * 0.80, 0, Math.PI * 2); ctx.fill();

    // Layer 3: main crown centre (brightest pink)
    const pg3 = ctx.createRadialGradient(bsx, cY, crownR * 0.08, bsx, cY, crownR);
    pg3.addColorStop(0,   "rgba(255,198,210,0.98)");
    pg3.addColorStop(0.42,"rgba(252,175,193,0.82)");
    pg3.addColorStop(0.75,"rgba(248,155,178,0.55)");
    pg3.addColorStop(1,   "rgba(242,138,168,0)");
    ctx.fillStyle = pg3;
    ctx.beginPath(); ctx.arc(bsx, cY, crownR, 0, Math.PI * 2); ctx.fill();

    // Layer 4: top highlight puff (pale blossom, sunlit)
    const pg4 = ctx.createRadialGradient(bsx - crownR * 0.22, cY - crownR * 0.38, 0,
                                          bsx - crownR * 0.22, cY - crownR * 0.38, crownR * 0.60);
    pg4.addColorStop(0,   "rgba(255,225,232,0.85)");
    pg4.addColorStop(0.5, "rgba(255,215,228,0.42)");
    pg4.addColorStop(1,   "rgba(255,210,225,0)");
    ctx.fillStyle = pg4;
    ctx.beginPath(); ctx.arc(bsx - crownR * 0.22, cY - crownR * 0.38, crownR * 0.60, 0, Math.PI * 2); ctx.fill();

    // === Falling petal particles (only visible up close) ===
    if (scale > 0.55) {
      const petalSeed = wx * 7 + 13;
      for (let pi = 0; pi < 8; pi++) {
        const pPhase = (ls.time * 0.6 + (petalSeed + pi * 137) * 0.01) % 1;
        const pAngle = ((petalSeed + pi * 61) % 360) * Math.PI / 180;
        const pDrift = Math.sin(ls.time * 1.4 + pi) * crownR * 0.4;
        const px = bsx + Math.cos(pAngle) * crownR * (0.5 + pPhase * 0.9) + pDrift;
        const py = cY - crownR * 0.3 + pPhase * crownR * 1.8;
        const pSz = Math.max(1.5, (2 + Math.sin(petalSeed + pi) * 0.8) * scale);
        const pAlpha = (1 - pPhase) * 0.75;
        ctx.save();
        ctx.globalAlpha = distFade * edgeFade * pAlpha;
        ctx.fillStyle = "rgba(255,198,215,0.9)";
        ctx.beginPath();
        ctx.ellipse(px, py, pSz * 1.4, pSz * 0.7, pAngle + ls.time * 0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.globalAlpha = distFade * edgeFade * 0.94;
      }
    }

    ctx.restore();
  });

  // === Gastown Steam Clock — Victorian brass tower with steam puffs ===
  {
    const stWX = 680, stWY = SHORE_Y - 40;
    const wdist = dist2D(ls.tug.x, ls.tug.y, stWX, stWY);
    if (wdist <= 2200 && wdist >= 40) {
      const bearing = relBearing(ls.tug.x, ls.tug.y, ls.tug.heading, stWX, stWY);
      if (Math.abs(bearing) <= HALF_FOV + 10) {
        const edgeFade = Math.min(1, (HALF_FOV + 10 - Math.abs(bearing)) / 10);
        const distFade = Math.max(0.12, 1 - wdist / 2200);
        const scale = Math.max(0.12, Math.min(3.2, 380 / wdist));
        const bsx = perspX(bearing);
        const baseY = Math.min(HORIZ_Y + Math.min(8, (EYE_HEIGHT / wdist) * FOCAL), DASH_TOP - 16);
        ctx.save();
        ctx.globalAlpha = distFade * edgeFade * 0.9;
        const tH = 75 * scale, tW = 9 * scale;
        // Tower shaft (brass/copper)
        ctx.fillStyle = "#8B6914";
        ctx.fillRect(bsx - tW / 2, baseY - tH, tW, tH);
        // Dome cap
        ctx.fillStyle = "#A0791C";
        ctx.beginPath(); ctx.arc(bsx, baseY - tH, tW * 1.3, Math.PI, 0); ctx.fill();
        ctx.fillStyle = "#8B6914";
        ctx.fillRect(bsx - tW * 1.3, baseY - tH, tW * 2.6, 5 * scale);
        // Clock face
        ctx.fillStyle = "rgba(248,240,220,0.92)";
        ctx.beginPath(); ctx.arc(bsx, baseY - tH + tW * 1.5, tW * 0.75, 0, Math.PI * 2); ctx.fill();
        // Animated steam puffs
        if (scale > 0.55) {
          [0, 0.34, 0.67].forEach((phOff) => {
            const t = ((ls.time * 0.7 + phOff) % 1);
            const sr = (2.5 + t * 8) * scale;
            const sy = baseY - tH - t * 22 * scale;
            ctx.globalAlpha = distFade * edgeFade * (1 - t) * 0.5;
            ctx.fillStyle = "rgba(235,240,248,0.72)";
            ctx.beginPath();
            ctx.arc(bsx + (phOff - 0.33) * 7 * scale, sy, sr, 0, Math.PI * 2);
            ctx.fill();
          });
          ctx.globalAlpha = distFade * edgeFade * 0.9;
        }
        if (scale > 0.65) {
          ctx.fillStyle = "rgba(255,232,160,0.9)";
          ctx.font = `bold ${Math.max(6, Math.round(7 * scale))}px sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText("STEAM CLOCK", bsx, baseY - tH - tW * 2.5);
        }
        ctx.restore();
      }
    }
  }

  // === Science World (Telus World of Science) — iconic geodesic dome ===
  {
    const scWX = 2280, scWY = SHORE_Y + 120;
    const wdist = dist2D(ls.tug.x, ls.tug.y, scWX, scWY);
    if (wdist <= 3800 && wdist >= 50) {
      const bearing = relBearing(ls.tug.x, ls.tug.y, ls.tug.heading, scWX, scWY);
      if (Math.abs(bearing) <= HALF_FOV + 12) {
        const edgeFade = Math.min(1, (HALF_FOV + 12 - Math.abs(bearing)) / 12);
        const distFade = Math.max(0.1, 1 - wdist / 3800);
        const scale = Math.max(0.1, Math.min(2.4, 400 / wdist));
        const bsx = perspX(bearing);
        const scBaseY = Math.min(HORIZ_Y + Math.min(8, (EYE_HEIGHT / wdist) * FOCAL), DASH_TOP - 16);
        ctx.save();
        ctx.globalAlpha = distFade * edgeFade * 0.88;
        const domeR = 38 * scale, baseH = 12 * scale;
        // Base platform
        ctx.fillStyle = "#2a3848";
        ctx.fillRect(bsx - domeR * 0.85, scBaseY - baseH, domeR * 1.7, baseH);
        // Dome fill
        ctx.fillStyle = "#b8c4d2";
        ctx.beginPath(); ctx.arc(bsx, scBaseY - baseH, domeR, Math.PI, 0); ctx.fill();
        // Geodesic facets
        if (scale > 0.32) {
          ctx.strokeStyle = "rgba(55,75,95,0.42)";
          ctx.lineWidth = Math.max(0.5, 0.8 * scale);
          for (let gi = 1; gi <= 5; gi++) {
            const a = Math.PI + (gi / 6) * Math.PI;
            ctx.beginPath();
            ctx.moveTo(bsx, scBaseY - baseH);
            ctx.lineTo(bsx + Math.cos(a) * domeR, scBaseY - baseH + Math.sin(a) * domeR);
            ctx.stroke();
          }
          for (let ri = 1; ri <= 3; ri++) {
            const ry = scBaseY - baseH - (ri / 4) * domeR;
            const rr = Math.sqrt(Math.max(0, domeR * domeR - ((ri / 4) * domeR) ** 2));
            ctx.beginPath(); ctx.arc(bsx, scBaseY - baseH, rr, Math.PI, 0); ctx.stroke();
          }
        }
        // Lit dot on top
        ctx.fillStyle = "rgba(255,220,100,0.7)";
        ctx.beginPath(); ctx.arc(bsx, scBaseY - baseH - domeR, 2.5 * scale, 0, Math.PI * 2); ctx.fill();
        if (scale > 0.45) {
          ctx.fillStyle = "rgba(255,240,200,0.88)";
          ctx.font = `bold ${Math.max(6, Math.round(7 * scale))}px sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText("SCIENCE WORLD", bsx, scBaseY - baseH - domeR - 6 * scale);
        }
        ctx.restore();
      }
    }
  }

  // Docks — exact same world coords as top-down renderer (DOCK_WATERLINE_Y = 756)
  [DOCK_A_CENTER_X, DOCK_B_CENTER_X].forEach((dockWX) => {
    const dockDist = dist2D(ls.tug.x, ls.tug.y, dockWX, 756);
    if (dockDist > 2200) return;
    const b = relBearing(ls.tug.x, ls.tug.y, ls.tug.heading, dockWX, 756);
    if (Math.abs(b) > HALF_FOV + 12) return;
    const edgeFade = Math.min(1, (HALF_FOV + 12 - Math.abs(b)) / 12);
    const sc = Math.max(0.25, Math.min(3, 600 / dockDist));
    const sx = perspX(b);
    const dockBaseY = Math.min(HORIZ_Y + (EYE_HEIGHT / dockDist) * FOCAL, DASH_TOP - 16);
    ctx.save();
    ctx.globalAlpha = edgeFade * Math.min(0.9, 600 / dockDist);
    ctx.fillStyle = "#5d4d38";
    ctx.fillRect(sx - 60 * sc, dockBaseY - 8 * sc, 120 * sc, 9 * sc);
    ctx.fillStyle = "#4a3020";
    ctx.fillRect(sx + 22 * sc, dockBaseY - 52 * sc, 8 * sc, 46 * sc);
    ctx.fillRect(sx + 22 * sc, dockBaseY - 52 * sc, 36 * sc, 5 * sc);
    ctx.fillStyle = "rgba(255,220,50,0.7)";
    ctx.font = `bold ${Math.max(8, Math.round(9 * sc))}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(dockWX === DOCK_A_CENTER_X ? "DOCK A" : "DOCK B", sx, dockBaseY - 60 * sc);
    ctx.restore();
  });

  // Port basin — exact same world X as top-down renderer
  {
    const bPort = relBearing(ls.tug.x, ls.tug.y, ls.tug.heading, PORT_BASIN_START_X + 300, 756);
    const portDist = dist2D(ls.tug.x, ls.tug.y, PORT_BASIN_START_X + 300, 756);
    if (Math.abs(bPort) < HALF_FOV + 14 && portDist < 3000) {
      const psx = perspX(bPort);
      const sc2 = Math.max(0.3, Math.min(2, 800 / portDist));
      const portBaseY = Math.min(HORIZ_Y + (EYE_HEIGHT / portDist) * FOCAL, DASH_TOP - 16);
      ctx.save();
      ctx.globalAlpha = Math.min(0.85, 800 / portDist);
      ctx.fillStyle = "rgba(25,32,44,0.8)";
      ctx.fillRect(psx - 100 * sc2, portBaseY - 28 * sc2, 200 * sc2, 30 * sc2);
      ctx.fillStyle = "rgba(255,180,80,0.85)";
      ctx.font = `bold ${Math.max(9, Math.round(11 * sc2))}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("PORT", psx, portBaseY - 8 * sc2);
      ctx.restore();
    }
  }

  // Horizon haze
  const haze = ctx.createLinearGradient(0, HORIZ_Y - 18, 0, HORIZ_Y + 12);
  haze.addColorStop(0, "rgba(180,210,230,0)");
  haze.addColorStop(0.45, "rgba(180,210,230,0.13)");
  haze.addColorStop(1, "rgba(180,210,230,0)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, HORIZ_Y - 18, CW, 30);
}

// ── Vessels ───────────────────────────────────────────────────────────

function drawVessels(ctx: CanvasRenderingContext2D, ls: LocalState) {
  type VEntry = { v: LocalVessel; label: string; hull: string; cabin: string; baseH: number; baseW: number; isEscort?: boolean };
  const vessels: VEntry[] = [
    { v: ls.escort, label: "ESCORT", hull: "#28383a", cabin: "#3a4a48", baseH: 52, baseW: 22, isEscort: true },
    { v: ls.cargo,  label: "CARGO",  hull: "#3a5a78", cabin: "#4a6a88", baseH: 40, baseW: 17 },
    { v: ls.ferry,  label: "FERRY",  hull: "#5a7a9a", cabin: "#6a8aaa", baseH: 32, baseW: 14 },
    ...ls.fishers.map((f) => ({ v: f, label: "", hull: "#6a5030", cabin: "#8a7050", baseH: 13, baseW: 5 } as VEntry)),
    ...ls.traffic.map((t) => ({ v: t, label: "", hull: "#4a5868", cabin: "#5a6878", baseH: 22, baseW: 9 } as VEntry)),
  ];

  const projected = vessels
    .map((item) => {
      const p = project(ls.tug.x, ls.tug.y, ls.tug.heading, item.v.x, item.v.y, 0);
      if (!p) return null;
      return { ...item, ...p };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.dist - a.dist);

  for (const { v, label, hull, cabin, baseH, baseW, isEscort, sx, dist } of projected) {
    const sinkT = v.sinkT ?? 0;
    if (sinkT >= 1) continue;
    const bearing = relBearing(ls.tug.x, ls.tug.y, ls.tug.heading, v.x, v.y);
    const edgeFade = Math.min(1, (HALF_FOV + 14 - Math.abs(bearing)) / 14);
    const alpha = Math.max(0.04, 1 - sinkT * 0.9) * edgeFade;
    const scale = Math.max(0.06, Math.min(6, 300 / dist));
    const h = baseH * scale;
    const wid = baseW * scale;
    const sinkOff = sinkT * h * 2.5;
    // Perspective-correct waterline: closer objects sit lower on screen.
    const waterlineY = Math.min(HORIZ_Y + (EYE_HEIGHT / dist) * FOCAL, DASH_TOP - 16);
    const topY = waterlineY - h * 0.65 + sinkOff;
    const botY = waterlineY + h * 0.35 + sinkOff;

    ctx.save();
    ctx.globalAlpha = alpha;

    if (isEscort) {
      drawEscortFPV(ctx, sx, topY, botY, h, wid, sinkT, dist);
    } else if (label === "CARGO") {
      drawCargoFPV(ctx, sx, topY, botY, h, wid, scale, ls.time);
    } else if (label === "FERRY") {
      drawFerryFPV(ctx, sx, topY, botY, h, wid, scale, ls.time);
    } else {
      // Small vessels (fishers, traffic) — simple but nicer
      const hg2 = ctx.createLinearGradient(sx - wid, topY, sx + wid, botY);
      hg2.addColorStop(0, hull); hg2.addColorStop(0.5, cabin); hg2.addColorStop(1, hull);
      ctx.fillStyle = hg2;
      ctx.beginPath();
      ctx.moveTo(sx, topY);
      ctx.lineTo(sx + wid * 0.9, topY + h * 0.35);
      ctx.lineTo(sx + wid * 0.8, botY);
      ctx.lineTo(sx - wid * 0.8, botY);
      ctx.lineTo(sx - wid * 0.9, topY + h * 0.35);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = cabin;
      ctx.fillRect(sx - wid * 0.35, topY + h * 0.1, wid * 0.7, h * 0.35);
      // Mast
      if (scale > 0.4) {
        ctx.strokeStyle = "rgba(215,205,175,0.6)";
        ctx.lineWidth = Math.max(0.4, scale * 0.5);
        ctx.beginPath(); ctx.moveTo(sx, topY + h * 0.08); ctx.lineTo(sx, topY - h * 0.4); ctx.stroke();
      }
    }
    ctx.restore();

    if (label && dist < 500 && scale > 0.3) {
      ctx.save();
      ctx.globalAlpha = alpha * 0.88;
      ctx.fillStyle = isEscort ? "rgba(255,230,100,0.9)" : "rgba(255,255,255,0.7)";
      ctx.font = `bold ${Math.max(8, Math.round(9 * scale))}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(label, sx, topY - h * 0.55 - 4);
      ctx.fillStyle = "rgba(255,220,80,0.75)";
      ctx.font = `${Math.max(7, Math.round(8 * scale))}px sans-serif`;
      ctx.fillText(`${Math.round(dist)} m`, sx, botY + Math.max(9, 11 * scale));
      ctx.restore();
    }
  }
}

/** Cargo freighter in FPV — bulk carrier with hatches, crane, red waterline. */
function drawCargoFPV(ctx: CanvasRenderingContext2D, sx: number, topY: number, botY: number, h: number, wid: number, scale: number, time: number) {
  void time;
  const mid = topY + (botY - topY) * 0.5;
  // Hull gradient (dark blue-grey, metallic)
  const hg = ctx.createLinearGradient(sx - wid, topY, sx + wid, botY);
  hg.addColorStop(0,   "#2a4260"); hg.addColorStop(0.5, "#3a5878"); hg.addColorStop(1, "#22384e");
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.moveTo(sx,            topY);
  ctx.lineTo(sx + wid,      topY + h * 0.28);
  ctx.lineTo(sx + wid * 0.85, botY);
  ctx.lineTo(sx - wid * 0.85, botY);
  ctx.lineTo(sx - wid,      topY + h * 0.28);
  ctx.closePath();
  ctx.fill();
  // Red waterline stripe
  ctx.strokeStyle = "#c03820";
  ctx.lineWidth = Math.max(1.2, h * 0.045);
  ctx.beginPath();
  ctx.moveTo(sx - wid * 0.87, mid + h * 0.14);
  ctx.lineTo(sx + wid * 0.87, mid + h * 0.14);
  ctx.stroke();
  // Deck
  ctx.fillStyle = "#3a4a3a";
  ctx.beginPath();
  ctx.moveTo(sx, topY + h * 0.03);
  ctx.lineTo(sx + wid * 0.8, topY + h * 0.26);
  ctx.lineTo(sx + wid * 0.72, mid + h * 0.1);
  ctx.lineTo(sx - wid * 0.72, mid + h * 0.1);
  ctx.lineTo(sx - wid * 0.8, topY + h * 0.26);
  ctx.closePath();
  ctx.fill();
  // Cargo hatches (3)
  if (scale > 0.22) {
    [- h * 0.27, -h * 0.06, h * 0.07].forEach((oy) => {
      ctx.fillStyle = "#283828";
      ctx.fillRect(sx - wid * 0.42, topY + h * 0.28 + oy, wid * 0.84, h * 0.1);
      ctx.strokeStyle = "rgba(80,110,80,0.55)"; ctx.lineWidth = 0.6;
      ctx.strokeRect(sx - wid * 0.42, topY + h * 0.28 + oy, wid * 0.84, h * 0.1);
    });
  }
  // Bridge superstructure (aft)
  ctx.fillStyle = "#4a5a6a";
  ctx.fillRect(sx + wid * 0.2, topY + h * 0.06, wid * 0.5, h * 0.38);
  // Bridge windows
  if (scale > 0.38) {
    ctx.fillStyle = "rgba(160,220,255,0.55)";
    for (let wi = 0; wi < 3; wi++) ctx.fillRect(sx + wid * 0.24 + wi * wid * 0.15, topY + h * 0.11, wid * 0.1, h * 0.1);
  }
  // Mast + boom (forward)
  if (scale > 0.28) {
    ctx.strokeStyle = "rgba(200,195,175,0.65)"; ctx.lineWidth = Math.max(0.5, scale * 0.55);
    ctx.beginPath(); ctx.moveTo(sx - wid * 0.35, topY + h * 0.26); ctx.lineTo(sx - wid * 0.35, topY - h * 0.55); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx - wid * 0.35, topY - h * 0.3); ctx.lineTo(sx + wid * 0.2, topY + h * 0.12); ctx.stroke();
  }
  // Funnel (aft)
  ctx.fillStyle = "#1a2838";
  ctx.fillRect(sx + wid * 0.48, topY + h * 0.06, wid * 0.14, -h * 0.22);
  ctx.fillStyle = "rgba(255,220,80,0.65)";
  ctx.fillRect(sx + wid * 0.48, topY - h * 0.16, wid * 0.14, h * 0.04);
  // Smoke
  if (scale > 0.35) {
    const smk = (time * 0.8) % 1;
    ctx.fillStyle = `rgba(140,140,130,${(1 - smk) * 0.38})`;
    ctx.beginPath(); ctx.arc(sx + wid * 0.55, topY - h * 0.16 - smk * h * 0.5, (1 + smk * 3) * scale, 0, Math.PI * 2); ctx.fill();
  }
}

/** Ferry in FPV — white multi-deck passenger vessel with portholes. */
function drawFerryFPV(ctx: CanvasRenderingContext2D, sx: number, topY: number, botY: number, h: number, wid: number, scale: number, time: number) {
  void time;
  // Hull (light blue-white, smooth lines)
  const hg = ctx.createLinearGradient(sx - wid, topY, sx + wid, botY);
  hg.addColorStop(0, "#3a5870"); hg.addColorStop(0.5, "#5a7a9a"); hg.addColorStop(1, "#344e64");
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.moveTo(sx,            topY);
  ctx.lineTo(sx + wid,      topY + h * 0.32);
  ctx.lineTo(sx + wid * 0.90, botY);
  ctx.lineTo(sx - wid * 0.90, botY);
  ctx.lineTo(sx - wid,      topY + h * 0.32);
  ctx.closePath();
  ctx.fill();
  // Blue waterline stripe
  ctx.strokeStyle = "#1a3a5c";
  ctx.lineWidth = Math.max(1, h * 0.038);
  const wlY = topY + h * 0.62;
  ctx.beginPath(); ctx.moveTo(sx - wid * 0.9, wlY); ctx.lineTo(sx + wid * 0.9, wlY); ctx.stroke();
  // Multi-deck superstructure
  [[0, 0.38, 0.36], [0.04, 0.30, 0.28], [0.08, 0.22, 0.20]].forEach(([dOff, dW, dH], di) => {
    const deckCol = di === 0 ? "#d8dfe8" : di === 1 ? "#c8d4dc" : "#b8c4cc";
    ctx.fillStyle = deckCol;
    ctx.fillRect(sx - wid * dW, topY + h * dOff, wid * dW * 2, h * dH);
    // Portholes / windows
    if (scale > 0.35) {
      ctx.fillStyle = di === 2 ? "rgba(255,230,140,0.65)" : "rgba(160,215,255,0.55)";
      const winCount = Math.max(2, Math.round(wid * dW * 2 / (h * 0.11)));
      for (let wi = 0; wi < winCount; wi++) {
        const wx2 = sx - wid * dW + (wi + 0.5) * (wid * dW * 2 / winCount);
        const wy2 = topY + h * (dOff + 0.06);
        ctx.beginPath(); ctx.arc(wx2, wy2, Math.max(1, scale * 1.2), 0, Math.PI * 2); ctx.fill();
      }
    }
  });
  // Red BC Ferries stripe
  ctx.fillStyle = "rgba(195,30,40,0.82)";
  ctx.fillRect(sx - wid * 0.88, topY + h * 0.36, wid * 1.76, h * 0.04);
  // Funnel (2 small stacks)
  ctx.fillStyle = "#1a2430";
  [-0.12, 0.06].forEach(off => {
    ctx.fillRect(sx + wid * off, topY - h * 0.08, wid * 0.1, h * 0.18);
    ctx.fillStyle = "rgba(180,30,30,0.8)";
    ctx.fillRect(sx + wid * off, topY - h * 0.1, wid * 0.1, h * 0.03);
    ctx.fillStyle = "#1a2430";
  });
  // Smoke
  if (scale > 0.4) {
    const smk = (time * 0.7) % 1;
    ctx.fillStyle = `rgba(155,155,145,${(1 - smk) * 0.35})`;
    ctx.beginPath(); ctx.arc(sx + wid * 0.06, topY - h * 0.1 - smk * h * 0.5, (0.8 + smk * 2.8) * scale, 0, Math.PI * 2); ctx.fill();
  }
  // Bow wave
  if (scale > 0.3) {
    ctx.strokeStyle = "rgba(200,230,255,0.40)"; ctx.lineWidth = Math.max(0.5, scale * 0.7);
    ctx.beginPath(); ctx.moveTo(sx, topY); ctx.quadraticCurveTo(sx - wid, topY + h * 0.45, sx - wid * 1.1, botY); ctx.stroke();
  }
}

/** Detailed escort cargo ship silhouette in FPV. */
function drawEscortFPV(ctx: CanvasRenderingContext2D, sx: number, topY: number, botY: number, h: number, wid: number, sinkT: number, dist: number) {
  void sinkT;
  const mid = topY + (botY - topY) * 0.5;
  // Hull
  const hg = ctx.createLinearGradient(sx - wid, topY, sx + wid, botY);
  hg.addColorStop(0, "#28383a");
  hg.addColorStop(0.5, "#2e4244");
  hg.addColorStop(1, "#1a2830");
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.moveTo(sx, topY);
  ctx.lineTo(sx + wid, topY + h * 0.28);
  ctx.lineTo(sx + wid * 0.9, botY);
  ctx.lineTo(sx - wid * 0.9, botY);
  ctx.lineTo(sx - wid, topY + h * 0.28);
  ctx.closePath();
  ctx.fill();
  // Waterline stripe
  ctx.strokeStyle = "#c84820";
  ctx.lineWidth = Math.max(1, h * 0.04);
  ctx.beginPath();
  ctx.moveTo(sx - wid * 0.92, mid + h * 0.12);
  ctx.lineTo(sx + wid * 0.92, mid + h * 0.12);
  ctx.stroke();
  // Deck
  ctx.fillStyle = "#3a4a38";
  ctx.beginPath();
  ctx.moveTo(sx, topY + h * 0.02);
  ctx.lineTo(sx + wid * 0.82, topY + h * 0.24);
  ctx.lineTo(sx + wid * 0.74, mid + h * 0.08);
  ctx.lineTo(sx - wid * 0.74, mid + h * 0.08);
  ctx.lineTo(sx - wid * 0.82, topY + h * 0.24);
  ctx.closePath();
  ctx.fill();
  // Cargo hatches (3)
  if (dist < 600) {
    const hw = wid * 0.44;
    const hh = h * 0.1;
    [-h * 0.3, -h * 0.09, h * 0.06].forEach((oy) => {
      ctx.fillStyle = "#2a3828";
      ctx.fillRect(sx - hw, topY + h * 0.26 + oy, hw * 2, hh + 2);
      ctx.fillStyle = "#3e5040";
      ctx.fillRect(sx - hw + 1, topY + h * 0.27 + oy, hw * 2 - 2, hh);
    });
    // Cranes
    ctx.strokeStyle = "#e0b820";
    ctx.lineWidth = Math.max(0.6, h * 0.015);
    [[-wid * 0.5, -h * 0.22], [wid * 0.5, -h * 0.22]].forEach(([ox, oy]) => {
      const bx2 = sx + ox;
      const by2 = topY + h * 0.28 + oy;
      ctx.beginPath();
      ctx.moveTo(bx2, by2 + h * 0.04);
      ctx.lineTo(bx2, by2 - h * 0.08);
      ctx.lineTo(bx2 + (ox > 0 ? wid * 0.28 : -wid * 0.28), by2 - h * 0.18);
      ctx.stroke();
    });
  }
  // Bridge superstructure (aft, right side in FPV facing bow)
  const bx3 = sx + wid * 0.28;
  const by3 = topY + h * 0.06;
  ctx.fillStyle = "#d0c8b8";
  ctx.fillRect(bx3 - wid * 0.22, by3, wid * 0.44, h * 0.28);
  ctx.fillStyle = "#1a2838";
  ctx.fillRect(bx3 - wid * 0.19, by3 + h * 0.04, wid * 0.38, h * 0.08);
  ctx.fillStyle = "rgba(120,180,220,0.5)";
  for (let wi = 0; wi < 3; wi++) {
    ctx.fillRect(bx3 - wid * 0.15 + wi * wid * 0.1, by3 + h * 0.05, wid * 0.07, h * 0.06);
  }
  // Funnel
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(bx3 - wid * 0.07, by3 - h * 0.12, wid * 0.14, h * 0.16);
  ctx.fillStyle = "#e8c030";
  ctx.fillRect(bx3 - wid * 0.07, by3 - h * 0.04, wid * 0.14, h * 0.04);
  // Mast
  if (dist < 700) {
    ctx.strokeStyle = "rgba(180,170,140,0.65)";
    ctx.lineWidth = Math.max(0.5, h * 0.012);
    ctx.beginPath();
    ctx.moveTo(sx, topY);
    ctx.lineTo(sx, topY - h * 0.45);
    ctx.stroke();
    // Yardarm
    ctx.beginPath();
    ctx.moveTo(sx - wid * 0.35, topY - h * 0.35);
    ctx.lineTo(sx + wid * 0.35, topY - h * 0.35);
    ctx.stroke();
    // Nav lights
    ctx.fillStyle = "#ff4040";
    ctx.beginPath(); ctx.arc(sx - wid * 0.9, mid, Math.max(1, h * 0.025), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#40ff80";
    ctx.beginPath(); ctx.arc(sx + wid * 0.9, mid, Math.max(1, h * 0.025), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffff80";
    ctx.beginPath(); ctx.arc(sx, topY - h * 0.44, Math.max(1, h * 0.022), 0, Math.PI * 2); ctx.fill();
  }
}

// ── Cherry blossoms ───────────────────────────────────────────────────

function drawCherryBlossoms(ctx: CanvasRenderingContext2D, ls: LocalState) {
  ls.cherryFlowers.forEach((fl: CherryFlower) => {
    // Give petals a virtual altitude (40–120 world units = floating in the air)
    const altitude = 60 + (fl.id % 7) * 10;
    const p = project(ls.tug.x, ls.tug.y, ls.tug.heading, fl.x, fl.y, altitude);
    if (!p || p.sy > DASH_TOP || p.sy < -40) return;
    const scale = Math.max(0.3, Math.min(3.5, 220 / p.dist));
    const bearing = relBearing(ls.tug.x, ls.tug.y, ls.tug.heading, fl.x, fl.y);
    const edgeFade = Math.min(1, (HALF_FOV + 10 - Math.abs(bearing)) / 10);
    ctx.save();
    ctx.globalAlpha = Math.min(0.95, scale * 0.7) * edgeFade;
    ctx.translate(p.sx, p.sy);
    ctx.rotate(fl.rot);
    const n = 5;
    for (let i = 0; i < n; i++) {
      ctx.save();
      ctx.rotate((i / n) * Math.PI * 2);
      const pg = ctx.createLinearGradient(0, -10 * scale, 0, 3 * scale);
      pg.addColorStop(0, "#fff8fc");
      pg.addColorStop(0.45, "#ffc8e0");
      pg.addColorStop(1, "#ff9ec8");
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.ellipse(0, -5.5 * scale, 2.8 * scale, 6 * scale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = "#ffeef6";
    ctx.beginPath();
    ctx.arc(0, 0, 2.6 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f4d060";
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 1.2 * scale, Math.sin(a) * 1.2 * scale, 0.45 * scale, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });
}

// ── Fog ───────────────────────────────────────────────────────────────

function drawFog(ctx: CanvasRenderingContext2D, w: { fog: number }) {
  const f = w.fog;
  // Sky: haze increases toward horizon
  const skyFg = ctx.createLinearGradient(0, 0, 0, HORIZ_Y);
  skyFg.addColorStop(0,   `rgba(165,182,195,${f * 0.22})`); // top of sky
  skyFg.addColorStop(0.6, `rgba(163,180,193,${f * 0.38})`);
  skyFg.addColorStop(1,   `rgba(162,180,192,${f * 0.60})`); // at horizon (peak)
  ctx.fillStyle = skyFg;
  ctx.fillRect(0, 0, CW, HORIZ_Y);

  // Water: dense at horizon, gradually clears toward camera
  const waterFg = ctx.createLinearGradient(0, HORIZ_Y, 0, DASH_TOP);
  waterFg.addColorStop(0,    `rgba(162,180,192,${f * 0.60})`); // horizon (matches sky)
  waterFg.addColorStop(0.25, `rgba(160,178,190,${f * 0.50})`);
  waterFg.addColorStop(0.6,  `rgba(158,175,188,${f * 0.38})`);
  waterFg.addColorStop(1,    `rgba(155,173,185,${f * 0.25})`); // near camera
  ctx.fillStyle = waterFg;
  ctx.fillRect(0, HORIZ_Y, CW, DASH_TOP - HORIZ_Y);
}

// ── Wheelhouse ────────────────────────────────────────────────────────

function drawWheelhouse(ctx: CanvasRenderingContext2D, ls: LocalState, hud?: FpvHud) {
  // Side pillars (perspective-tapered)
  ctx.fillStyle = "#141008";
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(PILLAR_W, 0);
  ctx.lineTo(PILLAR_W, DASH_TOP); ctx.lineTo(0, CH);
  ctx.closePath(); ctx.fill();

  ctx.fillStyle = "#141008";
  ctx.beginPath();
  ctx.moveTo(CW, 0); ctx.lineTo(CW - PILLAR_W, 0);
  ctx.lineTo(CW - PILLAR_W, DASH_TOP); ctx.lineTo(CW, CH);
  ctx.closePath(); ctx.fill();

  // Inner pillar bevel
  ctx.fillStyle = "rgba(70,55,25,0.4)";
  ctx.beginPath();
  ctx.moveTo(PILLAR_W, 0); ctx.lineTo(PILLAR_W + 14, 0);
  ctx.lineTo(PILLAR_W + 20, DASH_TOP); ctx.lineTo(PILLAR_W, DASH_TOP);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(CW - PILLAR_W, 0); ctx.lineTo(CW - PILLAR_W - 14, 0);
  ctx.lineTo(CW - PILLAR_W - 20, DASH_TOP); ctx.lineTo(CW - PILLAR_W, DASH_TOP);
  ctx.closePath(); ctx.fill();

  // Window trim
  ctx.strokeStyle = "rgba(140,110,50,0.3)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(PILLAR_W, 0, CW - PILLAR_W * 2, DASH_TOP);

  // Glass glare
  const glare = ctx.createLinearGradient(PILLAR_W, 0, CW - PILLAR_W, 50);
  glare.addColorStop(0, "rgba(255,255,255,0)");
  glare.addColorStop(0.4, "rgba(255,255,255,0.03)");
  glare.addColorStop(0.55, "rgba(255,255,255,0.06)");
  glare.addColorStop(0.7, "rgba(255,255,255,0.03)");
  glare.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glare;
  ctx.fillRect(PILLAR_W, 0, CW - PILLAR_W * 2, 50);

  // Dashboard
  const dg = ctx.createLinearGradient(0, DASH_TOP, 0, CH);
  dg.addColorStop(0, "#252015");
  dg.addColorStop(0.2, "#191408");
  dg.addColorStop(1, "#080602");
  ctx.fillStyle = dg;
  ctx.fillRect(0, DASH_TOP, CW, CH - DASH_TOP);
  ctx.fillStyle = "#38301a";
  ctx.fillRect(0, DASH_TOP, CW, 3);
  ctx.fillStyle = "rgba(255,200,80,0.1)";
  ctx.fillRect(0, DASH_TOP + 3, CW, 1);

  const dashH = CH - DASH_TOP;
  const midY = DASH_TOP + dashH * 0.46;

  // Instruments
  drawFPVCompass(ctx, 148, midY, 40, ls.tug.heading);
  drawFPVGauge(ctx, CW - 148, midY, 40, "SPEED", ls.tug.speed, 18, "#30e080");
  drawSteeringWheel(ctx, SCENE_CX, DASH_TOP + dashH * 0.52, 48, ls.tug.rudder);

  // Digital heading
  ctx.fillStyle = "rgba(50,220,90,0.92)";
  ctx.font = "bold 12px monospace";
  ctx.textAlign = "center";
  ctx.fillText(`HDG  ${String(Math.round(ls.tug.heading) % 360).padStart(3, "0")}°`, SCENE_CX, DASH_TOP + 15);

  // Indicator lights — ENG 引擎故障时变红色闪烁
  const engFailed = hud?.engineFailed ?? false;
  const engFlash = engFailed ? (Math.sin(ls.time * 10) > 0) : true;
  const lights: Array<{ label: string; on: boolean; col: string }> = [
    { label: "ENG",  on: engFlash,                col: engFailed ? "#ff3010" : "#30e070" },
    { label: "NAV",  on: !engFailed,              col: "#30b0ff" },
    { label: "FOG",  on: ls.zone === "sea_lanes", col: "#ffcc30" },
    { label: "PORT", on: ls.zone === "port",      col: "#ff8030" },
  ];
  lights.forEach(({ label, on, col }, i) => {
    const lx = SCENE_CX - 72 + i * 48;
    const ly = DASH_TOP + dashH * 0.82;
    ctx.fillStyle = on ? col : "rgba(255,255,255,0.09)";
    if (on) { ctx.shadowColor = col; ctx.shadowBlur = 6; }
    ctx.beginPath(); ctx.arc(lx, ly, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = on ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.2)";
    ctx.font = "6px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(label, lx, ly + 12);
  });

  // ── 场景专属仪表盘 HUD ──────────────────────────────────────────────
  if (hud?.scenario === "fog") {
    // 能见度读数（左侧，罗盘下方）
    const vis = hud.visibility ?? 1.0;
    const visM = Math.round(vis * 1000);
    const visLabel = visM >= 1000 ? `${(vis).toFixed(1)}km` : `${visM}m`;
    const visCol = vis < 0.3 ? "#ff5030" : vis < 0.5 ? "#ffcc30" : "#30dd80";
    ctx.fillStyle = visCol;
    ctx.shadowColor = visCol; ctx.shadowBlur = 4;
    ctx.font = "bold 8px monospace"; ctx.textAlign = "center";
    ctx.fillText("VISIBILITY", 148, midY + 54);
    ctx.font = "bold 11px monospace";
    ctx.fillText(visLabel, 148, midY + 67);
    ctx.shadowBlur = 0;

    // VHF 引导指示灯
    if (hud.guidanceRequested) {
      const pulse = 0.55 + 0.45 * Math.sin(ls.time * 9);
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.fillStyle = "#30ffcc";
      ctx.shadowColor = "#30ffcc"; ctx.shadowBlur = 8;
      ctx.font = "bold 8px monospace"; ctx.textAlign = "center";
      ctx.fillText("VHF 16", CW - 148, midY + 54);
      ctx.fillText("ACTIVE", CW - 148, midY + 65);
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  } else if (hud?.scenario === "docking" && hud.targetDockX) {
    // 目标泊位距离（右侧，测速仪下方）
    const dx = hud.targetDockX - ls.tug.x;
    const dy = 756 - ls.tug.y;
    const dist = Math.round(Math.sqrt(dx * dx + dy * dy));
    const dockName = hud.targetDockX === DOCK_A_CENTER_X ? "DOCK A" : "DOCK B";
    const distCol = dist < 300 ? "#ff8020" : "#20bbff";
    ctx.fillStyle = distCol;
    ctx.shadowColor = distCol; ctx.shadowBlur = 4;
    ctx.font = "bold 8px monospace"; ctx.textAlign = "center";
    ctx.fillText("TARGET", CW - 148, midY + 50);
    ctx.font = "bold 9px monospace";
    ctx.fillText(dockName, CW - 148, midY + 61);
    ctx.font = "bold 12px monospace";
    ctx.fillText(`${dist}m`, CW - 148, midY + 75);
    ctx.shadowBlur = 0;

    // 接近速度警告（在接近时且速度过快）
    if (ls.tug.speed > 2.2 && dist < 500) {
      const pulse = 0.55 + 0.45 * Math.sin(ls.time * 11);
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.fillStyle = "#ff4020";
      ctx.shadowColor = "#ff4020"; ctx.shadowBlur = 10;
      ctx.font = "bold 10px monospace"; ctx.textAlign = "center";
      ctx.fillText("SLOW DOWN", 148, midY + 60);
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }
}

// ── 引擎故障紧急横幅 ────────────────────────────────────────────────────

function drawEmergencyBanner(ctx: CanvasRenderingContext2D, ls: LocalState) {
  const pulse = 0.7 + 0.3 * Math.sin(ls.time * 7);
  ctx.save();
  ctx.globalAlpha = pulse;

  // 深红背景
  ctx.fillStyle = "rgba(90, 5, 0, 0.9)";
  ctx.fillRect(SCENE_CX - 170, 10, 340, 36);
  ctx.strokeStyle = "rgba(255, 35, 15, 0.85)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(SCENE_CX - 170, 10, 340, 36);

  // MAYDAY 主标题
  ctx.fillStyle = "#ff4020";
  ctx.shadowColor = "#ff4020"; ctx.shadowBlur = 8;
  ctx.font = "bold 13px monospace";
  ctx.textAlign = "center";
  ctx.fillText("⚠  ENGINE FAILURE  —  MAYDAY", SCENE_CX, 25);
  ctx.shadowBlur = 0;

  // 副文字
  ctx.font = "7.5px monospace";
  ctx.fillStyle = "rgba(255, 160, 100, 0.88)";
  ctx.fillText("ANCHOR DEPLOYED  •  AWAITING RESCUE  •  VHF CH.16", SCENE_CX, 38);

  ctx.restore();
}

// ── 雾导航场景横幅 ─────────────────────────────────────────────────────

function drawFogSceneBanner(ctx: CanvasRenderingContext2D, ls: LocalState, hud: FpvHud) {
  const vis = hud.visibility ?? 1.0;
  if (vis >= 0.9) return; // 能见度良好时不显示
  const visM = Math.round(vis * 1000);
  const visLabel = visM >= 1000 ? `${vis.toFixed(1)} km` : `${visM} m`;
  const isLow = vis < 0.3;
  const pulse = 0.75 + 0.25 * Math.sin(ls.time * (isLow ? 6 : 3));

  ctx.save();
  ctx.globalAlpha = pulse;

  // 背景横幅
  ctx.fillStyle = isLow ? "rgba(45,12,8,0.82)" : "rgba(25,35,45,0.78)";
  ctx.fillRect(SCENE_CX - 140, 12, 280, 32);
  ctx.strokeStyle = isLow ? "rgba(255,80,40,0.65)" : "rgba(255,200,50,0.55)";
  ctx.lineWidth = 1;
  ctx.strokeRect(SCENE_CX - 140, 12, 280, 32);

  // 主文字
  ctx.fillStyle = isLow ? "#ff6640" : "#ffcc30";
  ctx.font = "bold 11px monospace";
  ctx.textAlign = "center";
  ctx.fillText(`FOG — VIS: ${visLabel}`, SCENE_CX, 25);

  // 副文字
  ctx.font = "8px monospace";
  if (hud.guidanceRequested) {
    ctx.fillStyle = "#40ffcc";
    ctx.fillText("VHF CH.16 HARBOUR GUIDANCE ACTIVE", SCENE_CX, 37);
  } else {
    ctx.fillStyle = isLow ? "rgba(255,150,100,0.8)" : "rgba(255,210,100,0.7)";
    ctx.fillText("REDUCED VISIBILITY — PROCEED WITH CAUTION", SCENE_CX, 37);
  }

  ctx.restore();
}

// ── 靠泊模式目标指示横幅 ────────────────────────────────────────────────

function drawDockingTargetBanner(ctx: CanvasRenderingContext2D, ls: LocalState, targetDockX: number) {
  const dx = targetDockX - ls.tug.x;
  const dy = 756 - ls.tug.y;
  const dist = Math.round(Math.sqrt(dx * dx + dy * dy));
  const dockName = targetDockX === DOCK_A_CENTER_X ? "DOCK A" : "DOCK B";
  const isNear = dist < 300;
  const col = isNear ? "#ff9040" : "#30bbff";

  ctx.save();

  // 背景横幅
  ctx.fillStyle = "rgba(5,18,32,0.80)";
  ctx.fillRect(SCENE_CX - 130, 12, 260, 30);
  ctx.strokeStyle = `${col}99`;
  ctx.lineWidth = 1;
  ctx.strokeRect(SCENE_CX - 130, 12, 260, 30);

  // 目标泊位 + 距离
  ctx.fillStyle = col;
  ctx.font = "bold 11px monospace";
  ctx.textAlign = "center";
  ctx.fillText(`TARGET: ${dockName}  —  ${dist} m`, SCENE_CX, 24);

  // 方向箭头（若目标在视野外）
  const bearing = relBearing(ls.tug.x, ls.tug.y, ls.tug.heading, targetDockX, 756);
  if (Math.abs(bearing) > HALF_FOV) {
    const dir = bearing > 0 ? 1 : -1;
    const ax = SCENE_CX + dir * 110;
    const ay = 27;
    ctx.fillStyle = "#ffcc30";
    ctx.beginPath();
    if (dir > 0) {
      ctx.moveTo(ax - 10, ay - 7); ctx.lineTo(ax + 4, ay); ctx.lineTo(ax - 10, ay + 7);
    } else {
      ctx.moveTo(ax + 10, ay - 7); ctx.lineTo(ax - 4, ay); ctx.lineTo(ax + 10, ay + 7);
    }
    ctx.closePath();
    ctx.fill();
  }

  // 副文字（提示保持 2 节以下）
  ctx.font = "7px monospace";
  ctx.fillStyle = isNear ? "rgba(255,160,80,0.85)" : "rgba(100,190,255,0.6)";
  ctx.fillText("MAX 2 kn IN DOCKING ZONE", SCENE_CX, 35);

  ctx.restore();
}

// ── Mini-map ──────────────────────────────────────────────────────────

function drawMiniMap(ctx: CanvasRenderingContext2D, ls: LocalState) {
  const mx = MM_X;
  const my = MM_Y;

  // Background
  ctx.fillStyle = "rgba(8,14,20,0.82)";
  ctx.beginPath();
  ctx.roundRect(mx, my, MM_W, MM_H, 4);
  ctx.fill();
  ctx.strokeStyle = "rgba(80,150,200,0.4)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(mx, my, MM_W, MM_H, 4);
  ctx.stroke();

  // Clip to map area
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(mx + 1, my + 1, MM_W - 2, MM_H - 2, 3);
  ctx.clip();

  // Convert world coords to map coords (centred on tug)
  const toMap = (wx: number, wy: number) => ({
    x: mx + MM_W / 2 + (wx - ls.tug.x) * MM_SCALE,
    y: my + MM_H / 2 + (wy - ls.tug.y) * MM_SCALE,
  });

  // Zone colour bands
  const zones = [
    { wx: 0,    ww: 4500, col: "rgba(40,160,70,0.14)" },
    { wx: 4500, ww: 3700, col: "rgba(40,120,200,0.14)" },
    { wx: 8200, ww: 4000, col: "rgba(80,160,220,0.12)" },
  ];
  zones.forEach(({ wx, ww, col }) => {
    const a = toMap(wx, ls.tug.y - 2000);
    const b = toMap(wx + ww, ls.tug.y + 2000);
    ctx.fillStyle = col;
    ctx.fillRect(a.x, my, b.x - a.x, MM_H);
  });

  // Water background
  ctx.fillStyle = "rgba(20,50,80,0.4)";
  ctx.fillRect(mx, my, MM_W, MM_H);
  // Re-draw zones on top of water
  zones.forEach(({ wx, ww, col }) => {
    const a = toMap(wx, ls.tug.y - 2000);
    const b = toMap(wx + ww, ls.tug.y + 2000);
    ctx.fillStyle = col;
    ctx.fillRect(Math.max(mx, a.x), my, Math.min(b.x - a.x, MM_W), MM_H);
  });

  // Other ships (gray dots)
  const others: Array<{ v: LocalVessel; col: string }> = [
    { v: ls.cargo, col: "#5a8ab8" },
    { v: ls.ferry, col: "#7a9aba" },
    ...ls.fishers.map((f) => ({ v: f, col: "#8a7050" })),
    ...ls.traffic.map((t) => ({ v: t, col: "#607080" })),
  ];
  others.forEach(({ v, col }) => {
    if (v.sunk) return;
    const p = toMap(v.x, v.y);
    if (p.x < mx || p.x > mx + MM_W || p.y < my || p.y > my + MM_H) return;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2); ctx.fill();
  });

  // Escort (green dot with heading tick)
  {
    const ep = toMap(ls.escort.x, ls.escort.y);
    if (ep.x >= mx && ep.x <= mx + MM_W && ep.y >= my && ep.y <= my + MM_H) {
      ctx.fillStyle = "#60cc60";
      ctx.beginPath(); ctx.arc(ep.x, ep.y, 3.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Tug (white dot + heading arrow)
  const tp = toMap(ls.tug.x, ls.tug.y);
  const hdgRad = (ls.tug.heading * Math.PI) / 180;
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(tp.x, tp.y);
  ctx.lineTo(tp.x + Math.sin(hdgRad) * 10, tp.y - Math.cos(hdgRad) * 10);
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath(); ctx.arc(tp.x, tp.y, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#30b0ff";
  ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(tp.x, tp.y, 3.5, 0, Math.PI * 2); ctx.stroke();

  // FOV cone
  const fovL = hdgRad - (HALF_FOV * Math.PI) / 180;
  const fovR = hdgRad + (HALF_FOV * Math.PI) / 180;
  const fovLen = 28;
  ctx.fillStyle = "rgba(100,180,255,0.08)";
  ctx.beginPath();
  ctx.moveTo(tp.x, tp.y);
  ctx.lineTo(tp.x + Math.sin(fovL) * fovLen, tp.y - Math.cos(fovL) * fovLen);
  ctx.arc(tp.x, tp.y, fovLen, fovL - Math.PI / 2, fovR - Math.PI / 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(100,180,255,0.3)";
  ctx.lineWidth = 0.8;
  ctx.stroke();

  ctx.restore();

  // North arrow
  ctx.fillStyle = "rgba(255,60,60,0.9)";
  ctx.font = "bold 7px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("N↑", mx + MM_W - 4, my + 11);

  // Label
  ctx.fillStyle = "rgba(160,200,240,0.7)";
  ctx.font = "bold 7px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("MAP", mx + 5, my + 11);

  // Zone badge
  const zc = ls.zone === "port" ? "#ffaa60" : ls.zone === "channel" ? "#50a0e8" : ls.zone === "sea_lanes" ? "#60c0ff" : "#40cc80";
  ctx.fillStyle = zc;
  ctx.font = "6px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(ls.zone.replace(/_/g, " ").toUpperCase(), mx + MM_W / 2, my + MM_H - 4);
}

// ── Steering wheel ────────────────────────────────────────────────────

function drawSteeringWheel(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rudder: number) {
  const rot = (rudder / 35) * ((Math.PI * 5) / 6);
  ctx.fillStyle = "#242018";
  ctx.fillRect(cx - 7, cy + r + 2, 14, 24);
  ctx.fillRect(cx - 22, cy + r + 24, 44, 5);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);

  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 10;
  ctx.beginPath(); ctx.arc(0, 2, r, 0, Math.PI * 2); ctx.stroke();

  ctx.strokeStyle = "#8a6438";
  ctx.lineWidth = 8;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();

  ctx.strokeStyle = "rgba(200,160,80,0.4)";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, -1, r - 2, -Math.PI * 0.65, -Math.PI * 0.05);
  ctx.stroke();

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.strokeStyle = "rgba(70,44,18,0.6)";
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.arc(0, 0, r, a, a + 0.22); ctx.stroke();
  }

  ctx.strokeStyle = "#5a3e1e";
  ctx.lineWidth = 5;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 10, Math.sin(a) * 10);
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.stroke();
  }

  const hub = ctx.createRadialGradient(0, -2, 2, 0, 0, 11);
  hub.addColorStop(0, "#c08850"); hub.addColorStop(0.5, "#7a5030"); hub.addColorStop(1, "#3a2010");
  ctx.fillStyle = hub;
  ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();

  ctx.restore();
}

// ── Speed gauge ───────────────────────────────────────────────────────

function drawFPVGauge(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, label: string, value: number, maxVal: number, col: string) {
  const bz = ctx.createRadialGradient(cx, cy - r * 0.2, r * 0.4, cx, cy, r + 6);
  bz.addColorStop(0, "#3a3020"); bz.addColorStop(1, "#1a1810");
  ctx.fillStyle = bz;
  ctx.beginPath(); ctx.arc(cx, cy, r + 6, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#4a3c1c"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, r + 6, 0, Math.PI * 2); ctx.stroke();

  ctx.fillStyle = "#060504";
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();

  const arcS = Math.PI * 0.72, arcE = Math.PI * 2.28;
  for (let i = 0; i <= 10; i++) {
    const a = arcS + (i / 10) * (arcE - arcS);
    const inner = i % 5 === 0 ? r - 10 : r - 7;
    ctx.strokeStyle = i % 5 === 0 ? "rgba(200,190,150,0.7)" : "rgba(150,140,110,0.35)";
    ctx.lineWidth = i % 5 === 0 ? 1.5 : 0.8;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.stroke();
  }

  ctx.strokeStyle = "#1e1c10"; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(cx, cy, r - 6, arcS, arcE); ctx.stroke();

  const pct = Math.max(0, Math.min(1, value / maxVal));
  ctx.strokeStyle = col; ctx.lineWidth = 5;
  ctx.shadowColor = col; ctx.shadowBlur = 5;
  ctx.beginPath(); ctx.arc(cx, cy, r - 6, arcS, arcS + pct * (arcE - arcS)); ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.fillStyle = "rgba(200,200,180,0.5)"; ctx.font = "bold 7px sans-serif"; ctx.textAlign = "center";
  ctx.fillText(label, cx, cy + 5);
  ctx.fillStyle = col; ctx.font = "bold 10px monospace";
  ctx.fillText(value.toFixed(1), cx, cy + 16);
}

// ── Compass ───────────────────────────────────────────────────────────

function drawFPVCompass(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, heading: number) {
  const bz = ctx.createRadialGradient(cx, cy - r * 0.2, r * 0.4, cx, cy, r + 6);
  bz.addColorStop(0, "#3a3020"); bz.addColorStop(1, "#1a1810");
  ctx.fillStyle = bz;
  ctx.beginPath(); ctx.arc(cx, cy, r + 6, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#4a3c1c"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, r + 6, 0, Math.PI * 2); ctx.stroke();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((-heading * Math.PI) / 180);

  ctx.fillStyle = "#060504";
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();

  const cards: Array<[string, number]> = [["N", 0], ["E", 90], ["S", 180], ["W", 270]];
  cards.forEach(([lbl, deg]) => {
    const a = (deg * Math.PI) / 180;
    ctx.fillStyle = lbl === "N" ? "#ff4040" : "rgba(200,195,160,0.75)";
    ctx.font = `bold ${lbl === "N" ? 9 : 7}px sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(lbl, Math.sin(a) * (r - 10), -Math.cos(a) * (r - 10));
  });
  ctx.textBaseline = "alphabetic";

  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const isMajor = i % 9 === 0;
    const inner = isMajor ? r - 12 : i % 3 === 0 ? r - 9 : r - 6;
    ctx.strokeStyle = isMajor ? "rgba(255,200,90,0.75)" : "rgba(200,190,150,0.22)";
    ctx.lineWidth = isMajor ? 1.5 : 0.7;
    ctx.beginPath();
    ctx.moveTo(Math.sin(a) * inner, -Math.cos(a) * inner);
    ctx.lineTo(Math.sin(a) * (r - 1), -Math.cos(a) * (r - 1));
    ctx.stroke();
  }
  ctx.restore();

  ctx.fillStyle = "#ff4040";
  ctx.beginPath(); ctx.moveTo(cx, cy - r + 1); ctx.lineTo(cx - 4, cy - r + 11); ctx.lineTo(cx + 4, cy - r + 11); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#7a5c28";
  ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, Math.PI * 2); ctx.fill();
}
