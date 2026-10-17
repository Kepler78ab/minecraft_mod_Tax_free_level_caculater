import { html } from "htm/preact";
import { render } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";

import { createI18n, getSavedLang, loadLang, saveLang } from "./i18n.js";
import {
  MODE_ANVIL,
  MODE_BASE30,
  MODE_ENCHANT,
  buildLevelHLines,
  computeBoundaries,
  levelAndProgressFromTotal,
  maxProgressAtLevel,
  selfCheck,
  xpToNext,
} from "./xp.js";

const MODES = [MODE_ANVIL, MODE_ENCHANT, MODE_BASE30];
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

function buildResultText(t, curLevel, cost, mode, enchantReq, start, end, pay) {
  const avgDeltaLevel = (start.deltaLevel + end.deltaLevel) / 2;
  const avgDeltaProgress = (start.deltaProgress + end.deltaProgress) / 2;
  const avgSpent = (start.actualSpent + end.actualSpent) / 2;
  const avgAfterTotal = (start.afterTotal + end.afterTotal) / 2;
  const remain = levelAndProgressFromTotal(Math.round(avgAfterTotal));
  const noModAfter = Math.max(0, curLevel - cost);
  const withModAvg = (start.afterLevel + end.afterLevel) / 2;
  const modeLabel = t(`mode.${mode}`);

  const lines = [
    t("result.header"),
    t("result.mode", { mode: modeLabel }),
    t("result.level_cost", { level: curLevel, cost }),
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
    t("result.compare_mod", {
      avg: withModAvg.toFixed(2),
      start: start.afterLevel,
      end: end.afterLevel,
      delta: avgDeltaLevel.toFixed(2),
    }),
    t("result.compare_diff", {
      diff: (withModAvg - noModAfter).toFixed(2),
    }),
    t("result.footer"),
  );
  return lines.join("\n");
}

