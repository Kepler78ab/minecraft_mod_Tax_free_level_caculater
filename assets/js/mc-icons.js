import { html } from "htm/preact";

/** 本地原版贴图（来自 minecraft-assets，见 assets/img/ATTRIBUTION.txt） */
const IMG = {
  anvil: "./assets/img/anvil.png",
  anvilTop: "./assets/img/anvil_top.png",
  enchantTop: "./assets/img/enchant_top.png",
  enchantSide: "./assets/img/enchant_side.png",
  book: "./assets/img/book.png",
  lapis: "./assets/img/lapis.png",
  xpBottle: "./assets/img/xp_bottle.png",
};

export function McImg({ src, alt = "", size = 48, className = "" }) {
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
    return html`
      <span class="mode-icon-stack" style=${{ width: size, height: size }}>
        <${McImg} src=${IMG.enchantTop} size=${size} alt="Enchanting table" />
        <${McImg}
          src=${IMG.lapis}
          size=${Math.round(size * 0.38)}
          className="mode-icon-badge"
          alt=""
        />
      </span>
    `;
  }
  if (mode === "base30") {
    return html`
      <span class="mode-icon-stack" style=${{ width: size, height: size }}>
        <${McImg} src=${IMG.anvil} size=${size} alt="Level base 30" />
        <span class="mode-icon-num">30</span>
      </span>
    `;
  }
  return html`<${McImg} src=${IMG.anvilTop} size=${size} alt="Anvil" />`;
}

export { IMG };
