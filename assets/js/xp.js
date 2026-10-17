/**
 * Minecraft XP + Tax Free Levels (vanilla 1.8+ curve).
 * Integer-safe cumulative XP. Web source of truth for 0.1.0+.
 */

export const MODE_ANVIL = "anvil";
export const MODE_ENCHANT = "enchant";
export const MODE_BASE30 = "base30";

export function xpToNext(level) {
  if (level < 0) throw new Error("level_neg");
  if (level <= 15) return 2 * level + 7;
  if (level <= 30) return 5 * level - 38;
  return 9 * level - 158;
}

export function totalXp(level) {
  if (level < 0) throw new Error("level_neg");
  if (level <= 16) return level * level + 6 * level;
  if (level <= 31) return Math.floor((5 * level * level - 81 * level) / 2) + 360;
  return Math.floor((9 * level * level - 325 * level) / 2) + 2220;
}

export function playerTotalXp(level, progress) {
  return totalXp(level) + progress;
}

export function levelAndProgressFromTotal(total) {
  if (total <= 0) return { level: 0, progress: 0 };
  let lo = 0;
  let hi = 1;
  while (totalXp(hi) <= total) {
    hi *= 2;
    if (hi > 1_000_000) break;
  }
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (totalXp(mid) <= total) lo = mid;
    else hi = mid - 1;
  }
  return { level: lo, progress: total - totalXp(lo) };
}

export function maxProgressAtLevel(level) {
  return Math.max(0, xpToNext(level) - 1);
}

/** 将进度钳制到本级合法范围 [0, xpToNext(level)-1] */
export function clampProgress(level, progress) {
  const max = maxProgressAtLevel(level);
  const p = Number(progress);
  if (!Number.isFinite(p) || p < 0) return 0;
  return Math.min(max, Math.floor(p));
}

/**
 * 单点进度扣费（Tab1 主结果）。
 * @returns {{ exact, start, end, pay }}
 */
export function applyAtProgress(curLevel, progress, costLevels, mode, enchantReq = 30) {
  const pay = modPayXp(costLevels, mode, enchantReq);
  const prog = clampProgress(curLevel, progress);
  const exact = applyDeduction(curLevel, prog, pay);
  const start = applyDeduction(curLevel, 0, pay);
  const end = applyDeduction(curLevel, maxProgressAtLevel(curLevel), pay);
  return { exact, start, end, pay };
}

export function modPayXp(costLevels, mode, enchantReq = 30) {
  if (costLevels < 0) throw new Error("cost_neg");
  if (mode === MODE_ANVIL) return totalXp(costLevels) - totalXp(0);
  if (mode === MODE_BASE30) {
    const start = Math.max(0, 30 - costLevels);
    return totalXp(30) - totalXp(start);
  }
  if (mode === MODE_ENCHANT) {
    if (enchantReq < 0) throw new Error("enchant_neg");
    const start = Math.max(0, enchantReq - costLevels);
    return totalXp(enchantReq) - totalXp(start);
  }
  throw new Error("unknown_mode");
}

export function applyDeduction(level, progress, payXp) {
  const beforeTotal = playerTotalXp(level, progress);
  const afterTotal = Math.max(0, beforeTotal - payXp);
  const after = levelAndProgressFromTotal(afterTotal);
  return {
    beforeLevel: level,
    beforeProgress: progress,
    beforeTotal,
    payXp,
    afterLevel: after.level,
    afterProgress: after.progress,
    afterTotal,
    deltaLevel: level - after.level,
    deltaProgress: progress - after.progress,
    actualSpent: beforeTotal - afterTotal,
  };
}

export function computeBoundaries(curLevel, costLevels, mode, enchantReq) {
  const pay = modPayXp(costLevels, mode, enchantReq);
  const start = applyDeduction(curLevel, 0, pay);
  const end = applyDeduction(curLevel, maxProgressAtLevel(curLevel), pay);
  return { start, end, pay };
}

export function modAfterLevelAvg(curLevel, costLevels, mode, enchantReq) {
  const { start, end } = computeBoundaries(curLevel, costLevels, mode, enchantReq);
  return (start.afterLevel + end.afterLevel) / 2;
}

