import { html } from "htm/preact";
import { render } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";

import { drawCurveChart, drawHLineChart } from "./chart-canvas.js";
import { createI18n, getSavedLang, loadLang, saveLang } from "./i18n.js";
import {
  IMG,
  McImg,
  ModeIcon,
  SgaText,
  XP_BAR_H,
  XP_BAR_W,
  randomAnvilTrio,
  randomEnchantOptions,
  randomEnchantPair,
} from "./mc-icons.js";
import {
  MODE_ANVIL,
  MODE_ENCHANT,
  applyAtProgress,
  buildCurveSeries,
  buildLevelHLines,
  clampProgress,
  computeBoundaries,
  levelAndProgressFromTotal,
  maxProgressAtLevel,
  modPayXp,
  selfCheck,
  xpToNext,
} from "./xp.js";

const MODES = [MODE_ANVIL, MODE_ENCHANT];
const GUI_SCALE = 2;
const LANGS = [
  { code: "zh_CN", name: "中文" },
  { code: "en_US", name: "English" },
];

function parseNonNegInt(raw, name, t) {
  const s = String(raw ?? "").trim();
  if (!s) throw new Error(t("errors.empty", { name }));
  if (!/^-?\d+$/.test(s)) throw new Error(t("errors.not_int", { name }));
  const v = Number(s);
  if (v < 0) throw new Error(t("errors.negative", { name }));
  return v;
}

function translateLogicError(e, t) {
  const key = String(e.message || e);
  const map = {
    range_order: "errors.range_order",
    range_too_large: "errors.range_too_large",
    level_neg: "errors.negative",
  };
  if (map[key]) return t(map[key], { name: t("errors.name_level") });
  return key;
}

function fmtBlock(t, headerKey, r) {
  return (
    t(headerKey) +
    "\n" +
    t("result.block", {
      beforeLevel: r.beforeLevel,
      beforeProgress: r.beforeProgress,
      beforeTotal: r.beforeTotal,
      payXp: r.payXp,
      afterLevel: r.afterLevel,
      afterProgress: r.afterProgress,
      afterTotal: r.afterTotal,
      deltaLevel: r.deltaLevel,
      deltaProgress: r.deltaProgress,
      actualSpent: r.actualSpent,
    })
  );
}

function progressPctOf(level, progress) {
  const need = xpToNext(level);
  if (need <= 0) return 0;
  return Math.max(0, Math.min(100, (Number(progress) / need) * 100));
}

function buildResultText(t, curLevel, progress, cost, mode, enchantReq, exact, start, end, pay) {
  const avgDeltaLevel = (start.deltaLevel + end.deltaLevel) / 2;
  const avgDeltaProgress = (start.deltaProgress + end.deltaProgress) / 2;
  const avgSpent = (start.actualSpent + end.actualSpent) / 2;
  const avgAfterTotal = (start.afterTotal + end.afterTotal) / 2;
  const remain = levelAndProgressFromTotal(Math.round(avgAfterTotal));
  const noModAfter = Math.max(0, curLevel - cost);
  const withModExact = exact.afterLevel;
  const modeLabel = t(`mode.${mode}`);

  const lines = [
    t("result.header"),
    t("result.mode", { mode: modeLabel }),
    t("result.level_cost", { level: curLevel, cost }),
    t("result.progress", { progress, need: xpToNext(curLevel) }),
  ];
  if (mode === MODE_ENCHANT) {
    lines.push(t("result.enchant_req", { req: enchantReq }));
  }
  lines.push(
    t("result.pay_xp", { pay }),
    t("result.bar_full", {
      need: xpToNext(curLevel),
      endProg: maxProgressAtLevel(curLevel),
    }),
    "",
    fmtBlock(t, "result.exact_header", exact),
    "",
    t("result.boundary_ref"),
    fmtBlock(t, "result.start_header", start),
    "",
    fmtBlock(t, "result.end_header", end),
    "",
    t("result.avg_header"),
    t("result.avg_delta_level", { v: avgDeltaLevel.toFixed(2) }),
    t("result.avg_delta_progress", { v: avgDeltaProgress.toFixed(2) }),
    t("result.avg_spent", { v: avgSpent.toFixed(2) }),
    t("result.avg_remain", {
      total: avgAfterTotal.toFixed(2),
      lv: remain.level,
      prog: remain.progress,
    }),
    "",
    t("result.compare_header"),
    t("result.compare_vanilla", {
      after: noModAfter,
      cost,
      delta: curLevel - noModAfter,
    }),
    t("result.compare_mod_exact", {
      after: withModExact,
      delta: exact.deltaLevel,
    }),
    t("result.compare_diff", {
      diff: (withModExact - noModAfter).toFixed(2),
    }),
    t("result.footer"),
  );
  return lines.join("\n");
}

function getChartCtor() {
  return typeof window !== "undefined" ? window.Chart : undefined;
}

