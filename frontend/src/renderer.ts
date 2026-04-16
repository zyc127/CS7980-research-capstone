import {
  CH,
  CW,
  DOCK_A_CENTER_X,
  DOCK_B_CENTER_X,
  DOCK_WATERLINE_Y,
  MOORED_SHIPS,
  PATH_END_X,
  PORT_BASIN_START_X,
  WATER_ROCKS,
  WEATHER_CFG,
  type WeatherKey,
} from "./constants";
import type { LocalState } from "./types";

export function render(ctx: CanvasRenderingContext2D, ls: LocalState, weather: WeatherKey, shake = { x: 0, y: 0 }, targetDockX = 0) {
  const w = WEATHER_CFG[weather] ?? WEATHER_CFG.clear;
  // Camera shake
  ctx.save();
  ctx.translate(shake.x, shake.y);
  // Horizon: a bit lower → more water area below (longer “sea” on screen)
  const horizY = CH * 0.36;
  const toS = (wx: number, wy: number) => ({ x: wx - ls.cam.x + CW / 2, y: wy - ls.cam.y + CH / 2 });

  // Sky
  const sky = ctx.createLinearGradient(0, 0, 0, horizY);
  sky.addColorStop(0, w.sky[0]);
  sky.addColorStop(1, w.sky[1]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, CW, horizY);

  // Animated clouds in sky
  for (let ci = 0; ci < 9; ci++) {
    const seed = ci * 137.5;
    const cloudX = ((seed * 4.1 - ls.cam.x * 0.018 + ls.time * 2.5 + 12000) % (CW + 240)) - 100;
    const cloudY = 14 + ((ci * 41) % Math.max(1, horizY * 0.62));
    const cloudW = 52 + (ci * 31 % 90);
    const cloudH = 11 + (ci * 17 % 18);
    if (cloudX > CW + 100 || cloudX + cloudW < -100) continue;
    const alpha = weather === "fog" ? 0.14 : 0.25 + (ci % 3) * 0.09;
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ([
      [0, 0, cloudH * 0.9], [cloudW * 0.25, -cloudH * 0.28, cloudH * 0.88],
      [cloudW * 0.52, 0, cloudH], [cloudW * 0.76, -cloudH * 0.18, cloudH * 0.78],
      [cloudW, 0, cloudH * 0.65],
    ] as [number, number, number][]).forEach(([px, py, pr]) => {
      ctx.beginPath();
      ctx.arc(cloudX + px, cloudY + py, pr, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // Mountains — North Shore Vancouver (two layers, clip-based snow)
  // Back layer: warm purple-blue atmospheric haze
  [
    [-50,  390, 132, "#6a6488", 0.38],
    [250,  355, 120, "#787090", 0.35],
    [520,  396, 145, "#6a6488", 0.40],
    [790,  335, 127, "#70687e", 0.36],
    [1060, 375, 140, "#6a6488", 0.38],
  ].forEach(([mx, mw, mh, mc, snowRatio]) => {
    const sx = (((mx as number) - ls.cam.x * 0.025 + CW / 2 - 100 + 5000) % (CW + 400)) - 150;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(sx, horizY);
    ctx.lineTo(sx + (mw as number) * 0.36, horizY - (mh as number) * 0.60);
    ctx.lineTo(sx + (mw as number) * 0.50, horizY - (mh as number));
    ctx.lineTo(sx + (mw as number) * 0.66, horizY - (mh as number) * 0.65);
    ctx.lineTo(sx + (mw as number), horizY);
    ctx.closePath();
    ctx.fillStyle = mc as string;
    ctx.fill();
    ctx.clip();
    // Snow clipped to mountain shape
    const sg = ctx.createLinearGradient(sx + (mw as number) * 0.5, horizY - (mh as number),
                                         sx + (mw as number) * 0.5, horizY - (mh as number) * (1 - (snowRatio as number) * 1.6));
    sg.addColorStop(0, "rgba(230,244,254,0.60)");
    sg.addColorStop(1, "rgba(230,244,254,0)");
    ctx.fillStyle = sg;
    ctx.fillRect(sx - 4, horizY - (mh as number) - 2, (mw as number) + 8, (mh as number) * (snowRatio as number) * 2.0);
    ctx.restore();
  });
  // Front layer: The Lions (blue-purple) + Grouse (forest teal) + Seymour + Cypress
  [
    // West Lion — dramatic blue-purple
    [-68,  88, 205, "#3a3c5e", 0.42],
    // East Lion — slightly taller, darker
    [ 16,  84, 213, "#322e52", 0.44],
    // Grouse Mountain — dark forest teal-green
    [240, 230, 182, "#2a4a50", 0.36],
    // Mount Seymour — slate blue
    [510, 206, 170, "#324858", 0.32],
    // Cypress Mountain — deep teal
    [765, 216, 178, "#284850", 0.35],
    [1015, 200, 166, "#30404e", 0.33],
  ].forEach(([mx, mw, mh, mc, snowRatio]) => {
    const sx = (((mx as number) - ls.cam.x * 0.04 + CW / 2 - 100 + 5000) % (CW + 400)) - 150;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(sx, horizY);
    ctx.lineTo(sx + (mw as number) * 0.24, horizY - (mh as number) * 0.48);
    ctx.lineTo(sx + (mw as number) * 0.40, horizY - (mh as number) * 0.74);
    ctx.lineTo(sx + (mw as number) / 2,    horizY - (mh as number));
    ctx.lineTo(sx + (mw as number) * 0.60, horizY - (mh as number) * 0.70);
    ctx.lineTo(sx + (mw as number) * 0.78, horizY - (mh as number) * 0.44);
    ctx.lineTo(sx + (mw as number), horizY);
    ctx.closePath();
    ctx.fillStyle = mc as string;
    ctx.fill();
    ctx.clip();
    // Snow cap — clipped so always within mountain body
    const sg = ctx.createLinearGradient(sx + (mw as number) / 2, horizY - (mh as number),
                                         sx + (mw as number) / 2, horizY - (mh as number) * (1 - (snowRatio as number) * 1.5));
    sg.addColorStop(0,    "rgba(248,254,255,0.92)");
    sg.addColorStop(0.45, "rgba(238,250,255,0.45)");
    sg.addColorStop(1,    "rgba(238,250,255,0)");
    ctx.fillStyle = sg;
    ctx.fillRect(sx - 4, horizY - (mh as number) - 2, (mw as number) + 8, (mh as number) * (snowRatio as number) * 2.2);
    // Right-face shadow
    const shadeGrad = ctx.createLinearGradient(sx + (mw as number) * 0.38, 0, sx + (mw as number), 0);
    shadeGrad.addColorStop(0, "rgba(0,0,0,0)");
    shadeGrad.addColorStop(1, "rgba(0,0,0,0.14)");
    ctx.fillStyle = shadeGrad;
    ctx.fillRect(sx + (mw as number) * 0.35, horizY - (mh as number) - 2, (mw as number) * 0.65 + 8, (mh as number) + 4);
    ctx.restore();
  });

  // Vancouver downtown skyline — mixed glass, steel, concrete towers
  // [wx, width, height, bodyColor, windowColor]
  [
    [812, 18, 95,  "#1e3a58", "rgba(140,210,255,0.28)"],  // glass blue
    [835, 14, 70,  "#3a3040", "rgba(255,220,100,0.22)"],  // dark concrete, warm windows
    [854, 24, 125, "#1c4870", "rgba(100,200,255,0.30)"],  // tall glass tower
    [884, 18, 88,  "#2e3848", "rgba(255,218,90,0.20)"],   // steel grey
    [908, 22, 112, "#1a3e68", "rgba(120,215,255,0.28)"],  // deep glass blue
    [936, 16, 68,  "#38303c", "rgba(255,200,80,0.18)"],   // warm dark stone
    [958, 28, 136, "#1c4270", "rgba(110,205,255,0.32)"],  // tallest glass block
    [1490, 20, 90, "#283848", "rgba(255,215,90,0.22)"],
    [1514, 30, 128, "#1a3e68", "rgba(130,218,255,0.30)"],
    [1550, 18, 72, "#342c3e", "rgba(255,205,85,0.18)"],
    [1574, 26, 110, "#1c4470", "rgba(115,208,255,0.28)"],
  ].forEach(([bwx, bw, bh, bc, wc]) => {
    const { x: bx } = toS(bwx as number, 0);
    if (bx < -50 || bx > CW + 50) return;
    ctx.fillStyle = bc as string;
    ctx.fillRect(bx, horizY - (bh as number) + 8, bw as number, (bh as number) - 8);
    // Glass curtain-wall highlight on left face
    ctx.fillStyle = "rgba(160,230,255,0.06)";
    ctx.fillRect(bx, horizY - (bh as number) + 8, Math.max(2, (bw as number) * 0.25), (bh as number) - 8);
    // Windows
    ctx.fillStyle = wc as string;
    for (let ry = horizY - (bh as number) + 14; ry < horizY - 4; ry += 10) {
      for (let rx = bx + 3; rx < bx + (bw as number) - 3; rx += 7) {
        if (Math.sin(rx * 2.7 + ry * 1.9) > 0.1) ctx.fillRect(rx, ry, 4, 5);
      }
    }
  });
  // === Steam Clock (Gastown wx 680) ===
  {
    const { x: scx } = toS(680, 0);
    if (scx > -60 && scx < CW + 60) {
      const BY = horizY + 8;
      // Shaft (brass/copper gradient)
      const shaftG = ctx.createLinearGradient(scx - 4, 0, scx + 4, 0);
      shaftG.addColorStop(0, "#6a440e"); shaftG.addColorStop(0.5, "#c08820"); shaftG.addColorStop(1, "#7a5210");
      ctx.fillStyle = shaftG;
      ctx.fillRect(scx - 4, BY - 68, 8, 60);
      // Decorative bands
      ctx.fillStyle = "#d4a030";
      [BY-68, BY-52, BY-36].forEach(y => ctx.fillRect(scx - 6, y, 12, 3));
      // Gold dome
      ctx.fillStyle = "#e8b830";
      ctx.beginPath(); ctx.arc(scx, BY - 70, 8, Math.PI, 0); ctx.fill();
      // Dome highlight
      ctx.fillStyle = "rgba(255,240,160,0.55)";
      ctx.beginPath(); ctx.arc(scx - 2, BY - 74, 4, Math.PI, 0); ctx.fill();
      // Clock face
      ctx.fillStyle = "rgba(252,244,210,0.95)";
      ctx.beginPath(); ctx.arc(scx, BY - 52, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#8B6914"; ctx.lineWidth = 0.8;
      ctx.strokeRect(scx - 8, BY - 34, 16, 6);
      // Steam puff (animated)
      const sp = (ls.time * 1.2) % 1;
      ctx.fillStyle = `rgba(235,242,250,${(1 - sp) * 0.55})`;
      ctx.beginPath(); ctx.arc(scx + (sp - 0.3) * 6, BY - 70 - sp * 18, 2 + sp * 4, 0, Math.PI * 2); ctx.fill();
    }
  }

  // === Canada Place (wx 1055) — large pier, 7 iconic white sails ===
  {
    const { x: cpx } = toS(1055, 0);
    if (cpx > -150 && cpx < CW + 150) {
      const BY = horizY + 8;
      // Pier extension (into water)
      ctx.fillStyle = "#1a3a52";
      ctx.fillRect(cpx - 70, BY, 140, 16);
      // Pier shadow
      ctx.fillStyle = "rgba(0,20,40,0.30)";
      ctx.fillRect(cpx - 70, BY + 16, 140, 6);
      // Main building body (layered glass)
      const bG = ctx.createLinearGradient(cpx - 70, 0, cpx + 70, 0);
      bG.addColorStop(0, "#1a3a52"); bG.addColorStop(0.45, "#265878"); bG.addColorStop(1, "#1a3248");
      ctx.fillStyle = bG;
      ctx.fillRect(cpx - 70, BY - 46, 140, 46);
      // Glass floor bands
      for (let fi = 0; fi < 5; fi++) {
        ctx.fillStyle = `rgba(100,195,240,${0.09 + fi * 0.02})`;
        ctx.fillRect(cpx - 70, BY - 46 + fi * 9, 140, 4);
      }
      // === 7 white sail fins ===
      const sailHts = [38, 52, 68, 76, 66, 52, 38];
      for (let si = 0; si < 7; si++) {
        const sx2 = cpx - 62 + si * 20;
        const sh = sailHts[si];
        // Shadow face
        ctx.fillStyle = "rgba(180,215,240,0.55)";
        ctx.beginPath(); ctx.moveTo(sx2 + 6, BY - 46); ctx.lineTo(sx2 + 15, BY - 46 - sh * 0.88); ctx.lineTo(sx2 + 20, BY - 46); ctx.closePath(); ctx.fill();
        // Lit face
        ctx.fillStyle = "rgba(248,255,255,0.97)";
        ctx.beginPath(); ctx.moveTo(sx2 - 1, BY - 46); ctx.lineTo(sx2 + 9, BY - 46 - sh); ctx.lineTo(sx2 + 15, BY - 46 - sh * 0.88); ctx.lineTo(sx2 + 6, BY - 46); ctx.closePath(); ctx.fill();
      }
      // Central mast + flag
      ctx.fillStyle = "#c8dce8";
      ctx.fillRect(cpx - 1, BY - 46 - 80, 2, 80);
      ctx.fillStyle = "rgba(210,30,30,0.85)";
      ctx.fillRect(cpx, BY - 46 - 80, 12, 7);
      // Reflection on water (very faint)
      ctx.fillStyle = "rgba(100,180,230,0.10)";
      ctx.fillRect(cpx - 70, BY + 6, 140, 10);
      // Label
      ctx.fillStyle = "rgba(220,240,255,0.82)";
      ctx.font = "bold 10px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("CANADA PLACE", cpx, BY - 46 - 88);
    }
  }

  // === Harbour Centre (wx 1240) — slim tower, wide saucer disc ===
  {
    const { x: hcx } = toS(1240, 0);
    if (hcx > -80 && hcx < CW + 80) {
      const BY = horizY + 8;
      // Base podium
      ctx.fillStyle = "#1e2e44";
      ctx.fillRect(hcx - 14, BY - 22, 28, 22);
      // Tower shaft (gradient)
      const tG = ctx.createLinearGradient(hcx - 5, 0, hcx + 5, 0);
      tG.addColorStop(0, "#162030"); tG.addColorStop(0.5, "#1e3050"); tG.addColorStop(1, "#121828");
      ctx.fillStyle = tG;
      ctx.fillRect(hcx - 5, BY - 148, 10, 126);
      // Floor marks on shaft
      for (let fi = 1; fi <= 7; fi++) {
        ctx.fillStyle = "rgba(120,170,220,0.15)";
        ctx.fillRect(hcx - 5, BY - 22 - fi * 16, 10, 1);
      }
      // === Wide observation disc ===
      const dY = BY - 148;
      // Shadow layer
      ctx.fillStyle = "#182030";
      ctx.fillRect(hcx - 32, dY + 2, 64, 16);
      // Main disc body
      const dG = ctx.createLinearGradient(hcx - 30, dY, hcx + 30, dY);
      dG.addColorStop(0, "#1e3456"); dG.addColorStop(0.4, "#2e4a78"); dG.addColorStop(1, "#182e4e");
      ctx.fillStyle = dG;
      ctx.fillRect(hcx - 30, dY - 14, 60, 14);
      // Glass window strip (amber glow)
      ctx.fillStyle = "rgba(255,215,100,0.55)";
      for (let wi = 0; wi < 10; wi++) ctx.fillRect(hcx - 26 + wi * 6, dY - 10, 4, 6);
      // Disc underside (bright)
      ctx.fillStyle = "rgba(255,220,100,0.18)";
      ctx.fillRect(hcx - 30, dY, 60, 4);
      // Antenna + beacon
      ctx.fillStyle = "#2a4060";
      ctx.fillRect(hcx - 1, dY - 30, 2, 18);
      ctx.fillStyle = "rgba(255,80,60,0.9)";
      ctx.beginPath(); ctx.arc(hcx, dY - 30, 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(220,240,255,0.80)";
      ctx.font = "bold 8px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("HARBOUR CTR", hcx, dY - 35);
    }
  }

  // === BC Place (wx 1680) — wide base, large dome with ribs and masts ===
  {
    const { x: bcx } = toS(1680, 0);
    if (bcx > -130 && bcx < CW + 130) {
      const BY = horizY + 8;
      // Stadium wall
      const wG = ctx.createLinearGradient(bcx - 72, 0, bcx + 72, 0);
      wG.addColorStop(0, "#1e2c3e"); wG.addColorStop(0.5, "#253648"); wG.addColorStop(1, "#1a2838");
      ctx.fillStyle = wG;
      ctx.fillRect(bcx - 72, BY - 36, 144, 36);
      // Arch windows on facade
      for (let ai = 0; ai < 12; ai++) {
        ctx.fillStyle = "rgba(80,150,210,0.16)";
        ctx.fillRect(bcx - 65 + ai * 11, BY - 30, 8, 22);
      }
      // Shadow line
      ctx.fillStyle = "rgba(0,15,30,0.30)";
      ctx.fillRect(bcx - 72, BY - 36, 144, 5);
      // === Dome ===
      // Dome shadow
      ctx.fillStyle = "rgba(140,175,210,0.28)";
      ctx.beginPath(); ctx.ellipse(bcx + 4, BY - 36 + 4, 69, 35, 0, Math.PI, 0); ctx.fill();
      // Main dome (radial gradient lit from upper-left)
      const dRG = ctx.createRadialGradient(bcx - 22, BY - 62, 5, bcx, BY - 36, 68);
      dRG.addColorStop(0,   "rgba(245,254,255,0.97)");
      dRG.addColorStop(0.55,"rgba(215,238,252,0.88)");
      dRG.addColorStop(1,   "rgba(165,200,230,0.72)");
      ctx.fillStyle = dRG;
      ctx.beginPath(); ctx.ellipse(bcx, BY - 36, 68, 34, 0, Math.PI, 0); ctx.fill();
      // Structural ribs
      ctx.strokeStyle = "rgba(120,165,210,0.28)"; ctx.lineWidth = 0.8;
      for (let ri = -5; ri <= 5; ri++) {
        const rx2 = bcx + ri * 13;
        const ry = BY - 36 - Math.sqrt(Math.max(0, 68 ** 2 - (rx2 - bcx) ** 2)) * 34 / 68;
        ctx.beginPath(); ctx.moveTo(rx2, BY - 36); ctx.lineTo(bcx, ry); ctx.stroke();
      }
      // Mast cables
      ctx.strokeStyle = "rgba(170,195,220,0.40)"; ctx.lineWidth = 0.7;
      [-50, -17, 17, 50].forEach(off => {
        const mx = bcx + off;
        ctx.beginPath(); ctx.moveTo(mx, BY - 36); ctx.lineTo(mx, BY - 66); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(mx, BY - 66); ctx.quadraticCurveTo(bcx, BY - 72, bcx, BY - 71); ctx.stroke();
      });
      ctx.fillStyle = "rgba(220,240,255,0.78)";
      ctx.font = "bold 9px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("BC PLACE", bcx, BY - 76);
    }
  }

  // === Science World (wx 2280) — large silver geodesic dome ===
  {
    const { x: swx } = toS(2280, 0);
    if (swx > -140 && swx < CW + 140) {
      const BY = horizY + 8;
      const dR = 72;            // dome radius (was 46)
      const baseY = BY - 16;   // dome sits on this y

      // Base platform / pedestal
      ctx.fillStyle = "#2a3848";
      ctx.beginPath();
      ctx.ellipse(swx, baseY, 78, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#364455";
      ctx.fillRect(swx - 72, baseY - 6, 144, 6);

      // Dome body (full radial gradient for 3D sphere look)
      const domeG = ctx.createRadialGradient(swx - dR * 0.22, baseY - dR * 0.55, dR * 0.05, swx, baseY, dR);
      domeG.addColorStop(0,   "#daeef8");
      domeG.addColorStop(0.30, "#b0cfe0");
      domeG.addColorStop(0.65, "#7aaec8");
      domeG.addColorStop(0.88, "#5890b0");
      domeG.addColorStop(1,   "#3a6a8c");
      ctx.fillStyle = domeG;
      ctx.beginPath(); ctx.arc(swx, baseY, dR, Math.PI, 0); ctx.fill();

      // Geodesic structure lines — 8 meridian wedges
      ctx.strokeStyle = "rgba(20,55,90,0.38)"; ctx.lineWidth = 1.1;
      for (let gi = 1; gi <= 7; gi++) {
        const ga = Math.PI + (gi / 8) * Math.PI;
        ctx.beginPath();
        ctx.moveTo(swx, baseY);
        ctx.lineTo(swx + Math.cos(ga) * dR, baseY + Math.sin(ga) * dR);
        ctx.stroke();
      }
      // 5 latitude rings
      ctx.strokeStyle = "rgba(20,55,90,0.32)"; ctx.lineWidth = 0.9;
      for (let ri = 1; ri <= 5; ri++) {
        const ringFrac = ri / 6;
        const ringH = ringFrac * dR;                                        // height above base
        const rr = Math.sqrt(Math.max(0, dR * dR - ringH * ringH));        // ring screen radius
        ctx.beginPath();
        ctx.arc(swx, baseY, rr, Math.PI, 0);
        ctx.stroke();
      }
      // Triangle facets shading (alternating bright/dark triangles)
      ctx.save();
      ctx.globalAlpha = 0.07;
      for (let gi = 0; gi < 8; gi++) {
        const ga1 = Math.PI + (gi / 8) * Math.PI;
        const ga2 = Math.PI + ((gi + 1) / 8) * Math.PI;
        ctx.fillStyle = gi % 2 === 0 ? "#ffffff" : "#000030";
        ctx.beginPath();
        ctx.moveTo(swx, baseY);
        ctx.lineTo(swx + Math.cos(ga1) * dR, baseY + Math.sin(ga1) * dR);
        ctx.lineTo(swx + Math.cos(ga2) * dR, baseY + Math.sin(ga2) * dR);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // Specular highlight arc
      ctx.save();
      ctx.strokeStyle = "rgba(240,252,255,0.55)";
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(swx - dR * 0.20, baseY - dR * 0.62, dR * 0.30, Math.PI * 1.08, Math.PI * 1.85);
      ctx.stroke();
      ctx.restore();

      // Beacon light at top
      ctx.fillStyle = "rgba(255,215,50,0.92)";
      ctx.beginPath(); ctx.arc(swx, baseY - dR, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,235,120,0.45)";
      ctx.beginPath(); ctx.arc(swx, baseY - dR, 9, 0, Math.PI * 2); ctx.fill();

      // Reflection pool / water around base
      ctx.fillStyle = "rgba(80,140,180,0.22)";
      ctx.beginPath();
      ctx.ellipse(swx, baseY + 4, 90, 12, 0, 0, Math.PI * 2);
      ctx.fill();

      // Label
      ctx.fillStyle = "rgba(200,230,255,0.82)";
      ctx.font = "bold 10px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("SCIENCE WORLD", swx, baseY - dR - 12);
    }
  }

  // === Vancouver Art Gallery (wx 900) — neoclassical stone building ===
  {
    const { x: vagx } = toS(900, 0);
    if (vagx > -100 && vagx < CW + 100) {
      const BY = horizY + 8;
      // Stone base steps (3 levels)
      ctx.fillStyle = "#8a7e6c"; ctx.fillRect(vagx - 64, BY - 8,  128, 8);
      ctx.fillStyle = "#7e7260"; ctx.fillRect(vagx - 58, BY - 14, 116, 6);
      ctx.fillStyle = "#726658"; ctx.fillRect(vagx - 52, BY - 20, 104, 6);
      // Main facade body
      const fg = ctx.createLinearGradient(vagx - 50, 0, vagx + 50, 0);
      fg.addColorStop(0, "#686054"); fg.addColorStop(0.5, "#7a7268"); fg.addColorStop(1, "#646058");
      ctx.fillStyle = fg;
      ctx.fillRect(vagx - 50, BY - 60, 100, 40);
      // Cornice
      ctx.fillStyle = "#908878"; ctx.fillRect(vagx - 54, BY - 62, 108, 4);
      // Classical columns (8 pillars)
      for (let ci = 0; ci < 8; ci++) {
        const colX = vagx - 44 + ci * 12.5;
        const colG = ctx.createLinearGradient(colX - 3.5, 0, colX + 3.5, 0);
        colG.addColorStop(0, "#888070"); colG.addColorStop(0.45, "#a09888"); colG.addColorStop(1, "#888070");
        ctx.fillStyle = colG; ctx.fillRect(colX - 3.5, BY - 62, 7, 42);
        ctx.fillStyle = "rgba(255,245,225,0.18)"; ctx.fillRect(colX - 3.5, BY - 62, 2.5, 42);
      }
      // Attic / frieze
      ctx.fillStyle = "#7a7068"; ctx.fillRect(vagx - 54, BY - 86, 108, 24);
      ctx.fillStyle = "rgba(255,235,190,0.10)";
      for (let pi = 0; pi < 7; pi++) ctx.fillRect(vagx - 46 + pi * 14, BY - 83, 8, 18);
      // Triangular pediment
      ctx.fillStyle = "#8c8278";
      ctx.beginPath(); ctx.moveTo(vagx - 56, BY - 86); ctx.lineTo(vagx, BY - 120); ctx.lineTo(vagx + 56, BY - 86); ctx.closePath(); ctx.fill();
      // Pediment highlight
      ctx.fillStyle = "rgba(255,248,228,0.16)";
      ctx.beginPath(); ctx.moveTo(vagx - 56, BY - 86); ctx.lineTo(vagx, BY - 120); ctx.lineTo(vagx - 2, BY - 86); ctx.closePath(); ctx.fill();
      // Pediment shadow
      ctx.fillStyle = "rgba(0,0,0,0.09)";
      ctx.beginPath(); ctx.moveTo(vagx + 56, BY - 86); ctx.lineTo(vagx, BY - 120); ctx.lineTo(vagx + 2, BY - 86); ctx.closePath(); ctx.fill();
      // Arched windows on facade
      for (let wi = 0; wi < 5; wi++) {
        const wx2 = vagx - 36 + wi * 18;
        ctx.fillStyle = "rgba(155,205,240,0.38)";
        ctx.fillRect(wx2 - 4, BY - 57, 8, 16);
        ctx.beginPath(); ctx.arc(wx2, BY - 57, 4, Math.PI, 0); ctx.fill();
      }
      // Label
      ctx.fillStyle = "rgba(230,222,202,0.82)";
      ctx.font = "bold 7px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("VANCOUVER ART GALLERY", vagx, BY - 126);
    }
  }

  // Cherry blossom trees — multi-puff crowns with petal scatter
  // (removed positions near landmark clear zones: 720→SC, 846→VAG, 1102→CP, 1608→BCP)
  [782, 1164, 1312, 1398, 1452, 2820, 2878, 3520].forEach((twx) => {
    const { x: tx } = toS(twx, 0);
    if (tx < -28 || tx > CW + 28) return;
    const sz = 9 + Math.abs(Math.sin(twx * 0.017)) * 7;
    const BY = horizY + 8;
    // Trunk (tapered)
    ctx.fillStyle = "#2e1a0c";
    ctx.fillRect(tx - 1.5, BY - sz * 1.6, 3, sz * 1.6);
    ctx.fillStyle = "rgba(80,44,18,0.4)";
    ctx.fillRect(tx, BY - sz * 1.6, 1.5, sz * 1.5);
    // Back puff
    const pg0 = ctx.createRadialGradient(tx, BY - sz * 1.6, 0, tx, BY - sz * 1.6, sz * 1.3);
    pg0.addColorStop(0, "rgba(240,138,162,0.60)"); pg0.addColorStop(1, "rgba(230,120,148,0)");
    ctx.fillStyle = pg0; ctx.beginPath(); ctx.arc(tx, BY - sz * 1.6, sz * 1.3, 0, Math.PI * 2); ctx.fill();
    // Left sub-puff
    const pg1 = ctx.createRadialGradient(tx - sz * 0.4, BY - sz * 1.5, 0, tx - sz * 0.4, BY - sz * 1.5, sz * 0.9);
    pg1.addColorStop(0, "rgba(255,170,188,0.82)"); pg1.addColorStop(1, "rgba(250,152,172,0)");
    ctx.fillStyle = pg1; ctx.beginPath(); ctx.arc(tx - sz * 0.4, BY - sz * 1.5, sz * 0.9, 0, Math.PI * 2); ctx.fill();
    // Right sub-puff
    const pg2 = ctx.createRadialGradient(tx + sz * 0.38, BY - sz * 1.52, 0, tx + sz * 0.38, BY - sz * 1.52, sz * 0.85);
    pg2.addColorStop(0, "rgba(255,175,195,0.78)"); pg2.addColorStop(1, "rgba(248,155,178,0)");
    ctx.fillStyle = pg2; ctx.beginPath(); ctx.arc(tx + sz * 0.38, BY - sz * 1.52, sz * 0.85, 0, Math.PI * 2); ctx.fill();
    // Main crown
    const pg3 = ctx.createRadialGradient(tx, BY - sz * 1.55, sz * 0.08, tx, BY - sz * 1.55, sz);
    pg3.addColorStop(0, "rgba(255,198,212,0.96)"); pg3.addColorStop(0.6, "rgba(252,172,190,0.72)"); pg3.addColorStop(1, "rgba(245,145,168,0)");
    ctx.fillStyle = pg3; ctx.beginPath(); ctx.arc(tx, BY - sz * 1.55, sz, 0, Math.PI * 2); ctx.fill();
    // Highlight puff
    const pg4 = ctx.createRadialGradient(tx - sz * 0.22, BY - sz * 1.9, 0, tx - sz * 0.22, BY - sz * 1.9, sz * 0.5);
    pg4.addColorStop(0, "rgba(255,228,236,0.80)"); pg4.addColorStop(1, "rgba(255,220,230,0)");
    ctx.fillStyle = pg4; ctx.beginPath(); ctx.arc(tx - sz * 0.22, BY - sz * 1.9, sz * 0.5, 0, Math.PI * 2); ctx.fill();
    // Scattered petals
    for (let pi = 0; pi < 5; pi++) {
      const pAngle = ((twx * 7 + pi * 61) % 360) * Math.PI / 180;
      const pPhase = (ls.time * 0.5 + pi * 0.4) % 1;
      const px2 = tx + Math.cos(pAngle) * sz * (0.4 + pPhase * 1.2);
      const py2 = BY - sz * 1.6 + pPhase * sz * 1.4;
      ctx.fillStyle = `rgba(255,195,210,${(1 - pPhase) * 0.65})`;
      ctx.beginPath(); ctx.ellipse(px2, py2, 2.2, 1.2, pAngle, 0, Math.PI * 2); ctx.fill();
    }
  });


  // Shore / coastal ground strip — undulating seawall (not perfectly flat)
  {
    const shoreGrad = ctx.createLinearGradient(0, horizY - 12, 0, horizY + 4);
    shoreGrad.addColorStop(0,    "rgba(42,58,36,0.94)");
    shoreGrad.addColorStop(0.55, "#3c4832");
    shoreGrad.addColorStop(1,    "#505450");
    // Draw shore as a polygon with a wavy top edge
    ctx.fillStyle = shoreGrad;
    ctx.beginPath();
    ctx.moveTo(0, horizY + 4);
    for (let sx = 0; sx <= CW; sx += 8) {
      const camOff = ls.cam.x * 0.007;
      const bump = Math.sin(sx * 0.055 + camOff) * 2.2 + Math.sin(sx * 0.018 + camOff * 0.4) * 3.0;
      ctx.lineTo(sx, horizY - 8 - bump);
    }
    ctx.lineTo(CW, horizY + 4);
    ctx.closePath();
    ctx.fill();
    // Seawall cap strip
    ctx.strokeStyle = "#606258"; ctx.lineWidth = 1.8; ctx.lineCap = "round";
    ctx.beginPath();
    for (let sx = 0; sx <= CW; sx += 8) {
      const camOff = ls.cam.x * 0.007;
      const bump = Math.sin(sx * 0.055 + camOff) * 2.2 + Math.sin(sx * 0.018 + camOff * 0.4) * 3.0;
      sx === 0 ? ctx.moveTo(sx, horizY - 8 - bump) : ctx.lineTo(sx, horizY - 8 - bump);
    }
    ctx.stroke();
    // Riprap boulders at waterline
    for (let rx = 0; rx < CW; rx += 18) {
      const camOff = ls.cam.x * 0.008;
      const rOff = Math.sin(rx * 0.43 + camOff) * 2.0;
      const rw = 10 + Math.abs(Math.sin(rx * 0.27)) * 8;
      ctx.fillStyle = `rgba(18,22,16,${0.18 + Math.abs(Math.sin(rx * 0.33)) * 0.18})`;
      ctx.beginPath();
      ctx.ellipse(rx + 6, horizY + rOff + 1, rw * 0.5, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Grass tufts on upper shore
    for (let gx = 0; gx < CW; gx += 16) {
      const camOff = ls.cam.x * 0.007;
      const bump = Math.sin(gx * 0.055 + camOff) * 2.2 + Math.sin(gx * 0.018 + camOff * 0.4) * 3.0;
      const gh = 2 + Math.abs(Math.sin(gx * 0.37 + ls.cam.x * 0.006)) * 2.5;
      ctx.fillStyle = `rgba(56,80,44,${0.45 + Math.sin(gx * 0.21) * 0.12})`;
      ctx.fillRect(gx + 2, horizY - 8 - bump + 1, 6, gh);
    }
  }

  // ── Waterfront Promenade (drawn after shore strip so elements sit ON the ground) ──
  {
    const GND = horizY - 10;

    // Clear zones around landmark buildings — no promenade elements within these ranges
    const isInClearZone = (wx: number) =>
      ([[680, 58], [900, 72], [1055, 92], [1240, 62], [1680, 98], [2280, 96]] as [number, number][])
        .some(([cx, r]) => Math.abs(wx - cx) < r);

    // ── Evergreen conifers (improved rendering: 4 tiers, highlight/shadow, no stroke) ──
    const TREE_BY = horizY + 8;
    [555, 600, 745, 800, 960, 1185, 1332, 1375, 1478, 1538,
     1750, 1796, 1846, 1895, 1960, 2040, 2120, 2200,
     2430, 2530, 2640, 2740, 2845, 2910, 3030, 3120, 3220, 3360, 3470, 3590].forEach((ewx) => {
      if (isInClearZone(ewx)) return;
      const { x: ex } = toS(ewx, 0);
      if (ex < -24 || ex > CW + 24) return;
      const sz = 22 + (ewx % 7) * 2.2; // 22–37px height
      // Trunk
      ctx.fillStyle = "#241408";
      ctx.fillRect(ex - 1.5, TREE_BY - sz, 3, sz);
      // 4 conifer canopy tiers (bottom to top) — each tier is a triangle
      const tiers: [number, number, string, string, string][] = [
        [sz * 0.92, sz * 0.90, "#153818", "#1d4c20", "rgba(0,0,0,0.09)"],
        [sz * 0.66, sz * 0.68, "#184020", "#204c28", "rgba(0,0,0,0.07)"],
        [sz * 0.40, sz * 0.46, "#1a4824", "#245830", "rgba(0,0,0,0.06)"],
        [sz * 0.14, sz * 0.24, "#1c5028", "#2a6034", "rgba(0,0,0,0.04)"],
      ];
      tiers.forEach(([yOff, hw, darkCol, lightCol, shadowCol]) => {
        const apexY = TREE_BY - sz * 1.12 - yOff * 0.05;
        const baseY = TREE_BY - yOff;
        // Main dark face
        ctx.fillStyle = darkCol;
        ctx.beginPath(); ctx.moveTo(ex, apexY); ctx.lineTo(ex + hw, baseY); ctx.lineTo(ex - hw, baseY); ctx.closePath(); ctx.fill();
        // Left-side highlight
        ctx.fillStyle = lightCol;
        ctx.beginPath(); ctx.moveTo(ex, apexY); ctx.lineTo(ex - hw, baseY); ctx.lineTo(ex - hw * 0.1, baseY); ctx.closePath(); ctx.fill();
        // Right-side shadow
        ctx.fillStyle = shadowCol;
        ctx.beginPath(); ctx.moveTo(ex, apexY); ctx.lineTo(ex + hw, baseY); ctx.lineTo(ex + hw * 0.1, baseY); ctx.closePath(); ctx.fill();
      });
      // Snow tip on some trees
      if (ewx % 6 === 0) {
        ctx.fillStyle = "rgba(240,248,255,0.32)";
        ctx.beginPath(); ctx.arc(ex, TREE_BY - sz * 1.16, sz * 0.11, 0, Math.PI * 2); ctx.fill();
      }
    });

    // ── Flag poles with animated waving flags ─────────────────────────────────
    const FLAG_COLORS = [
      ["#cc2020", "#ee3030"],  // red
      ["#2060cc", "#3070ee"],  // blue
      ["#22aa44", "#30cc55"],  // green
      ["#cc8820", "#eea030"],  // amber
      ["#aa22cc", "#cc30ee"],  // purple
      ["#cc2080", "#ee3090"],  // pink
    ];
    // Removed 680 (Steam Clock), 1000/1120 (Canada Place), 1760 (BC Place) clear zones
    [540, 1360, 1440, 1550, 1880, 1990, 2100, 2420, 2540,
     2680, 2820, 3060, 3180, 3360, 3540, 3680].forEach((fwx, fi) => {
      if (isInClearZone(fwx)) return;
      const { x: fx } = toS(fwx, 0);
      if (fx < -14 || fx > CW + 14) return;
      const fh = 52 + (fwx % 5) * 4; // pole height 52–68px
      // Pole
      ctx.fillStyle = "#888070";
      ctx.fillRect(fx - 1, GND - fh, 2, fh);
      // Animated waving flag
      const [c1, c2] = FLAG_COLORS[fi % FLAG_COLORS.length];
      const wave = Math.sin(ls.time * 2.8 + fwx * 0.03) * 3;
      const wave2 = Math.sin(ls.time * 2.8 + fwx * 0.03 + 1.2) * 2;
      const fw = 18, fhh = 10;
      const fy0 = GND - fh;
      ctx.fillStyle = c1;
      ctx.beginPath();
      ctx.moveTo(fx + 1, fy0);
      ctx.lineTo(fx + fw * 0.5 + wave, fy0 + fhh * 0.5 + wave2);
      ctx.lineTo(fx + fw + wave, fy0 + fhh + wave);
      ctx.lineTo(fx + 1, fy0 + fhh);
      ctx.closePath();
      ctx.fill();
      // Flag highlight stripe
      ctx.fillStyle = c2;
      ctx.beginPath();
      ctx.moveTo(fx + 1, fy0);
      ctx.lineTo(fx + fw * 0.5 + wave, fy0 + 3 + wave2 * 0.3);
      ctx.lineTo(fx + 1, fy0 + 3);
      ctx.closePath();
      ctx.fill();
      // Pole cap
      ctx.fillStyle = "#c8b870";
      ctx.beginPath(); ctx.arc(fx, GND - fh - 2, 2.5, 0, Math.PI * 2); ctx.fill();
    });

    // ── Lamp posts ────────────────────────────────────────────────────────────
    // Removed positions inside landmark clear zones (898-980→VAG, 1070-1160→CP, 1250→HC, 1742→BCP)
    [520, 605, 1345, 1440, 1534, 1840,
     1938, 2038, 2140, 2358, 2452, 2554, 2658, 2758, 2908, 3040, 3140, 3250, 3490, 3592].forEach((lwx) => {
      if (isInClearZone(lwx)) return;
      const { x: lx } = toS(lwx, 0);
      if (lx < -14 || lx > CW + 14) return;
      const postH = 44;
      const postG = ctx.createLinearGradient(lx - 2, 0, lx + 2, 0);
      postG.addColorStop(0, "#48402e"); postG.addColorStop(0.5, "#7a6a50"); postG.addColorStop(1, "#48402e");
      ctx.fillStyle = postG;
      ctx.fillRect(lx - 1.5, GND - postH, 3, postH);
      ctx.strokeStyle = "#6a5e44"; ctx.lineWidth = 1.5; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(lx, GND - postH + 2); ctx.quadraticCurveTo(lx + 5, GND - postH - 8, lx + 10, GND - postH - 10); ctx.stroke();
      ctx.fillStyle = "#c4a030";
      ctx.fillRect(lx + 7, GND - postH - 14, 7, 8);
      ctx.fillStyle = "rgba(255,242,165,0.92)";
      ctx.fillRect(lx + 8, GND - postH - 13, 5, 5);
      const glow = ctx.createRadialGradient(lx + 10, GND - postH - 10, 0, lx + 10, GND - postH - 10, 18);
      glow.addColorStop(0, "rgba(255,220,100,0.30)"); glow.addColorStop(1, "rgba(255,220,100,0)");
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(lx + 10, GND - postH - 10, 18, 0, Math.PI * 2); ctx.fill();
    });

    // ── Benches ───────────────────────────────────────────────────────────────
    [575, 1180, 1380, 1468, 1795, 1895, 2058, 2158,
     2368, 2480, 2580, 2682, 2780, 2920, 3055, 3160, 3262, 3400, 3508].forEach((bwx) => {
      if (isInClearZone(bwx)) return;
      const { x: bx } = toS(bwx, 0);
      if (bx < -24 || bx > CW + 24) return;
      const bh = GND; // bench sits on ground
      ctx.fillStyle = "#4a3c28";
      ctx.fillRect(bx - 11, bh - 9, 2.5, 9);
      ctx.fillRect(bx + 8.5, bh - 9, 2.5, 9);
      ctx.fillStyle = "#7a6040";
      ctx.fillRect(bx - 12, bh - 11, 24, 3);
      ctx.fillStyle = "#8a7050";
      ctx.fillRect(bx - 12, bh - 12, 24, 1.5);
      ctx.fillStyle = "#5a4830";
      ctx.fillRect(bx - 11, bh - 22, 2.5, 12);
      ctx.fillRect(bx + 8.5, bh - 22, 2.5, 12);
      ctx.fillStyle = "#6a5838";
      ctx.fillRect(bx - 12, bh - 24, 24, 3);
    });

    // ── Food carts / vendors with umbrellas ───────────────────────────────────
    const UMBRELLA_COLS = ["#cc3020", "#2060aa", "#228844", "#aa6020", "#8822aa"];
    [618, 1148, 1428, 1912, 2178, 2500, 2760, 3090, 3440].forEach((vwx, vi) => {
      if (isInClearZone(vwx)) return;
      const { x: vx } = toS(vwx, 0);
      if (vx < -40 || vx > CW + 40) return;
      const ucol = UMBRELLA_COLS[vi % UMBRELLA_COLS.length];
      // Cart body
      ctx.fillStyle = "#4a4030";
      ctx.fillRect(vx - 14, GND - 22, 28, 22);
      ctx.fillStyle = "rgba(200,220,255,0.20)";
      ctx.fillRect(vx - 12, GND - 20, 24, 14);
      // Wheels
      ctx.strokeStyle = "#2a2018"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(vx - 9, GND, 5, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(vx + 9, GND, 5, 0, Math.PI * 2); ctx.stroke();
      // Umbrella pole
      ctx.fillStyle = "#888070";
      ctx.fillRect(vx - 1, GND - 56, 2, 34);
      // Umbrella canopy
      const uR = 20;
      const ug = ctx.createRadialGradient(vx, GND - 56, 0, vx, GND - 56, uR);
      ug.addColorStop(0, ucol + "ee"); ug.addColorStop(1, ucol + "88");
      ctx.fillStyle = ug;
      ctx.beginPath();
      ctx.moveTo(vx - uR, GND - 52);
      ctx.quadraticCurveTo(vx, GND - 66, vx + uR, GND - 52);
      ctx.closePath();
      ctx.fill();
      // Umbrella ribs
      ctx.strokeStyle = "rgba(255,255,255,0.20)"; ctx.lineWidth = 0.8;
      for (let ri = -2; ri <= 2; ri++) {
        ctx.beginPath();
        ctx.moveTo(vx, GND - 56);
        ctx.lineTo(vx + ri * uR / 2.2, GND - 52);
        ctx.stroke();
      }
    });

    // ── Flower patches ────────────────────────────────────────────────────────
    ([
      [568,  ["#ff6060", "#ff9090", "#ffc0c0"]],
      [706,  ["#ffe040", "#ffcc20", "#ffb010"]],
      [808,  ["#60c8ff", "#40a8ff", "#20a0f0"]],
      [1075, ["#b860ff", "#9040ee", "#c880ff"]],
      [1175, ["#ff6080", "#ff8098", "#ffa0b0"]],
      [1365, ["#60ff80", "#40e860", "#30d050"]],
      [1695, ["#ffa040", "#ff9020", "#ff8010"]],
      [1858, ["#80b0ff", "#6098ff", "#4888ff"]],
      [2055, ["#ff90b8", "#ff70a0", "#ff5090"]],
      [2355, ["#a8ff60", "#90ee40", "#78dd28"]],
      [2558, ["#ffcc60", "#ffbb40", "#ffaa20"]],
      [2755, ["#60ffb8", "#40ee98", "#20dd80"]],
      [2960, ["#ff8080", "#ff6060", "#ff4040"]],
      [3162, ["#b0b0ff", "#9090ff", "#7878ee"]],
      [3382, ["#60e8c8", "#40d8b0", "#20c898"]],
    ] as [number, string[]][]).forEach(([gwx, colors]) => {
      if (isInClearZone(gwx)) return;
      const { x: gx } = toS(gwx, 0);
      if (gx < -32 || gx > CW + 32) return;
      // Flower dots (positioned higher up, at GND)
      for (let fi = 0; fi < 16; fi++) {
        const fx2 = gx + (((gwx * 7 + fi * 13) % 34) - 17);
        const fy2 = GND - 2 - ((gwx * 3 + fi * 5) % 8);
        ctx.fillStyle = colors[(fi * 3 + gwx) % colors.length];
        ctx.beginPath();
        ctx.arc(fx2, fy2, 2.0 + (fi % 3) * 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
      // Green stems
      ctx.strokeStyle = "rgba(30,100,30,0.50)";
      ctx.lineWidth = 0.8;
      for (let si = 0; si < 10; si++) {
        const stx = gx + (si * 3.5 - 17);
        ctx.beginPath(); ctx.moveTo(stx, GND); ctx.lineTo(stx + 1, GND - 6 - (si % 4)); ctx.stroke();
      }
    });

    // ── Small waterfront shops & cafes ────────────────────────────────────────
    const SHOP_LABELS = ["CAFÉ", "SHOP", "GIFT", "INFO", "BAR", "DELI", "ART", "FISH"];
    // Removed shops at 1125 (Canada Place), 1214 (Harbour Centre), 1760 (BC Place) clear zones
    ([
      [512,  42, 34, "#2a3848", "#8a3020"],
      [562,  38, 30, "#38302a", "#2a6838"],
      [1854, 38, 30, "#2a2c3a", "#245868"],
      [1952, 46, 36, "#303840", "#504820"],
      [2050, 42, 32, "#283038", "#206040"],
      [2145, 44, 36, "#2a3030", "#602020"],
      [2360, 46, 34, "#303028", "#205060"],
      [2458, 40, 32, "#283840", "#703820"],
      [2558, 44, 30, "#2c3038", "#284870"],
      [2660, 42, 34, "#2a3040", "#6a2830"],
      [2760, 46, 32, "#303838", "#285040"],
      [2930, 44, 36, "#2c3028", "#5a3818"],
      [3050, 40, 30, "#283848", "#1e4860"],
      [3150, 46, 36, "#30302a", "#483018"],
      [3255, 42, 32, "#2a3840", "#204838"],
      [3405, 44, 34, "#2c2a38", "#602840"],
      [3508, 40, 30, "#283038", "#6a4020"],
    ] as [number, number, number, string, string][]).forEach(([swx, sw, sh, col, awCol], idx) => {
      if (isInClearZone(swx)) return;
      const { x: sx } = toS(swx, 0);
      if (sx < -60 || sx > CW + 60) return;
      ctx.fillStyle = col;
      ctx.fillRect(sx - sw / 2, GND - sh, sw, sh);
      // Window pane
      ctx.fillStyle = "rgba(180,225,255,0.32)";
      ctx.fillRect(sx - sw / 2 + 4, GND - sh + 5, sw - 8, sh - 18);
      ctx.strokeStyle = "rgba(200,235,255,0.18)"; ctx.lineWidth = 1;
      ctx.strokeRect(sx - sw / 2 + 4.5, GND - sh + 5.5, sw - 9, sh - 19);
      // Awning
      ctx.fillStyle = awCol;
      ctx.fillRect(sx - sw / 2 - 3, GND - sh - 6, sw + 6, 7);
      for (let si = 0; si < 5; si++) {
        ctx.fillStyle = "rgba(255,255,255,0.10)";
        ctx.fillRect(sx - sw / 2 - 3 + si * (sw + 6) / 5, GND - sh - 6, (sw + 6) / 10, 7);
      }
      // Door
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(sx - 4, GND - 13, 8, 13);
      // Sign
      ctx.fillStyle = "rgba(255,230,140,0.82)";
      ctx.font = "bold 6px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(SHOP_LABELS[idx % SHOP_LABELS.length], sx, GND - sh + 5);
    });

    // ── Animated cyclists ─────────────────────────────────────────────────────
    ([
      [1450, 55, 0.4, "#5080c0"],
      [2200, -42, 1.8, "#a05030"],
      [3100, 48, 3.0, "#308860"],
    ] as [number, number, number, string][]).forEach(([baseX, spd, phase, col]) => {
      const cx2 = ((baseX + ls.time * spd + 20000) % 4200);
      const { x: ex } = toS(cx2, 0);
      if (ex < -20 || ex > CW + 20) return;
      const wheelR = 6;
      const spin = ls.time * spd * 0.5 + phase;
      // Wheels
      ctx.strokeStyle = col; ctx.lineWidth = 1.8; ctx.lineCap = "butt";
      ctx.beginPath(); ctx.arc(ex - 10, GND - wheelR, wheelR, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(ex + 10, GND - wheelR, wheelR, 0, Math.PI * 2); ctx.stroke();
      // Spokes
      ctx.lineWidth = 0.8;
      for (let s = 0; s < 3; s++) {
        const sa = spin + s * Math.PI / 1.5;
        ctx.beginPath();
        ctx.moveTo(ex - 10, GND - wheelR);
        ctx.lineTo(ex - 10 + Math.cos(sa) * wheelR, GND - wheelR + Math.sin(sa) * wheelR);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(ex + 10, GND - wheelR);
        ctx.lineTo(ex + 10 + Math.cos(sa + 0.5) * wheelR, GND - wheelR + Math.sin(sa + 0.5) * wheelR);
        ctx.stroke();
      }
      // Frame
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = col;
      ctx.beginPath(); ctx.moveTo(ex - 10, GND - wheelR); ctx.lineTo(ex, GND - wheelR * 2); ctx.lineTo(ex + 10, GND - wheelR); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ex, GND - wheelR * 2); ctx.lineTo(ex - 3, GND - wheelR * 3.2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ex, GND - wheelR * 2); ctx.lineTo(ex + 9, GND - wheelR * 2.5); ctx.stroke();
      // Rider
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(ex - 3, GND - wheelR * 3.8, 4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(ex - 3, GND - wheelR * 3.4); ctx.lineTo(ex + 7, GND - wheelR * 2.5); ctx.stroke();
    });

    // ── Animated pedestrians ──────────────────────────────────────────────────
    ([
      [870,   32, 0.0, "#9a7858"],
      [1280, -24, 1.3, "#607888"],
      [1830,  38, 0.7, "#a07868"],
      [2080, -20, 2.2, "#508080"],
      [2540,  28, 1.8, "#887050"],
      [2985, -33, 0.5, "#708870"],
      [3340,  22, 3.1, "#907860"],
    ] as [number, number, number, string][]).forEach(([baseX, spd, phase, col]) => {
      const wx = ((baseX + ls.time * spd + 20000) % 4200);
      const { x: px } = toS(wx, 0);
      if (px < -10 || px > CW + 10) return;
      const swing = Math.sin(ls.time * 4.8 + phase);
      ctx.fillStyle = col;
      // Body + head
      ctx.beginPath(); ctx.arc(px, GND - 22, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(px - 2.5, GND - 19, 5, 10);
      // Arms & legs
      ctx.strokeStyle = col; ctx.lineWidth = 2.0; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(px - 2, GND - 16); ctx.lineTo(px - 5 + swing * 1.8, GND - 11); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px + 2, GND - 16); ctx.lineTo(px + 5 - swing * 1.8, GND - 11); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px, GND - 9); ctx.lineTo(px - 2.5 + swing * 2.8, GND); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px, GND - 9); ctx.lineTo(px + 2.5 - swing * 2.8, GND); ctx.stroke();
    });
  }

  // Water
  const wg = ctx.createLinearGradient(0, horizY, 0, CH);
  wg.addColorStop(0, w.water[0]);
  wg.addColorStop(1, w.water[1]);
  ctx.fillStyle = wg;
  ctx.fillRect(0, horizY, CW, CH - horizY);

  // ── Enhanced ocean waves (world-anchored, multi-layer) ──────────────
  {
    const wv = w.waves;
    const camOff = ls.cam.x * 0.09;

    // Layer 1: Long ocean swells — world-Y bands, perspective-scaled
    for (let band = 0; band < 24; band++) {
      const worldY = 430 + band * 30;
      const sy = worldY - ls.cam.y + CH / 2;
      if (sy < horizY + 3 || sy > CH + 4) continue;
      const perspT = Math.min(1, (sy - horizY) / (CH - horizY));
      const amp = (0.8 + perspT * 2.8) * wv;
      const yBob = Math.sin(ls.time * 0.52 + band * 1.15) * amp;
      const alpha = (0.022 + perspT * 0.068) * wv;
      const waveLen = Math.max(28, 100 - perspT * 60);
      ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
      ctx.lineWidth = 0.5 + perspT * 0.9;
      const phaseOff = camOff + band * 61;
      for (let wx0 = -(phaseOff % waveLen) - waveLen; wx0 < CW + waveLen; wx0 += waveLen * 1.55) {
        const midY = sy + yBob;
        ctx.beginPath();
        ctx.moveTo(wx0, midY);
        ctx.bezierCurveTo(
          wx0 + waveLen * 0.28, midY - amp * 0.85,
          wx0 + waveLen * 0.72, midY - amp * 0.85,
          wx0 + waveLen, midY,
        );
        ctx.stroke();
      }
    }

    // Layer 2: Whitecap foam dots at wave crests
    if (wv > 0.25) {
      for (let i = 0; i < 40; i++) {
        const worldY = 450 + (i * 79 % 500);
        const sy = worldY - ls.cam.y + CH / 2;
        if (sy < horizY + 6 || sy > CH - 3) continue;
        const perspT = Math.min(1, (sy - horizY) / (CH - horizY));
        const sx = ((i * 137 + camOff * 0.55 + ls.time * 20 * (0.5 + (i % 3) * 0.28)) % (CW + 40)) - 20;
        if (sx < -8 || sx > CW + 8) continue;
        const dotAlpha = (0.06 + perspT * 0.13) * wv;
        const dotR = 0.9 + perspT * 2.0;
        ctx.fillStyle = `rgba(255,255,255,${dotAlpha})`;
        ctx.beginPath();
        ctx.arc(sx, sy + Math.sin(ls.time * 1.4 + i) * 1.4, dotR, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ── Rocks / reefs in the water (world-anchored, from WATER_ROCKS) ────
  WATER_ROCKS.forEach(([rwx, rwy, avoidR]) => {
    const rw = avoidR * 0.88;   // visual half-width (larger than before)
    const rh = avoidR * 0.42;   // visual half-height
    const { x: rx, y: ry } = toS(rwx, rwy);
    if (rx < -rw - 10 || rx > CW + rw + 10 || ry < horizY || ry > CH + 10) return;
    // Shadow beneath rock
    ctx.fillStyle = "rgba(0,0,0,0.20)";
    ctx.beginPath();
    ctx.ellipse(rx + 3, ry + rh * 0.4, rw * 0.90, rh * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    // Main rock body (dark with slight color variation)
    const seed = Math.sin(rwx * 0.017 + rwy * 0.011);
    ctx.fillStyle = `rgba(${30 + seed * 8 | 0},${36 + seed * 6 | 0},${28 + seed * 5 | 0},0.92)`;
    ctx.beginPath();
    ctx.ellipse(rx, ry, rw, rh, seed * 0.3, 0, Math.PI * 2);
    ctx.fill();
    // Mid-tone layer for texture
    ctx.fillStyle = "rgba(52,62,46,0.65)";
    ctx.beginPath();
    ctx.ellipse(rx - rw * 0.10, ry - rh * 0.15, rw * 0.68, rh * 0.60, seed * 0.2, 0, Math.PI * 2);
    ctx.fill();
    // Bright highlight upper-left (wetted rock face catching light)
    ctx.fillStyle = "rgba(90,105,78,0.60)";
    ctx.beginPath();
    ctx.ellipse(rx - rw * 0.24, ry - rh * 0.35, rw * 0.38, rh * 0.28, -0.5, 0, Math.PI * 2);
    ctx.fill();
    // Animated foam/surge ring
    const foamA = 0.28 + Math.sin(ls.time * 1.9 + rwx * 0.005) * 0.14;
    ctx.strokeStyle = `rgba(210,228,220,${foamA})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(rx, ry + rh * 0.10, rw + 6, rh * 0.62, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Second outer foam ripple
    ctx.strokeStyle = `rgba(200,220,215,${foamA * 0.45})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(rx, ry + rh * 0.15, rw + 14, rh * 0.78, 0, 0, Math.PI * 2);
    ctx.stroke();
  });

  // Zone bands (no separate “docking zone” strip — two docks are landmarks below)
  [
    { wx: 0, w: 4500, col: "rgba(50,200,90,0.07)", brd: "rgba(50,200,90,0.35)", lbl: "OPEN WATER" },
    { wx: 4500, w: 3700, col: "rgba(60,160,220,0.06)", brd: "rgba(60,160,220,0.32)", lbl: "SEA LANES" },
    { wx: 8200, w: 3800, col: "rgba(120,200,255,0.05)", brd: "rgba(120,200,255,0.28)", lbl: "PORT APPROACH" },
  ].forEach((z) => {
    const { x: zx } = toS(z.wx, horizY);
    const { x: zx2 } = toS(z.wx + z.w, horizY);
    if (zx2 < 0 || zx > CW) return;
    ctx.fillStyle = z.col;
    ctx.fillRect(zx, horizY, zx2 - zx, CH - horizY);
    ctx.strokeStyle = z.brd;
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(zx, horizY);
    ctx.lineTo(zx, CH);
    ctx.stroke();
    ctx.setLineDash([]);
    if (zx > -50 && zx < CW - 10) {
      ctx.fillStyle = z.brd;
      ctx.font = "9px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(z.lbl, Math.max(4, zx + 5), horizY + 15);
    }
  });

  // Clip dock and port structures to the water area (below horizon) so cranes/structures
  // don't bleed into the sky when the dock is near the top of the viewport.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, horizY, CW, CH - horizY);
  ctx.clip();

  const wy = DOCK_WATERLINE_Y;
  const pierH = 24;
  const w2 = 190;
  const w1 = 280;
  const gap = 20;
  const drawDock = (centerX: number, dockName: string, isTarget: boolean) => {
    const total = w1 + gap + w2;
    const x1 = centerX - total / 2;
    const x2 = x1 + w1 + gap;
    const ax1  = toS(x1,      0).x;
    const ax1r = toS(x1 + w1, 0).x;
    const ax2  = toS(x2,      0).x;
    const ax2r = toS(x2 + w2, 0).x;
    if (ax2r < -120 || ax1 > CW + 120) return;

    const BY     = horizY;
    const PH     = pierH;
    const PILE_H = 22;
    const BERTH_D= 44;
    const accentA = isTarget ? "rgba(240,195,60,0.7)" : "rgba(180,150,80,0.45)";

    // ── Pier base (both sections) ────────────────────────────────────
    const drawPierBase = (sx: number, sw: number) => {
      if (sx + sw < -80 || sx > CW + 80 || sw < 1) return;
      const pw = sw;
      // Platform gradient
      const g = ctx.createLinearGradient(sx, BY, sx, BY + PH);
      g.addColorStop(0,    isTarget ? "#a08060" : "#6a5040");
      g.addColorStop(0.4,  isTarget ? "#80684a" : "#503c28");
      g.addColorStop(0.85, isTarget ? "#604830" : "#3c2818");
      g.addColorStop(1,    "#201208");
      ctx.fillStyle = g;
      ctx.fillRect(sx, BY, pw, PH);

      // Shore highlight
      ctx.fillStyle = isTarget ? "rgba(240,200,90,0.45)" : "rgba(200,170,110,0.28)";
      ctx.fillRect(sx, BY, pw, 2);

      // Plank seams
      ctx.strokeStyle = "rgba(0,0,0,0.15)";
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      for (let lx = sx + 12; lx < sx + pw; lx += 12) {
        ctx.beginPath(); ctx.moveTo(lx, BY + 2); ctx.lineTo(lx, BY + PH - 3); ctx.stroke();
      }

      // Two crane rail tracks along pier length
      ctx.strokeStyle = isTarget ? "rgba(200,165,65,0.45)" : "rgba(130,115,80,0.45)";
      ctx.lineWidth = 2;
      [BY + 7, BY + PH - 8].forEach(ty => {
        ctx.beginPath(); ctx.moveTo(sx, ty); ctx.lineTo(sx + pw, ty); ctx.stroke();
        // Rail tie marks
        ctx.strokeStyle = "rgba(0,0,0,0.18)";
        ctx.lineWidth = 0.5;
        for (let rx = sx + 8; rx < sx + pw; rx += 10) {
          ctx.beginPath(); ctx.moveTo(rx, ty - 1); ctx.lineTo(rx, ty + 2); ctx.stroke();
        }
        ctx.strokeStyle = isTarget ? "rgba(200,165,65,0.45)" : "rgba(130,115,80,0.45)";
        ctx.lineWidth = 2;
      });

      // Yellow/black hazard stripe at water edge
      ctx.fillStyle = "rgba(5,8,15,0.7)";
      ctx.fillRect(sx, BY + PH - 5, pw, 5);
      let stripeOn = true;
      for (let lx = sx; lx < sx + pw; lx += 7) {
        if (stripeOn) {
          ctx.fillStyle = "rgba(230,195,0,0.75)";
          ctx.fillRect(lx, BY + PH - 5, Math.min(7, sx + pw - lx), 5);
        }
        stripeOn = !stripeOn;
      }

      // Pilings
      for (let px = sx + 18; px < sx + pw - 4; px += 22) {
        ctx.fillStyle = "#1c2a34";
        ctx.fillRect(px - 5, BY + PH, 10, PILE_H);
        ctx.fillStyle = "#283a46";
        ctx.fillRect(px - 6, BY + PH, 12, 5); // cap
        ctx.fillStyle = "rgba(90,130,150,0.35)";
        ctx.fillRect(px - 5, BY + PH + 11, 10, 2); // tide mark
        ctx.fillStyle = "rgba(0,0,0,0.28)";
        ctx.fillRect(px + 3, BY + PH + 5, 3, PILE_H - 5); // shadow
        // Fender oval on water face
        ctx.beginPath();
        ctx.ellipse(px, BY + PH + 3, 4, 7, 0, 0, Math.PI * 2);
        ctx.fillStyle = "#1c2420";
        ctx.fill();
        ctx.strokeStyle = "rgba(60,80,70,0.5)";
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      // Bollards
      for (let bx = sx + 20; bx < sx + pw - 8; bx += 38) {
        ctx.fillStyle = isTarget ? "#a09060" : "#706248";
        ctx.fillRect(bx - 3, BY + PH - 11, 6, 11);
        ctx.beginPath();
        ctx.ellipse(bx, BY + PH - 11, 5, 3, 0, 0, Math.PI * 2);
        ctx.fillStyle = isTarget ? "#c8aa70" : "#8a7860";
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.4)";
        ctx.lineWidth = 0.5; ctx.stroke();
      }

      // Dock lights
      for (let lx = sx + 28; lx < sx + pw - 8; lx += 46) {
        ctx.beginPath(); ctx.arc(lx, BY + 5, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = isTarget ? "rgba(255,225,90,0.95)" : "rgba(215,158,70,0.85)";
        ctx.fill();
        ctx.beginPath(); ctx.arc(lx, BY + 5, 8, 0, Math.PI * 2);
        ctx.fillStyle = isTarget ? "rgba(255,200,60,0.15)" : "rgba(200,130,50,0.10)";
        ctx.fill();
      }

      // Shore rim
      ctx.strokeStyle = accentA;
      ctx.lineWidth = 1.5; ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(sx, BY); ctx.lineTo(sx + pw, BY); ctx.stroke();
      // Water-edge line
      ctx.strokeStyle = "rgba(0,0,0,0.65)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(sx, BY + PH); ctx.lineTo(sx + pw, BY + PH); ctx.stroke();
    };

    drawPierBase(ax1, ax1r - ax1);
    drawPierBase(ax2, ax2r - ax2);

    // ── Structures on main (west) pier ──────────────────────────────
    const pw1 = ax1r - ax1;
    if (pw1 > 70) {
      // Large warehouse (left 38%)
      const wsx = ax1 + 6;
      const wsw = pw1 * 0.37;
      const wsy = BY + 2;
      const wsh = PH - 4;
      const wg2 = ctx.createLinearGradient(wsx, wsy, wsx, wsy + wsh);
      wg2.addColorStop(0, isTarget ? "#6a5838" : "#3e3020");
      wg2.addColorStop(1, isTarget ? "#4a3e26" : "#2a2018");
      ctx.fillStyle = wg2;
      ctx.fillRect(wsx, wsy, wsw, wsh);
      ctx.fillStyle = isTarget ? "rgba(200,160,55,0.7)" : "rgba(120,98,55,0.6)";
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = isTarget ? "rgba(200,160,55,0.7)" : "rgba(120,98,55,0.6)";
      ctx.beginPath(); ctx.moveTo(wsx, wsy + wsh * 0.36); ctx.lineTo(wsx + wsw, wsy + wsh * 0.36); ctx.stroke();
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.fillRect(wsx + wsw - 5, wsy, 5, wsh); // side shadow
      // Windows
      for (let wx = wsx + 8; wx < wsx + wsw - 14; wx += 18) {
        ctx.fillStyle = "rgba(100,175,235,0.35)";
        ctx.fillRect(wx, wsy + 3, 9, 4);
        ctx.strokeStyle = "rgba(60,80,100,0.4)";
        ctx.lineWidth = 0.5; ctx.strokeRect(wx, wsy + 3, 9, 4);
      }
      // Roll door
      ctx.fillStyle = "#12100e";
      ctx.fillRect(wsx + wsw / 2 - 9, wsy + wsh - 8, 18, 8);
      ctx.strokeStyle = "rgba(80,65,40,0.55)"; ctx.lineWidth = 0.5;
      for (let dy2 = wsy + wsh - 8; dy2 < wsy + wsh; dy2 += 2) {
        ctx.beginPath(); ctx.moveTo(wsx + wsw/2 - 9, dy2); ctx.lineTo(wsx + wsw/2 + 9, dy2); ctx.stroke();
      }
      ctx.fillStyle = isTarget ? "rgba(255,215,85,0.82)" : "rgba(178,156,108,0.72)";
      ctx.font = "bold 6px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("WAREHOUSE", wsx + wsw / 2, wsy + wsh * 0.36 - 1);

      // Shipping container stacks (mid 44%)
      const CONT_COLORS = ["#c83828","#2878c0","#c08818","#309848","#8430b8","#b05e20","#28a8a0"];
      const csx = wsx + wsw + 5;
      const cAreaW = pw1 * 0.43;
      const cGroupW = cAreaW / 3;
      for (let gi = 0; gi < 3; gi++) {
        const gcx = csx + gi * cGroupW + 1;
        for (let row = 0; row < 2; row++) {
          for (let col = 0; col < 2; col++) {
            const cx2 = gcx + col * (cGroupW * 0.5);
            const cy2 = BY + 2 + row * (wsh * 0.5);
            const cw2 = cGroupW * 0.46;
            const ch2 = wsh * 0.45;
            ctx.fillStyle = CONT_COLORS[(gi * 2 + col + row) % CONT_COLORS.length];
            ctx.fillRect(cx2, cy2, cw2, ch2);
            ctx.fillStyle = "rgba(255,255,255,0.2)";
            ctx.fillRect(cx2, cy2, cw2, 1.5);
            ctx.fillStyle = "rgba(0,0,0,0.28)";
            ctx.fillRect(cx2 + cw2 - 2, cy2, 2, ch2);
            ctx.strokeStyle = "rgba(0,0,0,0.2)"; ctx.lineWidth = 0.5;
            ctx.beginPath(); ctx.moveTo(cx2 + cw2/2, cy2); ctx.lineTo(cx2 + cw2/2, cy2 + ch2); ctx.stroke();
          }
        }
      }

      // Fuel/oil storage tank (right area)
      const tkX = ax1r - 20;
      const tkY = BY + PH / 2;
      ctx.beginPath(); ctx.arc(tkX, tkY, 12, 0, Math.PI * 2);
      ctx.fillStyle = isTarget ? "#686040" : "#484838";
      ctx.fill();
      ctx.strokeStyle = isTarget ? "rgba(200,170,60,0.6)" : "rgba(100,110,80,0.5)";
      ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); ctx.arc(tkX - 3, tkY - 3, 6, 0, Math.PI * 2);
      ctx.fillStyle = isTarget ? "rgba(220,195,80,0.22)" : "rgba(140,150,90,0.18)";
      ctx.fill();
      // Tank ring marks
      ctx.strokeStyle = "rgba(0,0,0,0.2)"; ctx.lineWidth = 0.5;
      [5, 8, 11].forEach(r => {
        ctx.beginPath(); ctx.arc(tkX, tkY, r, 0, Math.PI * 2); ctx.stroke();
      });
      ctx.fillStyle = "rgba(200,200,150,0.7)";
      ctx.font = "5px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("OIL", tkX, tkY + 2);

      // Harbour control tower (small, between containers and tank)
      const twX = ax1r - 46;
      const twW = 15; const twH = PH - 4;
      ctx.fillStyle = isTarget ? "#486068" : "#2e4450";
      ctx.fillRect(twX - twW/2, BY + 2, twW, twH);
      ctx.fillStyle = "rgba(110,195,240,0.42)";
      ctx.fillRect(twX - twW/2 + 2, BY + 3, twW - 4, 4);
      ctx.fillStyle = isTarget ? "rgba(240,200,80,0.65)" : "rgba(170,180,120,0.45)";
      ctx.fillRect(twX - twW/2, BY + 2, twW, 2); // top stripe
    }

    // ── Structures on east pier ──────────────────────────────────────
    const pw2 = ax2r - ax2;
    if (pw2 > 40) {
      const ssx = ax2 + 6;
      const ssw = pw2 * 0.40;
      const ssh = PH - 5;
      ctx.fillStyle = isTarget ? "#524428" : "#342a18";
      ctx.fillRect(ssx, BY + 2, ssw, ssh);
      ctx.strokeStyle = isTarget ? "rgba(190,155,52,0.65)" : "rgba(105,87,50,0.55)";
      ctx.lineWidth = 1; ctx.strokeRect(ssx + 0.5, BY + 2.5, ssw - 1, ssh - 1);
      ctx.fillStyle = isTarget ? "rgba(255,205,82,0.8)" : "rgba(168,148,102,0.68)";
      ctx.font = "bold 6px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("CARGO", ssx + ssw / 2, BY + 2 + ssh / 2 + 2);
      // Two container stacks
      const CONT2 = ["#c83828","#2878c0","#309848","#c08818"];
      const csx2 = ssx + ssw + 5;
      for (let col = 0; col < 2; col++) {
        const cx2 = csx2 + col * (pw2 * 0.27);
        for (let row = 0; row < 2; row++) {
          const cy2 = BY + 2 + row * ((PH - 4) * 0.5);
          const cw2 = pw2 * 0.23;
          const ch2 = (PH - 4) * 0.45;
          ctx.fillStyle = CONT2[(col * 2 + row) % CONT2.length];
          ctx.fillRect(cx2, cy2, cw2, ch2);
          ctx.fillStyle = "rgba(255,255,255,0.2)";
          ctx.fillRect(cx2, cy2, cw2, 1.5);
          ctx.fillStyle = "rgba(0,0,0,0.28)";
          ctx.fillRect(cx2 + cw2 - 2, cy2, 2, ch2);
        }
      }
    }

    // ── Gantry crane between piers (portal-crane silhouette) ─────────
    const crx = (ax1r + ax2) / 2;
    if (crx > -80 && crx < CW + 80) {
      ctx.fillStyle = "#484030";
      ctx.fillRect(crx - 5, BY, 10, PH + 7); // base on pier gap
      ctx.fillStyle = "#343022";
      ctx.fillRect(crx - 4, BY + PH + 5, 8, 30); // mast
      ctx.fillRect(crx - 52, BY + PH + 33, 104, 7); // wide boom
      // Lattice marks on boom
      ctx.strokeStyle = "rgba(70,60,44,0.65)"; ctx.lineWidth = 0.8;
      for (let lx = crx - 50; lx < crx + 50; lx += 12) {
        ctx.beginPath(); ctx.moveTo(lx, BY + PH + 33); ctx.lineTo(lx + 6, BY + PH + 40); ctx.stroke();
      }
      // Red warning lights at tips
      [crx - 50, crx + 50].forEach(ex => {
        ctx.beginPath(); ctx.arc(ex, BY + PH + 36, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = "#e02810"; ctx.fill();
        ctx.beginPath(); ctx.arc(ex, BY + PH + 36, 7, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(220,40,20,0.18)"; ctx.fill();
      });
      // Trolley + cable
      ctx.fillStyle = "#5a5040";
      ctx.fillRect(crx - 6, BY + PH + 32, 12, 9);
      ctx.strokeStyle = "rgba(150,130,85,0.9)"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(crx, BY + PH + 41); ctx.lineTo(crx, BY + PH + 60); ctx.stroke();
      // Hook block
      ctx.fillStyle = "#685840";
      ctx.fillRect(crx - 6, BY + PH + 60, 12, 7);
      // Container on hook
      ctx.fillStyle = "#2878c0";
      ctx.fillRect(crx - 10, BY + PH + 67, 20, 9);
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.fillRect(crx - 10, BY + PH + 67, 20, 2);
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(crx + 8, BY + PH + 67, 2, 9);
    }

    // ── Navigation signal mast at pier end ────────────────────────────
    const mastX = ax1r - 6;
    if (mastX > -20 && mastX < CW + 20) {
      ctx.fillStyle = "#383020";
      ctx.fillRect(mastX - 2, BY + 2, 4, PH - 2);
      ctx.beginPath(); ctx.arc(mastX, BY + 3, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = isTarget ? "#20e060" : "#e04040"; ctx.fill();
      ctx.beginPath(); ctx.arc(mastX, BY + 3, 9, 0, Math.PI * 2);
      ctx.fillStyle = isTarget ? "rgba(30,220,80,0.18)" : "rgba(220,40,40,0.15)"; ctx.fill();
    }

    // ── Berth zone ────────────────────────────────────────────────────
    const bxCenter = (ax2 + ax2r) / 2;
    const bw = Math.max(40, ax2r - ax2);
    if (bxCenter > -80 && bxCenter < CW + 80) {
      const by = BY + PH;
      const bh = BERTH_D;
      const bStroke = isTarget ? "rgba(80,255,140,0.9)"  : "rgba(255,220,50,0.8)";
      const bFill   = isTarget ? "rgba(60,220,120,0.07)" : "rgba(255,210,40,0.05)";

      // Berth water subtle gradient
      const bg2 = ctx.createLinearGradient(bxCenter - bw/2, by, bxCenter + bw/2, by + bh);
      bg2.addColorStop(0, "rgba(30,50,70,0.18)");
      bg2.addColorStop(1, "rgba(20,35,55,0.08)");
      ctx.fillStyle = bg2; ctx.fillRect(bxCenter - bw/2, by, bw, bh);
      ctx.fillStyle = bFill; ctx.fillRect(bxCenter - bw/2, by, bw, bh);

      // Dashed border
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = bStroke; ctx.lineWidth = 1.2;
      ctx.strokeRect(bxCenter - bw/2, by, bw, bh);
      ctx.setLineDash([]);

      // L-bracket corners + light dots
      const L = 9;
      ctx.strokeStyle = bStroke; ctx.lineWidth = 2.5;
      for (const [cx2, cy2, dx, dy] of [
        [bxCenter - bw/2, by,       1,  1],
        [bxCenter + bw/2, by,      -1,  1],
        [bxCenter - bw/2, by + bh,  1, -1],
        [bxCenter + bw/2, by + bh, -1, -1],
      ] as [number, number, number, number][]) {
        ctx.beginPath(); ctx.moveTo(cx2 + dx*L, cy2); ctx.lineTo(cx2, cy2); ctx.lineTo(cx2, cy2+dy*L); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx2, cy2, 3, 0, Math.PI*2);
        ctx.fillStyle = isTarget ? "rgba(80,255,140,0.9)" : "rgba(255,220,50,0.85)"; ctx.fill();
      }

      // Mooring rope catenary lines
      ctx.strokeStyle = "rgba(160,140,88,0.48)"; ctx.lineWidth = 1;
      [[bxCenter - bw/2 + 3, -1], [bxCenter + bw/2 - 3, 1]].forEach(([rx, dir]) => {
        ctx.beginPath();
        ctx.moveTo(rx, by);
        ctx.quadraticCurveTo(rx + dir * 5, by - PH/2, rx + dir * 5, by - PH);
        ctx.stroke();
      });

      // Approach guide lines
      ctx.setLineDash([5, 8]);
      ctx.strokeStyle = isTarget ? "rgba(80,255,140,0.28)" : "rgba(255,220,50,0.2)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(bxCenter - bw/2, by + bh); ctx.lineTo(bxCenter - bw/2, by + bh + 22); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bxCenter + bw/2, by + bh); ctx.lineTo(bxCenter + bw/2, by + bh + 22); ctx.stroke();
      ctx.setLineDash([]);

      // Gangway ramp
      ctx.strokeStyle = isTarget ? "rgba(200,210,120,0.65)" : "rgba(160,148,100,0.55)";
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(bxCenter, by); ctx.lineTo(bxCenter, by + 11); ctx.stroke();
      ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = 0.5;
      for (let gy = by + 2; gy < by + 11; gy += 2.5) {
        ctx.beginPath(); ctx.moveTo(bxCenter - 5, gy); ctx.lineTo(bxCenter + 5, gy); ctx.stroke();
      }

      // Labels
      ctx.textAlign = "center";
      ctx.fillStyle = isTarget ? "rgba(80,255,140,0.95)" : "rgba(255,215,45,0.9)";
      ctx.font = `bold ${isTarget ? 9 : 8}px sans-serif`;
      ctx.fillText(isTarget ? "▸ TARGET ◂" : "BERTH", bxCenter, by + bh * 0.44);
      ctx.fillStyle = isTarget ? "rgba(200,255,220,0.85)" : "rgba(255,230,160,0.8)";
      ctx.font = "7px sans-serif";
      ctx.fillText(dockName, bxCenter, by + bh * 0.44 + 11);
    }
  };

  drawDock(DOCK_A_CENTER_X, "DOCK A", targetDockX === DOCK_A_CENTER_X);
  drawDock(DOCK_B_CENTER_X, "DOCK B", targetDockX === DOCK_B_CENTER_X);

  ctx.restore(); // end dock clip

  // Port basin — after sea lanes, water channel ends at industrial quay (world X ≥ PORT_BASIN_START_X)
  {
    const { x: px0 } = toS(PORT_BASIN_START_X, horizY);
    const { x: px1 } = toS(PATH_END_X + 200, horizY);
    const left = Math.max(0, Math.min(px0, px1));
    const right = Math.min(CW, Math.max(px0, px1));
    if (right > 0 && left < CW) {
      const portGrad = ctx.createLinearGradient(left, horizY, right, CH);
      portGrad.addColorStop(0, "rgba(35,42,52,0.72)");
      portGrad.addColorStop(1, "rgba(22,28,36,0.88)");
      ctx.fillStyle = portGrad;
      ctx.fillRect(left, horizY, right - left, CH - horizY);
      // Quay wall
      const qy = toS(PORT_BASIN_START_X + 80, DOCK_WATERLINE_Y).y;
      ctx.fillStyle = "#4a4038";
      ctx.fillRect(left, qy - 4, right - left, 10);
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(left, qy);
      ctx.lineTo(right, qy);
      ctx.stroke();
      // City / crane silhouettes along quay
      for (let i = 0; i < 14; i++) {
        const wx = PORT_BASIN_START_X + 120 + i * 220 + ((i * 97) % 80);
        const { x: sx, y: sy } = toS(wx, DOCK_WATERLINE_Y);
        if (sx < -40 || sx > CW + 40) continue;
        const h = 28 + (i % 5) * 10;
        ctx.fillStyle = i % 3 === 0 ? "#2a3038" : "#323a44";
        ctx.fillRect(sx - 16, sy - h - 8, 32, h);
        if (i % 4 === 0) {
          ctx.fillStyle = "#3a4048";
          ctx.fillRect(sx + 8, sy - h - 38, 4, 34);
          ctx.beginPath();
          ctx.moveTo(sx + 10, sy - h - 38);
          ctx.lineTo(sx + 28, sy - h - 28);
          ctx.lineTo(sx + 10, sy - h - 20);
          ctx.fill();
        }
      }
      const midPort = toS((PORT_BASIN_START_X + PATH_END_X) / 2, DOCK_WATERLINE_Y - 120);
      if (midPort.x > -80 && midPort.x < CW + 80) {
        ctx.fillStyle = "rgba(255,200,120,0.95)";
        ctx.font = "bold 13px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("PORT — end of channel", midPort.x, midPort.y);
      }

      // ── Moored ships alongside the port quay ─────────────────────────
      // Drawn directly in world→screen space (no rotation transform)
      // Ship north side always abuts the quay wall at y = DOCK_WATERLINE_Y
      MOORED_SHIPS.forEach(({ cx, bowLen, sternLen, hw, type }) => {
        const northY = DOCK_WATERLINE_Y;                 // world y of quay / ship north edge
        const southY = northY + hw * 2;                  // world y of ship south edge
        const bowX   = cx + bowLen;                      // world x of bow  (east)
        const sternX = cx - sternLen;                    // world x of stern (west)
        const noseLen = hw * 0.9;                        // bow taper length

        // Screen coords for corners
        const bx  = toS(bowX,        (northY + southY) / 2).x;  // bow tip x
        const stx = toS(sternX,       northY).x;                  // stern x
        const ny  = toS(bowX,         northY).y;                  // north edge y
        const sy  = toS(bowX,         southY).y;                  // south edge y
        const midY = (ny + sy) / 2;
        const totalW = bx - stx;

        if (bx < -20 || stx > CW + 20 || sy < horizY || ny > CH + 20) return;

        ctx.save();
        ctx.beginPath(); // hull clip
        ctx.moveTo(bx, midY);               // bow tip
        ctx.lineTo(bx - noseLen, ny);       // bow shoulder north
        ctx.lineTo(stx, ny);                // stern north
        ctx.lineTo(stx, sy);                // stern south
        ctx.lineTo(bx - noseLen, sy);       // bow shoulder south
        ctx.closePath();
        ctx.clip();

        // ── Hull gradient (side-to-side shadow) ───────────────────
        const hullColors = {
          bulk:   ["#523028", "#7a4838", "#523028"] as const,
          tanker: ["#1e2228", "#2e3440", "#1e2228"] as const,
          cruise: ["#b8d0e0", "#dceef8", "#b8d0e0"] as const,
        };
        const hc = hullColors[type];
        const hullG = ctx.createLinearGradient(0, ny, 0, sy);
        hullG.addColorStop(0,   hc[0]);
        hullG.addColorStop(0.5, hc[1]);
        hullG.addColorStop(1,   hc[0]);
        ctx.fillStyle = hullG;
        ctx.fillRect(stx, ny, totalW + noseLen, sy - ny);

        // ── Type-specific deck detail ──────────────────────────────
        if (type === "bulk") {
          // Rust-red waterline band
          ctx.fillStyle = "#8a3820";
          ctx.fillRect(stx, midY + (sy - midY) * 0.5, totalW + noseLen, (sy - midY) * 0.5);
          // Cream-colored deck
          ctx.fillStyle = "#c8b898";
          const deckN = ny + (sy - ny) * 0.18;
          const deckS = sy - (sy - ny) * 0.18;
          ctx.fillRect(stx + 4, deckN, totalW - 8, deckS - deckN);
          // Hatch covers (5 rectangular hatches)
          ctx.fillStyle = "#b0a080";
          ctx.strokeStyle = "#88785a";
          ctx.lineWidth = 0.8;
          const hatchCount = 5;
          const hatchW = (totalW - 28) / hatchCount - 5;
          const hatchH = (deckS - deckN) * 0.62;
          for (let h = 0; h < hatchCount; h++) {
            const hx = stx + 14 + h * ((totalW - 24) / hatchCount);
            const hatch_y = deckN + (deckS - deckN - hatchH) / 2;
            ctx.fillRect(hx, hatch_y, hatchW, hatchH);
            ctx.strokeRect(hx, hatch_y, hatchW, hatchH);
            // Coaming edge highlight
            ctx.fillStyle = "rgba(255,240,200,0.15)";
            ctx.fillRect(hx + 1, hatch_y + 1, hatchW - 2, 3);
            ctx.fillStyle = "#b0a080";
          }
          // Bridge superstructure at stern (west)
          const bridgeW = totalW * 0.14;
          const bridgeX = stx + 4;
          ctx.fillStyle = "#d4c8a8";
          ctx.fillRect(bridgeX, deckN, bridgeW, deckS - deckN);
          ctx.fillStyle = "#a89870";
          ctx.fillRect(bridgeX + 2, deckN + 2, bridgeW - 4, (deckS - deckN) * 0.4);
          // Mast
          ctx.strokeStyle = "rgba(80,60,30,0.7)";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(bowX > cx ? bx - 8 : stx + 8, midY);
          ctx.lineTo(bx - totalW * 0.08, midY);
          ctx.stroke();

        } else if (type === "tanker") {
          // Black hull base
          ctx.fillStyle = "#181c20";
          ctx.fillRect(stx, ny, totalW + noseLen, sy - ny);
          // Red bottom band
          ctx.fillStyle = "#7a2010";
          ctx.fillRect(stx, midY + (sy - midY) * 0.45, totalW + noseLen, (sy - midY) * 0.55);
          // Dark gray deck
          const deckN = ny + (sy - ny) * 0.15;
          const deckS = sy - (sy - ny) * 0.15;
          ctx.fillStyle = "#484e58";
          ctx.fillRect(stx + 4, deckN, totalW - 8, deckS - deckN);
          // Central pipeline (main feature of a tanker deck)
          const pipeY = midY - 1;
          ctx.strokeStyle = "#707880";
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.moveTo(stx + 20, pipeY);
          ctx.lineTo(bx - 12, pipeY);
          ctx.stroke();
          // Pipe highlight
          ctx.strokeStyle = "rgba(200,210,220,0.35)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(stx + 20, pipeY - 1);
          ctx.lineTo(bx - 12, pipeY - 1);
          ctx.stroke();
          // Manifold T-crossing in the middle
          const manX = stx + totalW * 0.48;
          ctx.fillStyle = "#606870";
          ctx.fillRect(manX - 5, midY - 5, 10, 10);
          ctx.strokeStyle = "#888e98";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(manX, deckN + 2);
          ctx.lineTo(manX, deckS - 2);
          ctx.stroke();
          // Pump stations
          [0.25, 0.75].forEach((t) => {
            const px = stx + totalW * t;
            ctx.fillStyle = "#505860";
            ctx.fillRect(px - 3, midY - 3, 6, 6);
          });
          // Bridge at stern
          ctx.fillStyle = "#3a4050";
          ctx.fillRect(stx + 3, deckN, totalW * 0.13, deckS - deckN);
          ctx.fillStyle = "#505868";
          ctx.fillRect(stx + 5, deckN + 2, totalW * 0.09, (deckS - deckN) * 0.5);

        } else {
          // ── Cruise liner ─────────────────────────────────────────
          // Bright white hull
          ctx.fillStyle = "#e8ecf0";
          ctx.fillRect(stx, ny, totalW + noseLen, sy - ny);
          // Royal blue waterline band
          ctx.fillStyle = "#1848a8";
          ctx.fillRect(stx, midY + (sy - midY) * 0.5, totalW + noseLen, (sy - midY) * 0.5);
          // Lido deck (light blue pool)
          const deckH = sy - ny;
          ctx.fillStyle = "#c8e0f0";
          ctx.fillRect(stx + totalW * 0.15, ny + deckH * 0.22, totalW * 0.55, deckH * 0.56);
          // Pool
          ctx.fillStyle = "#4888c8";
          ctx.fillRect(stx + totalW * 0.30, ny + deckH * 0.32, totalW * 0.22, deckH * 0.36);
          // Window strip along each side (portholes seen from above as a stripe)
          ctx.fillStyle = "rgba(100,160,220,0.40)";
          ctx.fillRect(stx + 2, ny + deckH * 0.06, totalW - 8, deckH * 0.10);
          ctx.fillRect(stx + 2, sy - deckH * 0.16, totalW - 8, deckH * 0.10);
          // Funnels at stern (two stacks)
          [0.12, 0.22].forEach((t, i) => {
            const fx = stx + totalW * t;
            ctx.fillStyle = "#c03028";
            ctx.beginPath();
            ctx.ellipse(fx, midY + (i - 0.5) * deckH * 0.28, 7, 4, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#e84030";
            ctx.beginPath();
            ctx.ellipse(fx - 1, midY + (i - 0.5) * deckH * 0.28 - 1, 3.5, 2, 0, 0, Math.PI * 2);
            ctx.fill();
          });
          // Helipad circle at bow
          ctx.strokeStyle = "rgba(255,240,60,0.7)";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(bx - noseLen * 1.2, midY, deckH * 0.18, 0, Math.PI * 2);
          ctx.stroke();
          // H marking on helipad
          ctx.strokeStyle = "rgba(255,240,60,0.55)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(bx - noseLen * 1.2 - 5, midY - 5);
          ctx.lineTo(bx - noseLen * 1.2 - 5, midY + 5);
          ctx.moveTo(bx - noseLen * 1.2 + 5, midY - 5);
          ctx.lineTo(bx - noseLen * 1.2 + 5, midY + 5);
          ctx.moveTo(bx - noseLen * 1.2 - 5, midY);
          ctx.lineTo(bx - noseLen * 1.2 + 5, midY);
          ctx.stroke();
        }

        ctx.restore(); // end hull clip

        // Hull outline
        ctx.save();
        ctx.strokeStyle = type === "cruise" ? "rgba(40,80,140,0.6)" : "rgba(0,0,0,0.45)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(bx, midY);
        ctx.lineTo(bx - noseLen, ny);
        ctx.lineTo(stx, ny);
        ctx.lineTo(stx, sy);
        ctx.lineTo(bx - noseLen, sy);
        ctx.closePath();
        ctx.stroke();

        // Mooring lines to quay (from bow and stern)
        ctx.strokeStyle = "rgba(180,155,90,0.60)";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        [[bx - noseLen * 0.5, ny], [stx + totalW * 0.1, ny]].forEach(([lx, ly]) => {
          ctx.beginPath();
          ctx.moveTo(lx, ly);
          ctx.lineTo(lx, ny - 8);
          ctx.stroke();
        });
        ctx.setLineDash([]);
        ctx.restore();

        // Ship label (south of ship)
        const label = type === "bulk" ? "BULK CARRIER" : type === "tanker" ? "TANKER" : "CRUISE LINER";
        ctx.fillStyle = "rgba(210,195,140,0.75)";
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(label, (bx + stx) / 2, sy + 13);
      });
    }
  }

  // Channel end / stop line
  {
    const { x: ex } = toS(PATH_END_X, DOCK_WATERLINE_Y);
    if (ex > -20 && ex < CW + 20) {
      ctx.strokeStyle = "rgba(255,220,80,0.85)";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(ex, horizY + 8);
      ctx.lineTo(ex, CH - 6);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(255,220,80,0.9)";
      ctx.font = "bold 9px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("STOP", ex, horizY + 22);
    }
  }

  // AI ships
  const drawShip = (
    vx: number,
    vy: number,
    hdg: number,
    len: number,
    wid: number,
    hull: string,
    cabin: string,
    lbl: string,
    spd: number,
    sinkT?: number,
    /** Fade out as boat leaves camera area (open water). */
    fadeFromCam?: boolean,
  ) => {
    const st = sinkT ?? 0;
    if (st >= 1) return;
    const { x: sx, y: sy } = toS(vx, vy + st * (len * 1.2 + 8));
    if (sx < -80 || sx > CW + 80 || sy < horizY || sy > CH + 120) return;
    const distCam = Math.hypot(vx - ls.cam.x, vy - ls.cam.y);
    let fadeCam = 1;
    if (fadeFromCam && distCam > 980) {
      fadeCam = Math.max(0, 1 - (distCam - 980) / 1800);
    }
    if (fadeCam < 0.04) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0.06, 1 - st * 0.92) * fadeCam;
    ctx.translate(sx, sy);
    ctx.rotate((hdg * Math.PI) / 180);
    if (spd > 0.5 && st < 0.4) {
      const wk = ctx.createRadialGradient(0, len * 0.55, 2, 0, len * 0.55, 40);
      wk.addColorStop(0, "rgba(255,255,255,0.18)");
      wk.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = wk;
      ctx.beginPath();
      ctx.moveTo(0, len * 0.4);
      ctx.lineTo(-28, len * 0.4 + 52);
      ctx.lineTo(28, len * 0.4 + 52);
      ctx.closePath();
      ctx.fill();
    }
    // Hull gradient
    const hG = ctx.createLinearGradient(-wid, -len, wid, len * 0.55);
    hG.addColorStop(0, hull); hG.addColorStop(0.5, cabin); hG.addColorStop(1, hull);
    ctx.fillStyle = hG;
    ctx.beginPath();
    ctx.moveTo(0, -len);
    ctx.lineTo(wid * 0.85, -len * 0.1);
    ctx.lineTo(wid, len * 0.55);
    ctx.lineTo(-wid, len * 0.55);
    ctx.lineTo(-wid * 0.85, -len * 0.1);
    ctx.closePath();
    ctx.fill();
    // Deck (lighter strip)
    ctx.fillStyle = cabin;
    ctx.fillRect(-wid * 0.5, -len * 0.2, wid, len * 0.52);
    // Waterline stripe
    ctx.strokeStyle = "rgba(200,45,30,0.75)";
    ctx.lineWidth = Math.max(1, wid * 0.15);
    ctx.beginPath(); ctx.moveTo(-wid * 0.92, len * 0.22); ctx.lineTo(wid * 0.92, len * 0.22); ctx.stroke();
    // Superstructure (cabin block)
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(-wid * 0.35, -len * 0.18, wid * 0.7, len * 0.28);
    // Mast
    ctx.strokeStyle = "rgba(215,205,170,0.6)";
    ctx.lineWidth = Math.max(0.5, wid * 0.08);
    ctx.beginPath(); ctx.moveTo(0, -len * 0.18); ctx.lineTo(0, -len * 0.7); ctx.stroke();
    // Wake
    if (spd > 0.5 && st < 0.4) {
      const wk2 = ctx.createLinearGradient(0, len * 0.4, 0, len * 0.4 + 38);
      wk2.addColorStop(0, "rgba(255,255,255,0.25)");
      wk2.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = wk2;
      ctx.beginPath();
      ctx.moveTo(0, len * 0.4);
      ctx.lineTo(-24, len * 0.4 + 40);
      ctx.lineTo(24, len * 0.4 + 40);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    if (lbl.length > 0 && st < 0.85) {
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = "bold 9px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(lbl, sx, sy + len + 14);
    }
  };

  { const { y: cgy } = toS(ls.cargo.x, ls.cargo.y); if (cgy > horizY) drawShip(ls.cargo.x, ls.cargo.y, ls.cargo.heading, 40, 17, "#2e4e70", "#3a6080", "CARGO", ls.cargo.speed, ls.cargo.sinkT, false); }
  { const { y: fgy } = toS(ls.ferry.x, ls.ferry.y); if (fgy > horizY) drawShip(ls.ferry.x, ls.ferry.y, ls.ferry.heading, 46, 19, "#4a6a8a", "#5a7a9a", "FERRY", ls.ferry.speed, ls.ferry.sinkT, false); }

  // ── Detailed escort / towed cargo ship ──────────────────────────
  {
    const { x: esx, y: esy } = toS(ls.escort.x, ls.escort.y);
    if (esx > -100 && esx < CW + 100 && esy > horizY && esy < CH + 120) {
      ctx.save();
      ctx.translate(esx, esy);
      ctx.rotate((ls.escort.heading * Math.PI) / 180);

      // Wake
      if (ls.escort.speed > 0.3) {
        const wk = ctx.createRadialGradient(0, 26, 2, 0, 26, 52);
        wk.addColorStop(0, "rgba(255,255,255,0.16)");
        wk.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = wk;
        ctx.beginPath();
        ctx.moveTo(0, 22);
        ctx.lineTo(-36, 70);
        ctx.lineTo(36, 70);
        ctx.closePath();
        ctx.fill();
      }

      // Main hull — long, flat-sided bulk carrier
      const hullGrad = ctx.createLinearGradient(-20, -48, 20, 32);
      hullGrad.addColorStop(0, "#28383a");
      hullGrad.addColorStop(0.4, "#2e4244");
      hullGrad.addColorStop(1, "#1a2830");
      ctx.fillStyle = hullGrad;
      ctx.beginPath();
      ctx.moveTo(0, -52);                    // bow tip
      ctx.quadraticCurveTo(22, -40, 24, -18);
      ctx.lineTo(24, 32);
      ctx.quadraticCurveTo(20, 40, 12, 42);
      ctx.lineTo(-12, 42);
      ctx.quadraticCurveTo(-20, 40, -24, 32);
      ctx.lineTo(-24, -18);
      ctx.quadraticCurveTo(-22, -40, 0, -52);
      ctx.closePath();
      ctx.fill();

      // Waterline stripe (contrasting band)
      ctx.strokeStyle = "#c84820";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-23, 18);
      ctx.lineTo(23, 18);
      ctx.stroke();

      // Boot topping (anti-fouling red below waterline strip)
      ctx.fillStyle = "#9a3010";
      ctx.beginPath();
      ctx.moveTo(-24, 20);
      ctx.lineTo(24, 20);
      ctx.lineTo(22, 36);
      ctx.quadraticCurveTo(18, 42, 12, 42);
      ctx.lineTo(-12, 42);
      ctx.quadraticCurveTo(-18, 42, -22, 36);
      ctx.closePath();
      ctx.fill();

      // Deck surface
      ctx.fillStyle = "#3a4a38";
      ctx.beginPath();
      ctx.moveTo(0, -48);
      ctx.quadraticCurveTo(18, -38, 20, -18);
      ctx.lineTo(20, 30);
      ctx.quadraticCurveTo(16, 38, 10, 40);
      ctx.lineTo(-10, 40);
      ctx.quadraticCurveTo(-16, 38, -20, 30);
      ctx.lineTo(-20, -18);
      ctx.quadraticCurveTo(-18, -38, 0, -48);
      ctx.closePath();
      ctx.fill();

      // Deck rail (thin line on both sides)
      ctx.strokeStyle = "rgba(200,190,160,0.3)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-19, -16); ctx.lineTo(-19, 28);
      ctx.moveTo( 19, -16); ctx.lineTo( 19, 28);
      ctx.stroke();

      // Cargo holds (3 hatches)
      const hatchPositions = [-30, -8, 14];
      hatchPositions.forEach((hy) => {
        // Hatch coaming (raised lip)
        ctx.fillStyle = "#2a3828";
        ctx.fillRect(-13, hy - 1, 26, 15);
        // Hatch cover
        const hatchGrad = ctx.createLinearGradient(-12, hy, 12, hy + 13);
        hatchGrad.addColorStop(0, "#3e5040");
        hatchGrad.addColorStop(1, "#2e3c30");
        ctx.fillStyle = hatchGrad;
        ctx.fillRect(-12, hy, 24, 13);
        // Hatch panel lines
        ctx.strokeStyle = "rgba(100,120,100,0.5)";
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(0, hy); ctx.lineTo(0, hy + 13);
        ctx.moveTo(-12, hy + 6); ctx.lineTo(12, hy + 6);
        ctx.stroke();
      });

      // Deck cranes (two boom cranes, port & starboard)
      [[-17, -12], [17, -12], [-17, 10], [17, 10]].forEach(([cx2, cy2]) => {
        ctx.fillStyle = "#f0c830";
        ctx.beginPath();
        ctx.arc(cx2, cy2, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#e0b820";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(cx2, cy2);
        ctx.lineTo(cx2 > 0 ? cx2 + 7 : cx2 - 7, cy2 - 8);
        ctx.stroke();
      });

      // Bridge superstructure (aft, toward stern)
      const bridgeGrad = ctx.createLinearGradient(-10, 22, 10, 38);
      bridgeGrad.addColorStop(0, "#d8d0c4");
      bridgeGrad.addColorStop(1, "#b0a898");
      ctx.fillStyle = bridgeGrad;
      ctx.strokeStyle = "#6a6050";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.roundRect(-10, 22, 20, 16, 1);
      ctx.fill(); ctx.stroke();

      // Bridge windows row
      ctx.fillStyle = "#1a2838";
      ctx.fillRect(-8, 24, 16, 5);
      ctx.fillStyle = "rgba(120,180,220,0.5)";
      for (let wi = 0; wi < 4; wi++) {
        ctx.fillRect(-7 + wi * 4, 24.5, 2.5, 3.8);
      }

      // Bridge roof
      ctx.fillStyle = "#c0b8a8";
      ctx.fillRect(-11, 21, 22, 2);

      // Funnel / smokestack (aft of bridge)
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(-4, 32, 8, 10);
      ctx.fillStyle = "#282828";
      ctx.fillRect(-3, 24, 6, 8);
      // Funnel band (company colors: yellow)
      ctx.fillStyle = "#e8c030";
      ctx.fillRect(-4, 33, 8, 2.5);

      // Foremast (bow area)
      ctx.strokeStyle = "#5a5040";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -44);
      ctx.lineTo(0, -28);
      ctx.stroke();
      // Yardarm
      ctx.beginPath();
      ctx.moveTo(-8, -38);
      ctx.lineTo(8, -38);
      ctx.stroke();

      // Navigation lights
      ctx.fillStyle = "#ff4040"; // port (red)
      ctx.beginPath(); ctx.arc(-20, -10, 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#40ff80"; // starboard (green)
      ctx.beginPath(); ctx.arc(20, -10, 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ffff80"; // masthead white
      ctx.beginPath(); ctx.arc(0, -44, 2, 0, Math.PI * 2); ctx.fill();

      // Bow anchor chain (subtle)
      ctx.strokeStyle = "rgba(180,170,140,0.35)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(-10, -44); ctx.lineTo(-10, -30);
      ctx.moveTo( 10, -44); ctx.lineTo( 10, -30);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.restore();

      // Label above ship
      ctx.fillStyle = "rgba(255,230,120,0.85)";
      ctx.font = "bold 9px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("CARGO SHIP", esx, esy - 62);
    }
  }
  ls.fishers.forEach((f) => drawShip(f.x, f.y, f.heading, 22, 9, "#6a5030", "#8a7050", "", f.speed, f.sinkT, true));
  ls.traffic.forEach((t) => drawShip(t.x, t.y, t.heading, 32, 13, "#4a5868", "#5a6878", "", t.speed, t.sinkT, true));

  // Cherry blossoms (falling bonus pickups)
  const drawCherryFlower = (wx: number, wy: number, rot: number) => {
    const { x: lx, y: ly } = toS(wx, wy);
    if (lx < -35 || lx > CW + 35 || ly < -25 || ly > CH + 35) return;
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(rot);
    const n = 5;
    for (let i = 0; i < n; i++) {
      ctx.save();
      ctx.rotate((i / n) * Math.PI * 2);
      const pg = ctx.createLinearGradient(0, -12, 0, 4);
      pg.addColorStop(0, "#fff8fc");
      pg.addColorStop(0.45, "#ffc8e0");
      pg.addColorStop(1, "#ff9ec8");
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.ellipse(0, -6.5, 3.4, 7.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,150,190,0.35)";
      ctx.lineWidth = 0.5;
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = "#ffeef6";
    ctx.beginPath();
    ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,180,210,0.5)";
    ctx.lineWidth = 0.4;
    ctx.stroke();
    ctx.fillStyle = "#f4d060";
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 1.4, Math.sin(a) * 1.4, 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#e8a8c8";
    ctx.beginPath();
    ctx.arc(0, 0, 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  ls.cherryFlowers.forEach((fl) => drawCherryFlower(fl.x, fl.y, fl.rot));

  // Tugboat (workboat silhouette: wide hull, wheelhouse, funnel, fenders)
  const { x: tx, y: ty } = toS(ls.tug.x, ls.tug.y);
  ctx.save();
  ctx.translate(tx, ty);
  ctx.rotate((ls.tug.heading * Math.PI) / 180);
  if (Math.abs(ls.tug.speed) > 0.3) {
    const wk = ctx.createRadialGradient(0, 18, 2, 0, 18, 44);
    wk.addColorStop(0, "rgba(255,255,255,0.22)");
    wk.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = wk;
    ctx.beginPath();
    ctx.moveTo(0, 18);
    ctx.lineTo(-30, 58);
    ctx.lineTo(30, 58);
    ctx.closePath();
    ctx.fill();
  }
  // Main hull — wide, flat sheer, squared stern (bow toward -Y)
  const hullGrad = ctx.createLinearGradient(-14, -26, 14, 22);
  hullGrad.addColorStop(0, "#b83818");
  hullGrad.addColorStop(0.45, "#d04828");
  hullGrad.addColorStop(1, "#8a2810");
  ctx.fillStyle = hullGrad;
  ctx.beginPath();
  ctx.moveTo(0, -30); // bow
  ctx.quadraticCurveTo(16, -22, 18, -8);
  ctx.lineTo(18, 18);
  ctx.quadraticCurveTo(16, 24, 10, 26);
  ctx.lineTo(-10, 26);
  ctx.quadraticCurveTo(-16, 24, -18, 18);
  ctx.lineTo(-18, -8);
  ctx.quadraticCurveTo(-16, -22, 0, -30);
  ctx.closePath();
  ctx.fill();
  // Rub rail / boot stripe
  ctx.strokeStyle = "rgba(255,220,180,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-17, 4);
  ctx.lineTo(17, 4);
  ctx.stroke();
  // Rubber tire fenders (classic tug)
  ctx.fillStyle = "#1a1610";
  for (const fy of [-6, 2, 12]) {
    ctx.beginPath();
    ctx.arc(-17, fy, 3.2, 0, Math.PI * 2);
    ctx.arc(17, fy, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#2a2420";
  for (const fy of [-6, 2, 12]) {
    ctx.beginPath();
    ctx.arc(-17, fy, 1.6, 0, Math.PI * 2);
    ctx.arc(17, fy, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  // Main deck house / wheelhouse (white, offset forward)
  ctx.fillStyle = "#e8e0d4";
  ctx.strokeStyle = "#4a4038";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(-11, -16, 22, 14, 2);
  ctx.fill();
  ctx.stroke();
  // Window band
  ctx.fillStyle = "#1a2838";
  ctx.fillRect(-9, -13, 18, 5);
  ctx.fillStyle = "rgba(120,180,220,0.45)";
  ctx.fillRect(-8, -12.5, 4, 3.5);
  ctx.fillRect(-1.5, -12.5, 4, 3.5);
  ctx.fillRect(5, -12.5, 4, 3.5);
  // Roof overhang
  ctx.fillStyle = "#c8c0b8";
  ctx.fillRect(-12, -17.5, 24, 2);
  // Stack / funnel behind house
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(-4, -8, 8, 10);
  ctx.fillStyle = "#2a2a2a";
  ctx.fillRect(-3, -18, 6, 10);
  ctx.fillStyle = "#ffcc40";
  ctx.beginPath();
  ctx.arc(0, -13, 2.5, 0, Math.PI * 2);
  ctx.fill();
  // Mast with small light
  ctx.strokeStyle = "#3a3838";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -17);
  ctx.lineTo(0, -26);
  ctx.stroke();
  ctx.fillStyle = "#ff6040";
  ctx.beginPath();
  ctx.arc(0, -26, 2, 0, Math.PI * 2);
  ctx.fill();
  // Bow push knee (subtle)
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.beginPath();
  ctx.moveTo(0, -30);
  ctx.lineTo(8, -22);
  ctx.lineTo(0, -20);
  ctx.lineTo(-8, -22);
  ctx.closePath();
  ctx.fill();
  // Rudder (stern)
  ctx.save();
  ctx.translate(0, 24);
  ctx.rotate((ls.tug.rudder * Math.PI) / 180);
  ctx.fillStyle = "#4a4030";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-5, 12);
  ctx.lineTo(5, 12);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#2a2018";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
  ctx.restore();

  // Tow line from tug stern to escort bow (only when escort is visible in water)
  if (!ls.escort.sunk) {
    const { x: esx, y: esy } = toS(ls.escort.x, ls.escort.y);
    if (esy > horizY) {
      const towDist = Math.sqrt((ls.tug.x - ls.escort.x) ** 2 + (ls.tug.y - ls.escort.y) ** 2);
      const towAlpha = Math.max(0.15, Math.min(0.8, 1 - towDist / 300));
      ctx.setLineDash([5, 3]);
      ctx.strokeStyle = `rgba(200,180,120,${towAlpha})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(esx, esy);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Distance line
  const { x: csx, y: csy } = toS(ls.cargo.x, ls.cargo.y);
  const dist = Math.sqrt((ls.tug.x - ls.cargo.x) ** 2 + (ls.tug.y - ls.cargo.y) ** 2);
  if (!ls.cargo.sunk && dist < 220 && csy > horizY) {
    const col =
      dist < 65
        ? "rgba(255,50,30,0.7)"
        : dist < 130
          ? "rgba(255,180,30,0.5)"
          : "rgba(80,150,220,0.28)";
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = col;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(csx, csy);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = col;
    ctx.font = "9px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${Math.round(dist)}m`, (tx + csx) / 2, (ty + csy) / 2 - 4);
  }

  // Rain
  if (w.rain) {
    ctx.strokeStyle = "rgba(150,185,225,0.3)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 80; i++) {
      const rx = (i * 137 + ls.time * 220) % CW;
      const ry = horizY + ((i * 97 + ls.time * 310) % (CH - horizY));
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx + 3, ry + 12);
      ctx.stroke();
    }
  }

  // Fog — single smooth gradient covering the whole canvas, no banding
  if (w.fog > 0) {
    const f = w.fog;
    const hn = horizY / CH;
    const fg = ctx.createLinearGradient(0, 0, 0, CH);
    fg.addColorStop(0,           `rgba(158,175,188,${f * 0.32})`); // sky top
    fg.addColorStop(hn * 0.7,    `rgba(160,178,192,${f * 0.42})`); // upper sky
    fg.addColorStop(hn,          `rgba(162,180,193,${f * 0.68})`); // horizon peak
    fg.addColorStop(hn + 0.10,   `rgba(160,178,190,${f * 0.55})`); // just below horizon
    fg.addColorStop(hn + 0.30,   `rgba(158,175,188,${f * 0.42})`);
    fg.addColorStop(1,           `rgba(155,172,185,${f * 0.30})`); // foreground
    ctx.fillStyle = fg;
    ctx.fillRect(0, 0, CW, CH);
  }

  // ── Collision particles ──────────────────────────────────────────────
  for (const p of ls.collisionParticles) {
    const { x: px, y: py } = toS(p.x, p.y);
    if (px < -60 || px > CW + 60 || py < -60 || py > CH + 60) continue;
    const t = p.life;
    ctx.save();
    if (p.type === "splash") {
      // White/blue water droplet — shrinks and fades
      const radius = p.r * (1 - t * 0.6);
      ctx.globalAlpha = Math.max(0, 1 - t * 1.1);
      const sg = ctx.createRadialGradient(px, py, 0, px, py, radius);
      sg.addColorStop(0, "rgba(220,240,255,1)");
      sg.addColorStop(1, "rgba(120,200,255,0)");
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.type === "foam") {
      // Expanding ring that fades
      const radius = p.r + t * 55;
      ctx.globalAlpha = Math.max(0, (1 - t) * 0.7);
      ctx.strokeStyle = "rgba(200,230,255,0.9)";
      ctx.lineWidth = Math.max(0.5, 3 * (1 - t));
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.stroke();
      // Inner fill
      ctx.globalAlpha *= 0.15;
      ctx.fillStyle = "rgba(200,230,255,1)";
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Debris chunk — brown/gray, tumbles and fades
      ctx.globalAlpha = Math.max(0, 1 - t * 0.9);
      ctx.fillStyle = t < 0.4 ? "#8a7050" : "#6a5838";
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(t * Math.PI * 4 + p.id * 0.8);
      const s = p.r * (1 - t * 0.5);
      ctx.fillRect(-s * 0.7, -s * 0.4, s * 1.4, s * 0.8);
      ctx.restore();
    }
    ctx.restore();
  }

  // ── Screen flash (red on collision) ─────────────────────────────────
  if (ls.screenFlash > 0) {
    // end the shake translate before drawing the full-screen overlay
    ctx.restore();
    ctx.fillStyle = `rgba(255,60,30,${ls.screenFlash * 0.38})`;
    ctx.fillRect(0, 0, CW, CH);
    // Vignette pulse
    const vg = ctx.createRadialGradient(CW / 2, CH / 2, CH * 0.1, CW / 2, CH / 2, CH * 0.85);
    vg.addColorStop(0, "rgba(255,0,0,0)");
    vg.addColorStop(1, `rgba(200,0,0,${ls.screenFlash * 0.55})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, CW, CH);
    // "COLLISION" text
    if (ls.screenFlash > 0.5) {
      ctx.fillStyle = `rgba(255,220,200,${(ls.screenFlash - 0.5) * 2})`;
      ctx.font = "bold 22px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("COLLISION", CW / 2, CH / 2 - 10);
    }
  } else {
    ctx.restore(); // end the shake translate
  }

  // Zone badge
  const zc =
    ls.zone === "port"
      ? "#ffaa60"
      : ls.zone === "channel"
        ? "#50a0e8"
        : ls.zone === "sea_lanes"
          ? "#60c0ff"
          : ls.zone === "harbour_entry"
            ? "#ffcc40"
            : "#40cc80";
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.fillRect(CW / 2 - 72, 7, 144, 22);
  ctx.fillStyle = zc;
  ctx.font = "bold 10px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(ls.zone.replace(/_/g, " ").toUpperCase(), CW / 2, 22);
}

