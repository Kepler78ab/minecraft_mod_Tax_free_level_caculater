import { html } from "htm/preact";

/** 本地原版贴图（minecraft-assets），见 assets/img/ATTRIBUTION.txt */
export const IMG = {
  guiAnvil: "./assets/img/gui_anvil.png?v=3",
  guiEnchant: "./assets/img/gui_enchant.png",
  enchantBook: "./assets/img/enchant_book_gui.png",
  iconAnvil: "./assets/img/icon_anvil.png",
  iconEnchant: "./assets/img/icon_enchant.png",
  iconGrass: "./assets/img/icon_grass.png",
  book: "./assets/img/book.png",
  enchantedBook: "./assets/img/enchanted_book.png",
  lapis: "./assets/img/lapis.png",
  xpBottle: "./assets/img/xp_bottle.png",
  grassSide: "./assets/img/grass_side.png",
  xpBarBg: "./assets/img/xp_bar_bg.png",
  xpBarFill: "./assets/img/xp_bar_fill.png",
  /** Standard Galactic Alphabet 字形图（仅 A–Z） */
  asciiSga: "./assets/img/ascii_sga.png",
};

export const XP_BAR_W = 182;
export const XP_BAR_H = 5;

/** 原版 EnchantmentNameParts 词表（仅装饰，与真实附魔无关） */
const SGA_WORDS = [
  "air", "animal", "baguette", "ball", "beast", "berata", "bless", "cold",
  "creature", "cthulhu", "cube", "curse", "darkness", "demon", "destroy", "dry",
  "earth", "elder", "elemental", "embiggen", "enchant", "fhtagn", "fiddle", "fire",
  "free", "fresh", "galvanize", "grow", "hot", "humanoid", "ignite", "imbue",
  "inside", "klaatu", "light", "limited", "mental", "mglwnafh", "niktu", "of",
  "other", "phnglui", "physical", "range", "rlyeh", "scrolls", "self", "shorten",
  "shrink", "snuff", "sphere", "spirit", "stale", "stretch", "the", "towards",
  "twist", "undead", "water", "wet", "wgahnagl", "xyzzy",
];

/** 悬停提示用的「……？」示意附魔名（计算器不解析真实附魔） */
const HINT_ENCHANTS = [
  "Sharpness IV",
  "Protection IV",
  "Efficiency V",
  "Unbreaking III",
  "Power V",
  "Fortune III",
  "Looting III",
  "Mending",
  "Silk Touch",
  "Flame",
];

export const ITEM_POOL = {
  weapons: [
    "./assets/img/diamond_sword.png",
    "./assets/img/iron_sword.png",
    "./assets/img/netherite_sword.png",
    "./assets/img/bow.png",
    "./assets/img/crossbow.png",
    "./assets/img/trident.png",
  ],
  tools: [
    "./assets/img/diamond_pickaxe.png",
    "./assets/img/iron_pickaxe.png",
    "./assets/img/netherite_pickaxe.png",
    "./assets/img/diamond_axe.png",
  ],
  armor: [
    "./assets/img/iron_chestplate.png",
    "./assets/img/diamond_helmet.png",
  ],
  books: ["./assets/img/enchanted_book.png", "./assets/img/book.png"],
  misc: ["./assets/img/golden_apple.png", "./assets/img/name_tag.png", "./assets/img/xp_bottle.png"],
};

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function McImg({ src, alt = "", size = 32, className = "" }) {
  return html`
    <img
      class=${`mc-pixel ${className}`}
      src=${src}
      alt=${alt}
      width=${size}
      height=${size}
      draggable=${false}
    />
  `;
}

export function ModeIcon({ mode, size = 52 }) {
  if (mode === "enchant") {
    return html`<${McImg} src=${IMG.iconEnchant} size=${size} alt="Enchanting table" />`;
  }
  return html`<${McImg} src=${IMG.iconAnvil} size=${size} alt="Anvil" />`;
}

/** 原版词表拼成装饰性咒语；截到约两行（每行 ~8 个 8px 字形） */
export function randomSgaPhrase(maxLen = 16) {
  const n = 3 + Math.floor(Math.random() * 3);
  let text = "";
  for (let i = 0; i < n; i++) {
    const w = pick(SGA_WORDS);
    if (text.length && text.length + w.length > maxLen) break;
    text += w;
    if (text.length >= maxLen) break;
  }
  return text.slice(0, maxLen);
}

export function randomEnchantHint() {
  return `${pick(HINT_ENCHANTS)} ?`;
}

/** 用 ascii_sga.png 按原版 8×8 格子画 A–Z（空格留白） */
export function SgaText({ text, scale = 1, className = "" }) {
  const glyphs = [];
  const src = String(text || "").toUpperCase();
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch < "A" || ch > "Z") {
      glyphs.push(
        html`<span
          key=${i}
          class="sga-space"
          style=${{ width: `${4 * scale}px`, height: `${8 * scale}px` }}
        ></span>`
      );
      continue;
    }
    const code = ch.charCodeAt(0);
    const bx = (code % 16) * 8;
    const by = Math.floor(code / 16) * 8;
    const pos = `-${bx * scale}px -${by * scale}px`;
    const size = `${128 * scale}px ${128 * scale}px`;
    glyphs.push(
      html`<span
        key=${i}
        class="sga-glyph"
        style=${{
          width: `${8 * scale}px`,
          height: `${8 * scale}px`,
          WebkitMaskImage: `url(${IMG.asciiSga})`,
          maskImage: `url(${IMG.asciiSga})`,
          WebkitMaskPosition: pos,
          maskPosition: pos,
          WebkitMaskSize: size,
          maskSize: size,
        }}
      ></span>`
    );
  }
  return html`<span class=${`sga-text ${className}`}>${glyphs}</span>`;
}

export function randomAnvilTrio() {
  const gear = [...ITEM_POOL.weapons, ...ITEM_POOL.tools, ...ITEM_POOL.armor];
  const left = pick(gear);
  const right = Math.random() < 0.7 ? pick(ITEM_POOL.books) : pick(gear);
  return { left, right, out: left };
}

export function randomEnchantPair() {
  const gear = [...ITEM_POOL.weapons, ...ITEM_POOL.tools, ...ITEM_POOL.armor];
  return { item: pick(gear), lapis: IMG.lapis };
}

/** 三条附魔选项：SGA 文案 + 悬停提示 */
export function randomEnchantOptions() {
  return [0, 1, 2].map(() => ({
    phrase: randomSgaPhrase(),
    hint: randomEnchantHint(),
  }));
}
