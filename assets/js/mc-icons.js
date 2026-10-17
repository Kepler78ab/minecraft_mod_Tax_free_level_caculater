import { html } from "htm/preact";

/** 本地原版贴图（minecraft-assets 1.20.4），见 assets/img/ATTRIBUTION.txt */
export const IMG = {
  guiAnvil: "./assets/img/gui_anvil.png",
  guiEnchant: "./assets/img/gui_enchant.png",
  iconAnvil: "./assets/img/icon_anvil.png",
  iconEnchant: "./assets/img/icon_enchant.png",
  iconGrass: "./assets/img/icon_grass.png",
  book: "./assets/img/book.png",
  enchantedBook: "./assets/img/enchanted_book.png",
  lapis: "./assets/img/lapis.png",
  xpBottle: "./assets/img/xp_bottle.png",
  grassSide: "./assets/img/grass_side.png",
};

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

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** 随机生成铁砧三格物品（左=装备，右=书/材料，出=左装备） */
export function randomAnvilTrio() {
  const gear = [...ITEM_POOL.weapons, ...ITEM_POOL.tools, ...ITEM_POOL.armor];
  const left = pick(gear);
  const right = Math.random() < 0.7 ? pick(ITEM_POOL.books) : pick(gear);
  return { left, right, out: left };
}

/** 附魔台：物品 + 青金石 */
export function randomEnchantPair() {
  const gear = [...ITEM_POOL.weapons, ...ITEM_POOL.tools, ...ITEM_POOL.armor];
  return { item: pick(gear), lapis: IMG.lapis };
}