function markLinePlugin(markLevel) {
  return {
    id: "markLevelLine",
    afterDraw(chart) {
      if (markLevel == null) return;
      const { ctx, chartArea, scales } = chart;
      const xScale = scales.x;
      if (!xScale || !chartArea) return;
      const labels = chart.data.labels || [];
      let idx = labels.findIndex((v) => Number(v) === Number(markLevel));
      if (idx < 0) {
        // 最近采样点
        let best = -1;
        let bestDist = Infinity;
        labels.forEach((v, i) => {
          const d = Math.abs(Number(v) - Number(markLevel));
          if (d < bestDist) {
            bestDist = d;
            best = i;
          }
        });
        idx = best;
      }
      if (idx < 0) return;
      const x = xScale.getPixelForValue(idx);
      ctx.save();
      ctx.strokeStyle = "#f0c14b";
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#f0c14b";
      ctx.font = "12px Segoe UI, Microsoft YaHei, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`lv=${markLevel}`, x, chartArea.top - 6);
      ctx.restore();
    },
  };
}

/** kind: 'hline' | 'curve' */
function useChart(canvasRef, wrapRef, t, kind) {
  const lastPayloadRef = useRef(null);
  const chartInstRef = useRef(null);
  const tRef = useRef(t);
  const kindRef = useRef(kind);
  tRef.current = t;
  kindRef.current = kind;

  const destroyChartJs = () => {
    if (chartInstRef.current) {
      chartInstRef.current.destroy();
      chartInstRef.current = null;
    }
  };

  const paintHLineChartJs = (canvas, data, tt) => {
    const ChartCtor = getChartCtor();
    if (!ChartCtor) return false;
    const empty = !data;
    const yNone = empty ? 0 : data.yNone;
    const yVanilla = empty ? 0 : data.yVanilla;
    const yMod = empty ? 0 : data.yMod;
    const title = empty
      ? tt("app.plot_title_empty")
      : tt("plot.title", {
          lv: data.lv,
          cost: data.cost,
          mode: data.modeLabel,
        });
    const ys = empty ? [0, 10] : [yNone, yVanilla, yMod];
    const yLo = Math.min(...ys);
    const yHi = Math.max(...ys);
    const pad = yHi > yLo ? Math.max(2, (yHi - yLo) * 0.15) : 2;

    destroyChartJs();
    chartInstRef.current = new ChartCtor(canvas, {
      type: "line",
      data: {
        labels: ["A", "B"],
        datasets: [
          {
            label: empty
              ? tt("plot.legend_none")
              : `${tt("plot.legend_none")} = ${yNone}`,
            data: [yNone, yNone],
            borderColor: "#2ca02c",
            borderWidth: 3,
            pointRadius: 0,
            tension: 0,
          },
          {
            label: empty
              ? tt("plot.legend_vanilla")
              : `${tt("plot.legend_vanilla")} = ${yVanilla}`,
            data: [yVanilla, yVanilla],
            borderColor: "#d62728",
            borderWidth: 3,
            pointRadius: 0,
            tension: 0,
          },
          {
            label: empty
              ? tt("plot.legend_mod")
              : `${tt("plot.legend_mod")} = ${Number(yMod.toFixed(2))}`,
            data: [yMod, yMod],
            borderColor: "#1f77b4",
            borderWidth: 3,
            pointRadius: 0,
            tension: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          title: { display: true, text: title, color: "#e7ecf3", font: { size: 14 } },
          legend: { labels: { color: "#c5d0e0", boxWidth: 16 } },
        },
        scales: {
          x: {
            ticks: { display: false },
            grid: { color: "rgba(255,255,255,0.06)" },
          },
          y: {
            min: Math.max(0, yLo - pad),
            max: yHi + pad,
            title: { display: true, text: tt("plot.ylabel"), color: "#9aa8bc" },
            ticks: { color: "#9aa8bc" },
            grid: { color: "rgba(255,255,255,0.08)" },
          },
        },
      },
    });
    return true;
  };

  const paintCurveChartJs = (canvas, data, tt) => {
    const ChartCtor = getChartCtor();
    if (!ChartCtor || !data?.xs?.length) return false;

    destroyChartJs();
    const allY = [...data.yNone, ...data.yVanilla, ...data.yMod];
    const yLo = Math.min(...allY);
    const yHi = Math.max(...allY);
    const pad = yHi > yLo ? Math.max(2, (yHi - yLo) * 0.08) : 2;

    chartInstRef.current = new ChartCtor(canvas, {
      type: "line",
      data: {
        labels: data.xs.map(String),
        datasets: [
          {
            label: tt("plot.legend_none_curve"),
            data: data.yNone,
            borderColor: "#2ca02c",
            borderWidth: 2,
            pointRadius: 0,
            tension: 0,
          },
          {
            label: tt("plot.legend_vanilla_curve"),
            data: data.yVanilla,
            borderColor: "#d62728",
            borderWidth: 2,
            pointRadius: 0,
            tension: 0,
          },
          {
            label: tt("plot.legend_mod_curve"),
            data: data.yMod,
            borderColor: "#1f77b4",
            borderWidth: 2,
            pointRadius: 0,
            tension: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          title: {
            display: true,
            text: tt("plot.curve_title", {
              min: data.levelMin,
              max: data.levelMax,
              cost: data.cost,
              mode: data.modeLabel,
            }),
            color: "#e7ecf3",
            font: { size: 14 },
          },
          legend: { labels: { color: "#c5d0e0", boxWidth: 16 } },
          markLevel: data.markLevel,
        },
        scales: {
          x: {
            title: { display: true, text: tt("plot.xlabel"), color: "#9aa8bc" },
            ticks: {
              color: "#9aa8bc",
              maxTicksLimit: 10,
              callback(v) {
                const label = this.getLabelForValue(v);
                return label;
              },
            },
            grid: { color: "rgba(255,255,255,0.06)" },
          },
          y: {
            min: Math.max(0, yLo - pad),
            max: yHi + pad,
            title: { display: true, text: tt("plot.ylabel_after"), color: "#9aa8bc" },
            ticks: { color: "#9aa8bc" },
            grid: { color: "rgba(255,255,255,0.08)" },
          },
        },
      },
      plugins: [markLinePlugin(data.markLevel)],
    });
    return true;
  };

  const paint = (data) => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const tt = tRef.current;
    const k = kindRef.current;
    if (!canvas) return;
    if (wrap && (wrap.clientWidth < 40 || wrap.clientHeight < 40)) return;

    if (k === "curve") {
      if (!data) {
        destroyChartJs();
        drawCurveChart(canvas, {
          title: tt("app.plot_curve_empty"),
          xlabel: tt("plot.xlabel"),
          ylabel: tt("plot.ylabel_after"),
          legends: {
            none: tt("plot.legend_none_curve"),
            vanilla: tt("plot.legend_vanilla_curve"),
            mod: tt("plot.legend_mod_curve"),
          },
          empty: true,
        });
        return;
      }
      if (!paintCurveChartJs(canvas, data, tt)) {
        destroyChartJs();
        drawCurveChart(canvas, {
          title: tt("plot.curve_title", {
            min: data.levelMin,
            max: data.levelMax,
            cost: data.cost,
            mode: data.modeLabel,
          }),
          xlabel: tt("plot.xlabel"),
          ylabel: tt("plot.ylabel_after"),
          legends: {
            none: tt("plot.legend_none_curve"),
            vanilla: tt("plot.legend_vanilla_curve"),
            mod: tt("plot.legend_mod_curve"),
          },
          xs: data.xs,
          yNone: data.yNone,
          yVanilla: data.yVanilla,
          yMod: data.yMod,
          markLevel: data.markLevel,
          empty: false,
        });
      }
      return;
    }

    // hline
    if (!data) {
      if (!paintHLineChartJs(canvas, null, tt)) {
        destroyChartJs();
        drawHLineChart(canvas, {
          title: tt("app.plot_title_empty"),
          ylabel: tt("plot.ylabel"),
          legends: {
            none: tt("plot.legend_none"),
            vanilla: tt("plot.legend_vanilla"),
            mod: tt("plot.legend_mod"),
          },
          yNone: 0,
          yVanilla: 0,
          yMod: 0,
          empty: true,
        });
      }
      return;
    }
    if (!paintHLineChartJs(canvas, data, tt)) {
      destroyChartJs();
      drawHLineChart(canvas, {
        title: tt("plot.title", {
          lv: data.lv,
          cost: data.cost,
          mode: data.modeLabel,
        }),
        ylabel: tt("plot.ylabel"),
        legends: {
          none: `${tt("plot.legend_none")} = ${data.yNone}`,
          vanilla: `${tt("plot.legend_vanilla")} = ${data.yVanilla}`,
          mod: `${tt("plot.legend_mod")} = ${Number(data.yMod.toFixed(2))}`,
        },
        yNone: data.yNone,
        yVanilla: data.yVanilla,
        yMod: data.yMod,
        empty: false,
      });
    }
  };

  useEffect(() => {
    const wrap = wrapRef.current;
    const redraw = () => {
      requestAnimationFrame(() => paint(lastPayloadRef.current));
    };
    window.addEventListener("resize", redraw);
    let ro;
    if (wrap && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(redraw);
      ro.observe(wrap);
    }
    const t1 = setTimeout(redraw, 50);
    const t2 = setTimeout(redraw, 200);
    return () => {
      window.removeEventListener("resize", redraw);
      if (ro) ro.disconnect();
      clearTimeout(t1);
      clearTimeout(t2);
      destroyChartJs();
    };
  }, []);

  return useMemo(
    () => ({
      draw(payload) {
        lastPayloadRef.current = payload;
        requestAnimationFrame(() => paint(payload));
      },
      drawEmpty() {
        lastPayloadRef.current = null;
        requestAnimationFrame(() => paint(null));
      },
    }),
    []
  );
}

function ModeFields({ t, mode, setMode, enchantReq, setEnchantReq }) {
  return html`
    <div class="field">
      <label>${t("app.label_mode")}</label>
      <select value=${mode} onChange=${(e) => setMode(e.target.value)}>
        ${MODES.map((m) => html`<option value=${m}>${t(`mode.${m}`)}</option>`)}
      </select>
    </div>
    ${mode === MODE_ENCHANT &&
    html`
      <div class="field">
        <label>${t("app.label_enchant_req")}</label>
        <input
          value=${enchantReq}
          onInput=${(e) => setEnchantReq(e.target.value)}
        />
      </div>
    `}
  `;
}

function ModePicker({ t, mode, setMode }) {
  const items = [
    { key: MODE_ANVIL, label: t("mode.anvil_short"), tip: t("mode.anvil") },
    { key: MODE_ENCHANT, label: t("mode.enchant_short"), tip: t("mode.enchant") },
  ];
  return html`
    <div class="mode-picker" role="tablist" aria-label=${t("app.label_mode")}>
      ${items.map(
        (it) => html`
          <button
            type="button"
            class=${mode === it.key ? "mode-card active" : "mode-card"}
            title=${it.tip}
            onClick=${() => setMode(it.key)}
          >
            <${ModeIcon} mode=${it.key} size=${56} />
            <span class="mode-card-label">${it.label}</span>
          </button>
        `
      )}
    </div>
  `;
}

/** 原版 HUD 经验条（只读展示） */
function McXpBar({ level, progressPct, hint, scale = 2 }) {
  const pct = Math.max(0, Math.min(100, Number(progressPct) || 0));
  const w = XP_BAR_W * scale;
  const h = XP_BAR_H * scale;
  return html`
    <div class="mc-xp" title=${hint || ""}>
      <div class="mc-xp-level">${level}</div>
      <div class="mc-xp-track" style=${{ width: `${w}px`, height: `${h}px` }}>
        <div
          class="mc-xp-bg"
          style=${{
            backgroundImage: `url(${IMG.xpBarBg})`,
            backgroundSize: `${w}px ${h}px`,
          }}
        ></div>
        <div class="mc-xp-clip" style=${{ width: `${pct}%` }}>
          <div
            class="mc-xp-fill"
            style=${{
              width: `${w}px`,
              height: `${h}px`,
              backgroundImage: `url(${IMG.xpBarFill})`,
              backgroundSize: `${w}px ${h}px`,
            }}
          ></div>
        </div>
      </div>
    </div>
  `;
}

/** 可编辑等级 + 可拖经验条 + 进度 XP 输入 */
function LevelXpControl({ t, level, setLevel, progress, setProgress, scale = 2 }) {
  const trackRef = useRef(null);
  const dragging = useRef(false);
  const lvNum = Math.max(0, Number(level) || 0);
  const need = xpToNext(lvNum);
  const maxP = maxProgressAtLevel(lvNum);
  const prog = clampProgress(lvNum, progress);
  const pct = progressPctOf(lvNum, prog);
  const w = XP_BAR_W * scale;
  const h = XP_BAR_H * scale;

  function setProgFromClientX(clientX) {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    setProgress(Math.round(ratio * need));
  }

  useEffect(() => {
    function onMove(e) {
      if (!dragging.current) return;
      setProgFromClientX(e.clientX);
    }
    function onUp() {
      dragging.current = false;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [level, need]);

  function onLevelInput(raw) {
    setLevel(raw);
    const n = Number(String(raw).trim());
    if (Number.isFinite(n) && n >= 0) {
      setProgress(clampProgress(Math.floor(n), progress));
    }
  }

  return html`
    <div class="level-xp-control">
      <div class="level-xp-head">
        <span class="level-xp-label">${t("gui.your_level")}</span>
        <label class="level-xp-prog">
          <span>${t("gui.progress_xp")}</span>
          <input
            type="number"
            min="0"
            max=${maxP}
            value=${prog}
            onInput=${(e) => setProgress(clampProgress(lvNum, e.target.value))}
          />
          <span class="level-xp-need">/ ${need}</span>
        </label>
      </div>
      <div class="mc-xp mc-xp-editable" title=${t("gui.drag_bar")}>
        <input
          class="mc-xp-level-input"
          type="number"
          min="0"
          value=${level}
          onInput=${(e) => onLevelInput(e.target.value)}
          aria-label=${t("gui.your_level")}
        />
        <div
          class="mc-xp-track mc-xp-track-drag"
          ref=${trackRef}
          style=${{ width: `${w}px`, height: `${h}px` }}
          onPointerDown=${(e) => {
            dragging.current = true;
            e.currentTarget.setPointerCapture?.(e.pointerId);
            setProgFromClientX(e.clientX);
          }}
        >
          <div
            class="mc-xp-bg"
            style=${{
              backgroundImage: `url(${IMG.xpBarBg})`,
              backgroundSize: `${w}px ${h}px`,
            }}
          ></div>
          <div class="mc-xp-clip" style=${{ width: `${pct}%` }}>
            <div
              class="mc-xp-fill"
              style=${{
                width: `${w}px`,
                height: `${h}px`,
                backgroundImage: `url(${IMG.xpBarFill})`,
                backgroundSize: `${w}px ${h}px`,
              }}
            ></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function XpBarRow({ icon, label, level, progressPct, tone, hint }) {
  return html`
    <div class=${`xp-row tone-${tone}`}>
      <div class="xp-row-head">
        <span class="xp-row-label">
          ${icon && html`<${McImg} src=${icon} size=${20} alt="" />`}
          ${label}
        </span>
      </div>
      <${McXpBar} level=${level} progressPct=${progressPct} hint=${hint} />
    </div>
  `;
}

function XpDemoPanel({ t, view, mode }) {
  if (!view) {
    return html`
      <div class="xp-demo empty">
        <${McImg} src=${IMG.iconGrass} size=${48} alt="" />
        <p>${t("xp.placeholder")}</p>
      </div>
    `;
  }
  const modIcon = mode === MODE_ENCHANT ? IMG.iconEnchant : IMG.iconAnvil;
  return html`
    <div class="xp-demo">
      <div class="xp-demo-title">
        <${McImg} src=${IMG.xpBottle} size=${28} alt="" />
        <span>${t("xp.title")}</span>
      </div>
      <${XpBarRow}
        icon=${IMG.xpBottle}
        label=${t("xp.before")}
        level=${view.beforeLevel}
        progressPct=${view.beforePct}
        tone="before"
        hint=${t("xp.hint_before")}
      />
      <div class="xp-arrow">${t("xp.after_cost", { cost: view.cost })}</div>
      <${XpBarRow}
        icon=${IMG.iconGrass}
        label=${t("xp.vanilla")}
        level=${view.vanillaLevel}
        progressPct=${view.vanillaPct}
        tone="vanilla"
        hint=${t("xp.hint_vanilla")}
      />
      <${XpBarRow}
        icon=${modIcon}
        label=${t("xp.mod")}
        level=${view.modLevel}
        progressPct=${view.modPct}
        tone="mod"
        hint=${t("xp.hint_mod")}
      />
      <p class="xp-foot">${t("xp.foot", { kept: view.kept })}</p>
    </div>
  `;
}

/** 原版槽位物品区 16×16 */
function GuiSlot({
  left,
  top,
  title,
  src,
  scale = GUI_SCALE,
  onClick,
  clickable = false,
  className = "",
  flying = false,
}) {
  const size = 16 * scale;
  const Tag = onClick ? "button" : "div";
  return html`
    <${Tag}
      type=${onClick ? "button" : undefined}
      class=${`gui-slot ${clickable ? "gui-slot-clickable" : ""} ${flying ? "gui-slot-fly" : ""} ${className}`.trim()}
      title=${title}
      style=${{ left: `${left}px`, top: `${top}px`, width: `${size}px`, height: `${size}px` }}
      onClick=${onClick}
    >
      ${src &&
      html`<img
        class="mc-pixel gui-slot-item"
        src=${src}
        alt=""
        width=${size}
        height=${size}
        draggable=${false}
      />`}
    </${Tag}>
  `;
}

function AnvilPanel({ t, level, setLevel, progress, setProgress, cost, setCost, onCalc }) {
  const [trio, setTrio] = useState(() => randomAnvilTrio());
  const [flying, setFlying] = useState(false);
  const s = GUI_SCALE;
  const costN = String(cost ?? "").trim() || "—";

  function takeResult() {
    if (flying) return;
    setFlying(true);
    window.setTimeout(() => {
      setFlying(false);
      onCalc();
    }, 280);
  }

  return html`
    <div class="mc-gui-wrap">
      <div
        class="mc-gui-sprite anvil-sprite"
        style=${{
          width: `${176 * s}px`,
          height: `${166 * s}px`,
          backgroundImage: `url(${IMG.guiAnvil})`,
          backgroundSize: `${256 * s}px ${256 * s}px`,
        }}
      >
        <${GuiSlot}
          left=${27 * s}
          top=${47 * s}
          title=${t("gui.slot_reroll")}
          src=${trio.left}
          clickable=${true}
          onClick=${() => setTrio(randomAnvilTrio())}
        />
        <${GuiSlot}
          left=${76 * s}
          top=${47 * s}
          title=${t("gui.slot_reroll")}
          src=${trio.right}
          clickable=${true}
          onClick=${() => setTrio(randomAnvilTrio())}
        />
        <${GuiSlot}
          left=${134 * s}
          top=${47 * s}
          title=${t("gui.slot_take")}
          src=${trio.out}
          clickable=${true}
          flying=${flying}
          className="gui-slot-out"
          onClick=${takeResult}
        />
        <div
          class="gui-name-field"
          style=${{
            left: `${59 * s}px`,
            top: `${20 * s}px`,
            width: `${110 * s}px`,
            height: `${16 * s}px`,
            padding: `${4 * s}px 0 0 ${3 * s}px`,
            fontSize: `${8 * s}px`,
            lineHeight: `${8 * s}px`,
            textShadow: `${s}px ${s}px 0 #3f3f3f`,
          }}
        >
          ${t("gui.rename_placeholder")}
        </div>
        <div class="gui-cost-label" style=${{ left: `${40 * s}px`, top: `${68 * s}px` }}>
          ${t("gui.enchantment_cost", { cost: costN })}
        </div>
      </div>
      <${LevelXpControl}
        t=${t}
        level=${level}
        setLevel=${setLevel}
        progress=${progress}
        setProgress=${setProgress}
      />
      <div class="cost-bottle-row">
        <${McImg} src=${IMG.xpBottle} size=${28} alt="" />
        <span class="cost-bottle-x">×</span>
        <input
          class="cost-bottle-input"
          type="number"
          min="0"
          value=${cost}
          onInput=${(e) => setCost(e.target.value)}
          aria-label=${t("gui.anvil_cost")}
        />
        <span class="cost-bottle-hint">${t("gui.cost_levels_hint")}</span>
      </div>
      <p class="mc-gui-tip">${t("gui.anvil_tip")}</p>
    </div>
  `;
}

function EnchantPanel({
  t,
  level,
  setLevel,
  progress,
  setProgress,
  costs,
  setCosts,
  activeIdx,
  setActiveIdx,
  enchantReq,
  setEnchantReq,
  onCalc,
}) {
  const [pair, setPair] = useState(() => randomEnchantPair());
  const [opts, setOpts] = useState(() => randomEnchantOptions());
  const s = GUI_SCALE;
  const glyphScale = Math.max(1, s - 0.5);

  function rerollItems() {
    setPair(randomEnchantPair());
    setOpts(randomEnchantOptions());
  }

  function setCostAt(i, raw) {
    const next = costs.slice();
    next[i] = raw;
    setCosts(next);
  }

  function pickRow(i) {
    setActiveIdx(i);
    const n = Number(String(costs[i]).trim());
    if (!Number.isFinite(n) || n < 0) return;
    onCalc(Math.floor(n));
  }

  return html`
    <div class="mc-gui-wrap">
      <div
        class="mc-gui-sprite enchant-sprite"
        style=${{
          width: `${176 * s}px`,
          height: `${166 * s}px`,
          backgroundImage: `url(${IMG.guiEnchant})`,
          backgroundSize: `${256 * s}px ${256 * s}px`,
        }}
      >
        <img
          class="mc-pixel gui-enchant-book"
          src=${IMG.enchantBook}
          alt=""
          draggable=${false}
          style=${{
            left: `${4 * s}px`,
            top: `${6 * s}px`,
            width: `${48 * s}px`,
            height: `${36 * s}px`,
          }}
        />
        <${GuiSlot}
          left=${15 * s}
          top=${47 * s}
          title=${t("gui.slot_reroll")}
          src=${pair.item}
          clickable=${true}
          onClick=${rerollItems}
        />
        <${GuiSlot}
          left=${35 * s}
          top=${47 * s}
          title=${t("gui.slot_reroll")}
          src=${pair.lapis}
          clickable=${true}
          onClick=${rerollItems}
        />
        ${[0, 1, 2].map(
          (i) => html`
            <button
              type="button"
              class=${activeIdx === i ? "gui-enchant-opt active" : "gui-enchant-opt"}
              style=${{
                left: `${60 * s}px`,
                top: `${(14 + 19 * i) * s}px`,
                width: `${108 * s}px`,
                height: `${19 * s}px`,
              }}
              title=${t("gui.enchant_hover", {
                name: opts[i].hint,
                cost: costs[i],
                lapis: i + 1,
              })}
              onClick=${() => pickRow(i)}
            >
              <span
                class="gui-enchant-lapis"
                style=${{
                  left: `${1 * s}px`,
                  top: `${1 * s}px`,
                  width: `${16 * s}px`,
                  height: `${16 * s}px`,
                }}
              >
                ${Array.from({ length: i + 1 }, (_, k) =>
                  html`<${McImg}
                    key=${k}
                    src=${IMG.lapis}
                    size=${Math.max(10, 12 * s - k * 2)}
                    alt=""
                    className="gui-enchant-lapis-stack"
                  />`
                )}
              </span>
              <span
                class="gui-enchant-runes"
                style=${{
                  left: `${20 * s}px`,
                  top: `${2 * s}px`,
                  width: `${64 * s}px`,
                  height: `${16 * s}px`,
                }}
              >
                <${SgaText} text=${opts[i].phrase} scale=${glyphScale} />
              </span>
              <input
                class="gui-enchant-lv-input"
                style=${{ right: `${1 * s}px`, bottom: `${1 * s}px` }}
                type="number"
                min="0"
                value=${costs[i]}
                onClick=${(e) => e.stopPropagation()}
                onInput=${(e) => setCostAt(i, e.target.value)}
                aria-label=${t("gui.enchant_cost")}
              />
            </button>
          `
        )}
      </div>
      <${LevelXpControl}
        t=${t}
        level=${level}
        setLevel=${setLevel}
        progress=${progress}
        setProgress=${setProgress}
      />
      <label class="enchant-req-field">
        <span>${t("gui.enchant_req")}</span>
        <input
          value=${enchantReq}
          onInput=${(e) => setEnchantReq(e.target.value)}
        />
      </label>
      <p class="mc-gui-tip">${t("gui.enchant_tip")}</p>
    </div>
  `;
}

function Tab1({ t, status }) {
  const [level, setLevel] = useState("46");
  const [progress, setProgress] = useState(() => Math.floor(xpToNext(46) / 2));
  const [cost, setCost] = useState("3");
  const [enchantCosts, setEnchantCosts] = useState(["1", "2", "3"]);
  const [activeEnchantIdx, setActiveEnchantIdx] = useState(2);
  const [mode, setMode] = useState(MODE_ANVIL);
  const [enchantReq, setEnchantReq] = useState("30");
  const [resultText, setResultText] = useState("");
  const [resultOpen, setResultOpen] = useState(false);
  const [xpView, setXpView] = useState(null);
  const [error, setError] = useState("");

  function onCalc(costOverride) {
    setError("");
    try {
      const curLevel = parseNonNegInt(level, t("errors.name_level"), t);
      const costRaw =
        costOverride != null
          ? costOverride
          : mode === MODE_ENCHANT
            ? enchantCosts[activeEnchantIdx]
            : cost;
      const costLevels = parseNonNegInt(costRaw, t("errors.name_cost"), t);
      let req = 30;
      if (mode === MODE_ENCHANT) {
        req = parseNonNegInt(enchantReq, t("errors.name_enchant"), t);
      }
      const prog = clampProgress(curLevel, progress);
      setProgress(prog);
      if (mode === MODE_ANVIL) setCost(String(costLevels));
      const { exact, start, end, pay } = applyAtProgress(
        curLevel,
        prog,
        costLevels,
        mode,
        req
      );
      setResultText(
        buildResultText(
          t,
          curLevel,
          prog,
          costLevels,
          mode,
          req,
          exact,
          start,
          end,
          pay
        )
      );
      setResultOpen(false);

      const beforePct = progressPctOf(curLevel, prog);
      const vanillaLevel = Math.max(0, curLevel - costLevels);
      const vanillaPct = beforePct;
      const modPct = progressPctOf(exact.afterLevel, exact.afterProgress);
      setXpView({
        beforeLevel: curLevel,
        beforePct,
        vanillaLevel,
        vanillaPct,
        modLevel: exact.afterLevel,
        modPct,
        cost: costLevels,
        kept: Number((exact.afterLevel - vanillaLevel).toFixed(1)),
        pay,
      });
    } catch (e) {
      setError(translateLogicError(e, t));
    }
  }

  return html`
    <div class="layout">
      <section class="panel tab1-left">
        <${ModePicker} t=${t} mode=${mode} setMode=${setMode} />
        ${mode === MODE_ANVIL &&
        html`<${AnvilPanel}
          t=${t}
          level=${level}
          setLevel=${setLevel}
          progress=${progress}
          setProgress=${setProgress}
          cost=${cost}
          setCost=${setCost}
          onCalc=${() => onCalc()}
        />`}
        ${mode === MODE_ENCHANT &&
        html`<${EnchantPanel}
          t=${t}
          level=${level}
          setLevel=${setLevel}
          progress=${progress}
          setProgress=${setProgress}
          costs=${enchantCosts}
          setCosts=${setEnchantCosts}
          activeIdx=${activeEnchantIdx}
          setActiveIdx=${setActiveEnchantIdx}
          enchantReq=${enchantReq}
          setEnchantReq=${setEnchantReq}
          onCalc=${onCalc}
        />`}
        <div class="error">${error}</div>
        <div class="status">${status}</div>
      </section>
      <section class="panel xp-panel">
        <${XpDemoPanel} t=${t} view=${xpView} mode=${mode} />
      </section>
    </div>
    <section class="panel result-panel">
      <button
        type="button"
        class="result-toggle"
        onClick=${() => setResultOpen((v) => !v)}
        aria-expanded=${resultOpen}
      >
        <span>${t("result.toggle")}</span>
        <span class="result-toggle-mark">${resultOpen ? "▾" : "▸"}</span>
      </button>
      ${resultOpen &&
      html`<pre class="result-body">${resultText || "—"}</pre>`}
    </section>
  `;
}

function Tab2({ t, status }) {
  const [cost, setCost] = useState("3");
  const [levelMin, setLevelMin] = useState("1");
  const [levelMax, setLevelMax] = useState("100");
  const [markLevel, setMarkLevel] = useState("46");
  const [mode, setMode] = useState(MODE_ANVIL);
  const [enchantReq, setEnchantReq] = useState("30");
  const [summary, setSummary] = useState("");
  const [plotData, setPlotData] = useState(null);
  const [error, setError] = useState("");
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const chart = useChart(canvasRef, wrapRef, t, "curve");

  useEffect(() => {
    if (plotData) chart.draw(plotData);
    else chart.drawEmpty();
  }, [plotData, chart, t]);

  function onCalc() {
    setError("");
    try {
      const costLevels = parseNonNegInt(cost, t("errors.name_cost"), t);
      const minLv = parseNonNegInt(levelMin, t("errors.name_range_min"), t);
      const maxLv = parseNonNegInt(levelMax, t("errors.name_range_max"), t);
      const mark = parseNonNegInt(markLevel, t("errors.name_mark"), t);
      let req = 30;
      if (mode === MODE_ENCHANT) {
        req = parseNonNegInt(enchantReq, t("errors.name_enchant"), t);
      }
      const series = buildCurveSeries(minLv, maxLv, costLevels, mode, req);
      const pay = modPayXp(costLevels, mode, req);
      const atMark = buildLevelHLines(mark, costLevels, mode, req);
      setPlotData({
        xs: series.xs,
        yNone: series.yNone,
        yVanilla: series.yVanilla,
        yMod: series.yMod,
        levelMin: minLv,
        levelMax: maxLv,
        cost: costLevels,
        modeLabel: t(`mode.${mode}`),
        markLevel: mark,
      });
      setSummary(
        [
          t("tab2.summary_header"),
          t("tab2.summary_range", { min: minLv, max: maxLv, step: series.step }),
          t("tab2.summary_cost", { cost: costLevels, pay }),
          t("tab2.summary_mode", { mode: t(`mode.${mode}`) }),
          t("tab2.summary_mark", {
            mark,
            none: atMark.yNone,
            vanilla: atMark.yVanilla,
            mod: Number(atMark.yMod.toFixed(2)),
          }),
          t("tab2.summary_hint"),
        ].join("\n")
      );
    } catch (e) {
      setError(translateLogicError(e, t));
    }
  }

  function onClear() {
    setSummary("");
    setPlotData(null);
    setError("");
  }

  return html`
    <div class="layout">
      <section class="panel">
        <h2>${t("app.tab2")}</h2>
        <p class="hint-block">${t("tab2.banner")}</p>
        <div class="field">
          <label>${t("app.label_cost")}</label>
          <input value=${cost} onInput=${(e) => setCost(e.target.value)} />
        </div>
        <div class="field">
          <label>${t("tab2.label_range_min")}</label>
          <input value=${levelMin} onInput=${(e) => setLevelMin(e.target.value)} />
        </div>
        <div class="field">
          <label>${t("tab2.label_range_max")}</label>
          <input value=${levelMax} onInput=${(e) => setLevelMax(e.target.value)} />
        </div>
        <div class="field">
          <label>${t("tab2.label_mark")}</label>
          <input value=${markLevel} onInput=${(e) => setMarkLevel(e.target.value)} />
        </div>
        <div class="hint">${t("tab2.hint_mark")}</div>
        <${ModeFields}
          t=${t}
          mode=${mode}
          setMode=${setMode}
          enchantReq=${enchantReq}
          setEnchantReq=${setEnchantReq}
        />
        <div class="actions">
          <button type="button" onClick=${onCalc}>${t("app.btn_plot")}</button>
          <button type="button" class="secondary" onClick=${onClear}>
            ${t("app.btn_clear")}
          </button>
        </div>
        <div class="error">${error}</div>
        <div class="status">${status}</div>
      </section>
      <section class="panel chart-panel chart-panel-tall">
        <div class="chart-wrap chart-wrap-tall" ref=${wrapRef}>
          <canvas ref=${canvasRef}></canvas>
        </div>
      </section>
    </div>
    <section class="panel result-panel">
      <pre>${summary || "—"}</pre>
    </section>
  `;
}

function App() {
  const [langCode, setLangCode] = useState(getSavedLang);
  const [i18n, setI18n] = useState(null);
  const [tab, setTab] = useState("tab1");
  const [status, setStatus] = useState("");
  const [bootError, setBootError] = useState("");
  const t = useMemo(() => (i18n ? i18n.t.bind(i18n) : (k) => k), [i18n]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await loadLang(langCode);
        if (cancelled) return;
        setI18n(createI18n(data));
        document.documentElement.lang = langCode.startsWith("zh") ? "zh-CN" : "en";
        document.title = data.app?.title || "Tax Free Levels Calculator";
      } catch (e) {
        if (!cancelled) setBootError(String(e.message || e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [langCode]);

  useEffect(() => {
    if (!i18n) return;
    const msg = selfCheck();
    if (msg) setStatus(t("app.self_check_fail", { msg }));
    else setStatus(t("app.self_check_ok"));
  }, [i18n, t]);

  function onLangChange(code) {
    setLangCode(code);
    saveLang(code);
    setBootError("");
  }

  if (bootError) {
    return html`<div class="banner error">${bootError}</div>`;
  }
  if (!i18n) {
    return html`<div class="banner">Loading…</div>`;
  }

  return html`
    <div class="topbar">
      <h1>
        ${t("app.title")}
        <span class="badge">${t("app.version")}</span>
      </h1>
      <div>
        <label>${t("app.label_lang")} </label>
        <select
          value=${langCode}
          onChange=${(e) => onLangChange(e.target.value)}
        >
          ${LANGS.map((l) => html`<option value=${l.code}>${l.name}</option>`)}
        </select>
      </div>
    </div>
    <p class="banner">${t("app.banner")}</p>
    <div class="tabs">
      <button
        type="button"
        class=${tab === "tab1" ? "tab active" : "tab"}
        onClick=${() => setTab("tab1")}
      >
        ${t("app.tab1")}
      </button>
      <button
        type="button"
        class=${tab === "tab2" ? "tab active" : "tab"}
        onClick=${() => setTab("tab2")}
      >
        ${t("app.tab2")}
      </button>
    </div>
    ${tab === "tab1"
      ? html`<${Tab1} t=${t} status=${status} />`
      : html`<${Tab2} t=${t} status=${status} />`}
  `;
}

render(html`<${App} />`, document.getElementById("app"));
