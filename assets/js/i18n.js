const STORAGE_KEY = "tfl_calc_lang";

function dig(obj, path) {
  let node = obj;
  for (const part of path.split(".")) {
    if (node == null || typeof node !== "object" || !(part in node)) return path;
    node = node[part];
  }
  return node;
}

export function format(template, vars = {}) {
  if (typeof template !== "string") return String(template);
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : `{${k}}`
  );
}

export async function loadLang(code) {
  const res = await fetch(`./lang/${code}.json`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`lang load failed: ${code}`);
  return res.json();
}

export function getSavedLang() {
  try {
    return localStorage.getItem(STORAGE_KEY) || "zh_CN";
  } catch {
    return "zh_CN";
  }
}

export function saveLang(code) {
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* ignore */
  }
}

export function createI18n(data) {
  return {
    data,
    t(key, vars) {
      const raw = dig(data, key);
      return format(typeof raw === "string" ? raw : key, vars);
    },
  };
}