export function buildLevelHLines(lv, costLevels, mode, enchantReq) {
  return {
    yNone: lv,
    yVanilla: Math.max(0, lv - costLevels),
    yMod: modAfterLevelAvg(lv, costLevels, mode, enchantReq),
  };
}

function sampleLevels(levelMin, levelMax) {
  if (levelMin < 0 || levelMax < 0) throw new Error("level_neg");
  if (levelMin > levelMax) throw new Error("range_order");
  const span = levelMax - levelMin;
  if (span > 5000) throw new Error("range_too_large");

  let step = 1;
  if (span > 400) step = Math.ceil(span / 400);

  const xs = [];
  for (let x = levelMin; x <= levelMax; x += step) xs.push(x);
  if (xs[xs.length - 1] !== levelMax) xs.push(levelMax);
  return { xs, step };
}

/**
 * Tab2 扫掠曲线（双边界平均，兼容/自检）：
 * - y = lv（未扣除）
 * - y = max(0, lv - lv_cost)（不使用模组）
 * - y = f(lv)（使用模组，双边界平均）
 */
export function buildCurveSeries(levelMin, levelMax, costLevels, mode, enchantReq) {
  const { xs, step } = sampleLevels(levelMin, levelMax);
  const yNone = xs.map((x) => x);
  const yVanilla = xs.map((x) => Math.max(0, x - costLevels));
  const yMod = xs.map((x) => modAfterLevelAvg(x, costLevels, mode, enchantReq));
  return { xs, yNone, yVanilla, yMod, step };
}

/**
 * Tab2 扫掠曲线（与 Tab1 同口径）：各 lv 使用同一进度的 applyAtProgress。
 */
export function buildCurveSeriesExact(
  levelMin,
  levelMax,
  costLevels,
  mode,
  enchantReq,
  progress
) {
  const { xs, step } = sampleLevels(levelMin, levelMax);
  const yNone = xs.map((x) => x);
  const yVanilla = xs.map((x) => Math.max(0, x - costLevels));
  const yMod = xs.map(
    (x) => applyAtProgress(x, progress, costLevels, mode, enchantReq).exact.afterLevel
  );
  return { xs, yNone, yVanilla, yMod, step };
}

/** Return null if OK, else failed assertion message. */
export function selfCheck() {
  const checks = [
    [totalXp(0), 0],
    [totalXp(1), 7],
    [totalXp(16), 352],
    [totalXp(30), 1395],
    [totalXp(31), 1507],
    [totalXp(35), 2045],
    [xpToNext(0), 7],
    [xpToNext(16), 42],
    [xpToNext(31), 121],
    [modPayXp(35, MODE_ANVIL), 2045],
    [modPayXp(3, MODE_ENCHANT, 30), totalXp(30) - totalXp(27)],
    [modPayXp(3, MODE_BASE30), totalXp(30) - totalXp(27)],
  ];
  for (const [got, want] of checks) {
    if (got !== want) return `expected ${want}, got ${got}`;
  }
  const p = levelAndProgressFromTotal(1395);
  if (p.level !== 30 || p.progress !== 0) return "levelAndProgressFromTotal(1395) failed";
  const h = buildLevelHLines(46, 3, MODE_ANVIL, 30);
  if (h.yNone !== 46 || h.yVanilla !== 43) return "buildLevelHLines failed";
  const c = buildCurveSeries(10, 12, 3, MODE_ANVIL, 30);
  if (c.xs.join(",") !== "10,11,12") return "buildCurveSeries xs failed";
  if (c.yVanilla.join(",") !== "7,8,9") return "buildCurveSeries vanilla failed";
  const a = applyAtProgress(46, 0, 3, MODE_ANVIL, 30);
  if (a.exact.afterLevel !== a.start.afterLevel) return "applyAtProgress start mismatch";
  if (a.pay !== modPayXp(3, MODE_ANVIL)) return "applyAtProgress pay mismatch";
  const ce = buildCurveSeriesExact(10, 12, 3, MODE_ANVIL, 30, 0);
  if (ce.xs.join(",") !== "10,11,12") return "buildCurveSeriesExact xs failed";
  const expect10 = applyAtProgress(10, 0, 3, MODE_ANVIL, 30).exact.afterLevel;
  if (ce.yMod[0] !== expect10) return "buildCurveSeriesExact yMod failed";
  return null;
}
