import {
  CH,
  CW,
  DOCK_A_CENTER_X,
  DOCK_B_CENTER_X,
  DOCK_WATERLINE_Y,
  PATH_END_X,
  PORT_BASIN_START_X,
  WEATHER_CFG,
  type WeatherKey,
} from "./constants";
import type { LocalState } from "./types";

export function render(ctx: CanvasRenderingContext2D, ls: LocalState, weather: WeatherKey) {
  const w = WEATHER_CFG[weather] ?? WEATHER_CFG.clear;
  // Horizon: a bit lower → more water area below (longer “sea” on screen)
  const horizY = CH * 0.36;
  const toS = (wx: number, wy: number) => ({ x: wx - ls.cam.x + CW / 2, y: wy - ls.cam.y + CH / 2 });

  // Sky
  const sky = ctx.createLinearGradient(0, 0, 0, horizY);
  sky.addColorStop(0, w.sky[0]);
  sky.addColorStop(1, w.sky[1]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, CW, horizY);

  // Mountains
  [
    [-80, 300, 200, "#3d5060", 48],
    [200, 280, 190, "#4a5a6a", 40],
    [460, 310, 215, "#3d5060", 52],
    [720, 270, 195, "#4a5a6a", 43],
    [980, 295, 205, "#3d5060", 46],
  ].forEach(([mx, mw, mh, mc, ms]) => {
    const sx = (((mx as number) - ls.cam.x * 0.04 + CW / 2 - 100 + 5000) % (CW + 400)) - 150;
    ctx.fillStyle = mc as string;
    ctx.beginPath();
    ctx.moveTo(sx, horizY);
    ctx.lineTo(sx + (mw as number) / 2, horizY - (mh as number));
    ctx.lineTo(sx + (mw as number), horizY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(240,246,252,0.82)";
    ctx.beginPath();
    ctx.moveTo(sx + (mw as number) / 2, horizY - (mh as number));
    ctx.lineTo(sx + (mw as number) / 2 - (ms as number), horizY - (mh as number) + (ms as number) * 1.5);
    ctx.lineTo(sx + (mw as number) / 2 + (ms as number), horizY - (mh as number) + (ms as number) * 1.5);
    ctx.closePath();
    ctx.fill();
  });

  // Buildings
  [
    [830, 26, 125, "#1e3048"],
    [860, 22, 92, "#2a3f5a"],
    [885, 34, 148, "#2d4460"],
    [922, 22, 106, "#1e3048"],
    [948, 28, 124, "#2a3f5a"],
    [1510, 24, 102, "#1e3048"],
    [1538, 36, 144, "#2d4460"],
    [1578, 20, 82, "#2a3f5a"],
  ].forEach(([bwx, bw, bh, bc]) => {
    const { x: bx } = toS(bwx as number, 0);
    if (bx < -50 || bx > CW + 50) return;
    ctx.fillStyle = bc as string;
    ctx.fillRect(bx, horizY - (bh as number) + 8, bw as number, (bh as number) - 8);
    ctx.fillStyle = "rgba(255,224,100,0.25)";
    for (let ry = horizY - (bh as number) + 14; ry < horizY - 4; ry += 10) {
      for (let rx = bx + 3; rx < bx + (bw as number) - 3; rx += 7) {
        if (Math.sin(rx * 2.7 + ry * 1.9) > 0.1) ctx.fillRect(rx, ry, 4, 5);
      }
    }
  });

  // Water
  const wg = ctx.createLinearGradient(0, horizY, 0, CH);
  wg.addColorStop(0, w.water[0]);
  wg.addColorStop(1, w.water[1]);
  ctx.fillStyle = wg;
  ctx.fillRect(0, horizY, CW, CH - horizY);

  // Waves
  for (let i = 0; i < 12; i++) {
    const wy = horizY + 14 + i * 17 + Math.sin(ls.time * 0.7 + i) * w.waves * 5;
    const wx = (i * 173 - ls.cam.x * 0.12 + 9000) % CW;
    ctx.strokeStyle = `rgba(255,255,255,${0.06 * w.waves})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(wx, wy);
    ctx.bezierCurveTo(wx + 16, wy - 2, wx + 36, wy + 2, wx + 60, wy);
    ctx.stroke();
  }

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

  const wy = DOCK_WATERLINE_Y;
  const pierH = 11;
  const w2 = 190;
  const w1 = 280;
  const gap = 20;
  const drawDock = (centerX: number, dockName: string) => {
    const total = w1 + gap + w2;
    const x1 = centerX - total / 2;
    const x2 = x1 + w1 + gap;
    (
      [
        [x1, w1, "#5d4d38"],
        [x2, w2, "#4d3d28"],
      ] as const
    ).forEach(([wx0, ww, dc]) => {
      const a = toS(wx0, wy);
      const b = toS(wx0 + ww, wy);
      if (b.x < -100 || a.x > CW + 100) return;
      const py = a.y - pierH;
      const pw = Math.max(8, b.x - a.x);
      ctx.fillStyle = "rgba(0,25,45,0.28)";
      ctx.fillRect(a.x - 1, py + pierH - 1, pw + 2, 5);
      ctx.fillStyle = dc;
      ctx.fillRect(a.x, py, pw, pierH);
      ctx.strokeStyle = "rgba(255,255,255,0.14)";
      ctx.strokeRect(a.x + 0.5, py + 0.5, pw - 1, pierH - 1);
      ctx.fillStyle = "rgba(35,48,58,0.82)";
      for (let px = a.x + 12; px < a.x + pw; px += 22) {
        ctx.fillRect(px, py + pierH, 3, 16);
      }
    });
    const bwx = x2 + w2 / 2;
    const { x: bx, y: by } = toS(bwx, wy);
    if (bx > -80 && bx < CW + 80) {
      ctx.strokeStyle = "rgba(255,220,50,0.85)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(bx - 28, by - 26, 56, 36);
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(255,220,50,0.1)";
      ctx.fillRect(bx - 28, by - 26, 56, 36);
      ctx.fillStyle = "rgba(255,220,50,0.95)";
      ctx.font = "bold 9px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("BERTH", bx, by - 10);
      ctx.fillStyle = "rgba(255,235,180,0.9)";
      ctx.font = "bold 8px sans-serif";
      ctx.fillText(dockName, bx, by + 6);
    }
    const cxw = x1 + w1 + gap / 2;
    const { x: crx, y: cry } = toS(cxw, wy);
    if (crx > -50 && crx < CW + 50) {
      ctx.fillStyle = "#5a5040";
      ctx.fillRect(crx - 4, cry - 72, 8, 72);
      ctx.fillRect(crx - 4, cry - 72, 58, 5);
      ctx.strokeStyle = "#4a4030";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(crx + 54, cry - 68);
      ctx.lineTo(crx + 54, cry - 10);
      ctx.stroke();
    }
  };

  drawDock(DOCK_A_CENTER_X, "DOCK A");
  drawDock(DOCK_B_CENTER_X, "DOCK B");

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
    if (sx < -80 || sx > CW + 80 || sy < horizY - 10 || sy > CH + 120) return;
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
    ctx.fillStyle = hull;
    ctx.beginPath();
    ctx.moveTo(0, -len);
    ctx.lineTo(wid * 0.85, -len * 0.1);
    ctx.lineTo(wid, len * 0.55);
    ctx.lineTo(-wid, len * 0.55);
    ctx.lineTo(-wid * 0.85, -len * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = cabin;
    ctx.fillRect(-wid * 0.5, -len * 0.2, wid, len * 0.55);
    ctx.restore();
    ctx.globalAlpha = 1;
    if (lbl.length > 0 && st < 0.85) {
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.font = "9px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(lbl, sx, sy + len + 13);
    }
  };

  drawShip(ls.cargo.x, ls.cargo.y, ls.cargo.heading, 40, 17, "#3a5a78", "#4a6a88", "", ls.cargo.speed, ls.cargo.sinkT, false);
  drawShip(ls.ferry.x, ls.ferry.y, ls.ferry.heading, 32, 14, "#5a7a9a", "#6a8aaa", "", ls.ferry.speed, ls.ferry.sinkT, false);
  ls.fishers.forEach((f) => drawShip(f.x, f.y, f.heading, 13, 5, "#6a5030", "#8a7050", "", f.speed, f.sinkT, true));
  ls.traffic.forEach((t) => drawShip(t.x, t.y, t.heading, 22, 9, "#4a5868", "#5a6878", "", t.speed, t.sinkT, true));

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

  // Distance line
  const { x: csx, y: csy } = toS(ls.cargo.x, ls.cargo.y);
  const dist = Math.sqrt((ls.tug.x - ls.cargo.x) ** 2 + (ls.tug.y - ls.cargo.y) ** 2);
  if (!ls.cargo.sunk && dist < 220) {
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

  // Fog
  if (w.fog > 0) {
    const fg = ctx.createLinearGradient(0, horizY, 0, horizY + 90);
    fg.addColorStop(0, "rgba(160,180,190,0)");
    fg.addColorStop(1, `rgba(160,180,190,${w.fog})`);
    ctx.fillStyle = fg;
    ctx.fillRect(0, horizY, CW, 90);
    if (w.fog > 0.5) {
      ctx.fillStyle = `rgba(160,180,190,${w.fog * 0.28})`;
      ctx.fillRect(0, 0, CW, CH);
    }
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