function useChart(canvasRef, t) {
  const chartRef = useRef(null);

  useEffect(() => {
    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, []);

  function drawEmpty() {
    draw(null);
  }

  function draw(payload) {
    const canvas = canvasRef.current;
    if (!canvas || typeof Chart === "undefined") return;

    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    const empty = !payload;
    const yNone = empty ? 0 : payload.yNone;
    const yVanilla = empty ? 0 : payload.yVanilla;
    const yMod = empty ? 0 : payload.yMod;
    const title = empty
      ? t("app.plot_title_empty")
      : t("plot.title", {
          lv: payload.lv,
          cost: payload.cost,
          mode: payload.modeLabel,
        });

    const ys = empty ? [0, 1] : [yNone, yVanilla, yMod];
    const yLo = Math.min(...ys);
    const yHi = Math.max(...ys);
    const pad = yHi > yLo ? Math.max(2, (yHi - yLo) * 0.15) : 2;

    chartRef.current = new Chart(canvas, {
      type: "line",
      data: {
        labels: ["", ""],
        datasets: [
          {
            label: t("plot.legend_none") + (empty ? "" : ` = ${yNone}`),
            data: [yNone, yNone],
            borderColor: "#2ca02c",
            backgroundColor: "#2ca02c",
            borderWidth: 2.5,
            pointRadius: 0,
            tension: 0,
          },
          {
            label: t("plot.legend_vanilla") + (empty ? "" : ` = ${yVanilla}`),
            data: [yVanilla, yVanilla],
            borderColor: "#d62728",
            backgroundColor: "#d62728",
            borderWidth: 2.5,
            pointRadius: 0,
            tension: 0,
          },
          {
            label: t("plot.legend_mod") + (empty ? "" : ` = ${Number(yMod.toFixed(2))}`),
            data: [yMod, yMod],
            borderColor: "#1f77b4",
            backgroundColor: "#1f77b4",
            borderWidth: 2.5,
            pointRadius: 0,
            tension: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: title,
            color: "#e7ecf3",
          },
          legend: {
            labels: { color: "#c5d0e0" },
          },
        },
        scales: {
          x: {
            ticks: { display: false },
            grid: { color: "rgba(255,255,255,0.06)" },
          },
          y: {
            title: {
              display: true,
              text: t("plot.ylabel"),
              color: "#9aa8bc",
            },
            min: empty ? 0 : Math.max(0, yLo - pad),
            max: empty ? 10 : yHi + pad,
            ticks: { color: "#9aa8bc" },
            grid: { color: "rgba(255,255,255,0.08)" },
          },
        },
      },
    });
  }

  return { draw, drawEmpty };
}

function App() {
  const [langCode, setLangCode] = useState(getSavedLang);
  const [i18n, setI18n] = useState(null);
  const [level, setLevel] = useState("46");
  const [cost, setCost] = useState("3");
  const [mode, setMode] = useState(MODE_ANVIL);
  const [enchantReq, setEnchantReq] = useState("30");
  const [resultText, setResultText] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const canvasRef = useRef(null);
  const t = useMemo(() => (i18n ? i18n.t.bind(i18n) : (k) => k), [i18n]);
  const chart = useChart(canvasRef, t);

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
        if (!cancelled) setError(String(e.message || e));
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
    chart.drawEmpty();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i18n]);

  function onLangChange(code) {
    setLangCode(code);
    saveLang(code);
    setResultText("");
    setError("");
  }

  function onCalc() {
    if (!i18n) return;
    setError("");
    try {
      const curLevel = parseNonNegInt(level, t("errors.name_level"), t);
      const costLevels = parseNonNegInt(cost, t("errors.name_cost"), t);
      let req = 30;
      if (mode === MODE_ENCHANT) {
        req = parseNonNegInt(enchantReq, t("errors.name_enchant"), t);
      }
      const { start, end, pay } = computeBoundaries(curLevel, costLevels, mode, req);
      const lines = buildLevelHLines(curLevel, costLevels, mode, req);
      const text = buildResultText(t, curLevel, costLevels, mode, req, start, end, pay);
      setResultText(text);
      chart.draw({
        lv: curLevel,
        cost: costLevels,
        modeLabel: t(`mode.${mode}`),
        yNone: lines.yNone,
        yVanilla: lines.yVanilla,
        yMod: lines.yMod,
      });
    } catch (e) {
      setError(String(e.message || e));
    }
  }

  function onClear() {
    setResultText("");
    setError("");
    chart.drawEmpty();
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
          ${LANGS.map(
            (l) => html`<option value=${l.code}>${l.name}</option>`
          )}
        </select>
      </div>
    </div>
    <p class="banner">${t("app.banner")}</p>
    <div class="layout">
      <section class="panel">
        <h2>${t("app.btn_calc")}</h2>
        <div class="field">
          <label>${t("app.label_level")}</label>
          <input value=${level} onInput=${(e) => setLevel(e.target.value)} />
        </div>
        <div class="hint">${t("app.hint_level")}</div>
        <div class="field">
          <label>${t("app.label_cost")}</label>
          <input value=${cost} onInput=${(e) => setCost(e.target.value)} />
        </div>
        <div class="field">
          <label>${t("app.label_mode")}</label>
          <select value=${mode} onChange=${(e) => setMode(e.target.value)}>
            ${MODES.map(
              (m) => html`<option value=${m}>${t(`mode.${m}`)}</option>`
            )}
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
        <div class="actions">
          <button type="button" onClick=${onCalc}>${t("app.btn_calc")}</button>
          <button type="button" class="secondary" onClick=${onClear}>
            ${t("app.btn_clear")}
          </button>
        </div>
        <div class="error">${error}</div>
        <div class="status">${status}</div>
      </section>
      <section class="panel">
        <div class="chart-wrap">
          <canvas ref=${canvasRef}></canvas>
        </div>
      </section>
    </div>
    <section class="panel result-panel">
      <pre>${resultText || "—"}</pre>
    </section>
  `;
}

render(html`<${App} />`, document.getElementById("app"));
