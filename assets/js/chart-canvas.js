/**
 * Lightweight horizontal-line chart (no Chart.js / no CDN).
 */

const COLORS = {
  none: "#2ca02c",
  vanilla: "#d62728",
  mod: "#1f77b4",
  text: "#e7ecf3",
  muted: "#9aa8bc",
  grid: "rgba(255,255,255,0.08)",
  bg: "#121a26",
};

function fitCanvas(canvas) {
  const parent = canvas.parentElement;
  const cssW = Math.max(280, parent?.clientWidth || 400);
  const cssH = Math.max(260, parent?.clientHeight || 320);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: cssW, h: cssH };
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{
 *   title: string,
 *   ylabel: string,
 *   legends: { none: string, vanilla: string, mod: string },
 *   yNone: number,
 *   yVanilla: number,
 *   yMod: number,
 *   empty?: boolean,
 * }} payload
 */
export function drawHLineChart(canvas, payload) {
  if (!canvas || !payload) return;
  const { ctx, w, h } = fitCanvas(canvas);

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, w, h);

  const pad = { top: 42, right: 56, bottom: 56, left: 52 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  const empty = Boolean(payload.empty);
  const yNone = Number(payload.yNone);
  const yVanilla = Number(payload.yVanilla);
  const yMod = Number(payload.yMod);
  const vals = empty ? [0, 10] : [yNone, yVanilla, yMod];
  let yLo = Math.min(...vals);
  let yHi = Math.max(...vals);
  if (yHi <= yLo) {
    yLo = Math.max(0, yLo - 2);
    yHi = yLo + 4;
  } else {
    const spanPad = Math.max(2, (yHi - yLo) * 0.15);
    yLo = Math.max(0, yLo - spanPad);
    yHi = yHi + spanPad;
  }

  const yToPx = (y) => pad.top + ((yHi - y) / (yHi - yLo)) * plotH;

  // title
  const title = (payload && payload.title) || "—";
  ctx.fillStyle = COLORS.text;
  ctx.font = "600 14px Segoe UI, Microsoft YaHei, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(title, pad.left, 22);

  // plot frame
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.strokeRect(pad.left, pad.top, plotW, plotH);

  // y grid + labels
  const ticks = 5;
  ctx.font = "12px Consolas, monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= ticks; i++) {
    const y = yLo + ((yHi - yLo) * i) / ticks;
    const py = yToPx(y);
    ctx.strokeStyle = COLORS.grid;
    ctx.beginPath();
    ctx.moveTo(pad.left, py);
    ctx.lineTo(pad.left + plotW, py);
    ctx.stroke();
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(String(Math.round(y * 10) / 10), pad.left - 8, py);
  }

  // ylabel
  ctx.save();
  ctx.translate(16, pad.top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.fillStyle = COLORS.muted;
  ctx.font = "12px Segoe UI, Microsoft YaHei, sans-serif";
  ctx.fillText(payload.ylabel || "", 0, 0);
  ctx.restore();

  if (empty) {
    ctx.fillStyle = COLORS.muted;
    ctx.font = "13px Segoe UI, Microsoft YaHei, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(payload.title || "—", pad.left + plotW / 2, pad.top + plotH / 2);
    return;
  }

  const x0 = pad.left + 8;
  const x1 = pad.left + plotW - 8;

  function hline(y, color, labelRight) {
    const py = yToPx(y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x0, py);
    ctx.lineTo(x1, py);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = "12px Consolas, monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(String(Math.round(y * 100) / 100), x1 + 6, py);
    void labelRight;
  }

  hline(yNone, COLORS.none);
  hline(yVanilla, COLORS.vanilla);
  hline(yMod, COLORS.mod);

  // legend
  const legendItems = [
    { color: COLORS.none, text: payload.legends.none },
    { color: COLORS.vanilla, text: payload.legends.vanilla },
    { color: COLORS.mod, text: payload.legends.mod },
  ];
  let lx = pad.left;
  const ly = h - 18;
  ctx.font = "12px Segoe UI, Microsoft YaHei, sans-serif";
  ctx.textBaseline = "middle";
  for (const item of legendItems) {
    ctx.fillStyle = item.color;
    ctx.fillRect(lx, ly - 5, 14, 10);
    lx += 18;
    ctx.fillStyle = COLORS.muted;
    ctx.textAlign = "left";
    ctx.fillText(item.text, lx, ly);
    lx += ctx.measureText(item.text).width + 16;
  }
}
