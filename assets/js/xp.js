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
  return null;
}
