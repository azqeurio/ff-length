const $ = (id) => document.getElementById(id);
const uid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`);

const defaultData = {
  mounts: [
    { id: "mft", name: "Micro Four Thirds", crop: 2, color: "#2563EB" },
    { id: "ft", name: "Four Thirds", crop: 2, color: "#64748B" },
    { id: "film", name: "35mm Film", crop: 1, color: "#111827" }
  ],
  styles: [
    { id: "premium", name: "PRO / Leica", color: "#2563EB", dash: "solid", width: 5, weight: 800 },
    { id: "standard", name: "Standard", color: "#667085", dash: "solid", width: 5, weight: 650 },
    { id: "vintage", name: "Vintage / Film", color: "#111827", dash: "solid", width: 5, weight: 800 }
  ],
  lenses: [
    { id: uid(), mountId: "mft", type: "prime", styleId: "premium", name: "LEICA DG SUMMILUX 15mm F1.7 ASPH.", start: 15, end: 15 },
    { id: uid(), mountId: "mft", type: "prime", styleId: "premium", name: "M.Zuiko Digital ED 17mm F1.2 PRO", start: 17, end: 17 },
    { id: uid(), mountId: "mft", type: "prime", styleId: "premium", name: "M.Zuiko Digital ED 25mm F1.2 PRO", start: 25, end: 25 },
    { id: uid(), mountId: "mft", type: "prime", styleId: "standard", name: "M.Zuiko Digital 25mm F1.8", start: 25, end: 25 },
    { id: uid(), mountId: "mft", type: "prime", styleId: "premium", name: "M.Zuiko Digital ED 45mm F1.2 PRO", start: 45, end: 45 },
    { id: uid(), mountId: "mft", type: "prime", styleId: "standard", name: "M.Zuiko Digital 45mm F1.8", start: 45, end: 45 },
    { id: uid(), mountId: "mft", type: "prime", styleId: "standard", name: "M.Zuiko Digital ED 75mm F1.8", start: 75, end: 75 },
    { id: uid(), mountId: "mft", type: "zoom", styleId: "premium", name: "M.Zuiko Digital ED 7-14mm F2.8 PRO", start: 7, end: 14 },
    { id: uid(), mountId: "mft", type: "zoom", styleId: "premium", name: "M.Zuiko Digital ED 12-40mm F2.8 PRO II", start: 12, end: 40 },
    { id: uid(), mountId: "mft", type: "zoom", styleId: "premium", name: "M.Zuiko Digital ED 12-100mm F4.0 IS PRO", start: 12, end: 100 },
    { id: uid(), mountId: "mft", type: "zoom", styleId: "premium", name: "M.Zuiko Digital ED 40-150mm F2.8 PRO", start: 40, end: 150, tc14: true, tc20: true },
    { id: uid(), mountId: "mft", type: "zoom", styleId: "premium", name: "M.Zuiko Digital ED 50-200mm F2.8 IS PRO", start: 50, end: 200, tc14: true, tc20: true },
    { id: uid(), mountId: "mft", type: "zoom", styleId: "standard", name: "M.Zuiko Digital ED 100-400mm F5.0-6.3 IS II", start: 100, end: 400, tc14: true, tc20: true },
    { id: uid(), mountId: "ft", type: "zoom", styleId: "standard", name: "Zuiko Digital 14-45mm F3.5-5.6", start: 14, end: 45 },
    { id: uid(), mountId: "ft", type: "zoom", styleId: "standard", name: "Zuiko Digital 40-150mm F3.5-4.5", start: 40, end: 150 },
    { id: uid(), mountId: "film", type: "prime", styleId: "vintage", name: "Olympus XA F.Zuiko 35mm F2.8", start: 35, end: 35 },
    { id: uid(), mountId: "film", type: "prime", styleId: "vintage", name: "OM-System Zuiko Auto-S 50mm F1.8", start: 50, end: 50 }
  ]
};

let state = loadState();
const defaultVisualSettings = {
  heatLowColor: "#FFFFFF",
  heatHighColor: "#DC2626",
  chartBackgroundColor: "#FFFFFF",
  plotBackgroundColor: "#FFFFFF",
  chartLineColor: "#4B4B4B",
  chartGridColor: "#BEBEBE",
  rangeFallbackColor: "#111111",
  chartTextColor: "#111111"
};
const defaultChartSettings = {
  chartTitle: "My Lens Roadmap",
  displayMode: "actual",
  labelMode: "both",
  scaleMode: "log",
  autoCropAxis: true,
  axisMin: 7,
  axisMax: 1200,
  showTeleconverters: true,
  showZoomGuides: true
};
let visualSettings = loadVisualSettings();
const rawExtensions = new Set(["orf", "raw", "rw2", "arw", "cr2", "cr3", "nef", "dng"]);
const exifAnalysis = {
  worker: null,
  running: false,
  cancelRequested: false,
  scan: { total: 0, scanned: 0, jpegs: 0, raws: 0, rawIgnored: 0, otherIgnored: 0 },
  summary: { total: 0, processed: 0, cacheHits: 0, parsed: 0, errors: 0, withLens: 0, withFocal: 0 },
  result: loadStoredExifResult(),
  status: "사진은 업로드되지 않습니다. EXIF와 분석 결과는 이 브라우저의 IndexedDB 캐시에만 저장됩니다."
};

function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

function toNumber(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const normalized = String(value || "").replace(",", ".");
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : fallback;
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem("lensRoadmapStudioV3"));
    if (saved?.mounts && saved?.styles && saved?.lenses) return normalizeState(saved);

    const old = JSON.parse(localStorage.getItem("lensRoadmapStudioV2"));
    if (old?.mounts && old?.lenses) return normalizeState(migrateV2(old));
  } catch {}
  return clone(defaultData);
}

function migrateV2(old) {
  return {
    mounts: old.mounts,
    styles: clone(defaultData.styles),
    lenses: old.lenses.map(l => ({
      id: l.id || uid(),
      mountId: l.mountId,
      type: l.type,
      styleId: l.styleId || (l.style === "premium" || l.style === "pro" ? "premium" : l.style === "vintage" ? "vintage" : "standard"),
      name: l.name,
      start: l.start,
      end: l.end,
      tc14: !!l.tc14,
      tc20: !!l.tc20
    }))
  };
}

function normalizeState(data) {
  const mounts = Array.isArray(data.mounts) ? data.mounts
    .map(m => ({
      id: String(m.id || uid()),
      name: String(m.name || "Untitled Mount").trim(),
      crop: Math.max(0.1, toNumber(m.crop, 1)),
      color: m.color || "#64748B"
    }))
    .filter(m => m.name) : [];

  const styles = Array.isArray(data.styles) ? data.styles
    .map(s => ({
      id: String(s.id || uid()),
      name: String(s.name || "Default").trim(),
      color: s.color || "#667085",
      dash: ["solid", "dash", "dot"].includes(s.dash) ? s.dash : "solid",
      width: Math.min(10, Math.max(2, Number(s.width) || 5)),
      weight: Number(s.weight) || 800
    }))
    .filter(s => s.name) : [];

  const mountIds = new Set(mounts.map(m => m.id));
  const styleIds = new Set(styles.map(s => s.id));
  const fallbackMount = mounts[0]?.id;
  const fallbackStyle = styles[0]?.id;

  const lenses = Array.isArray(data.lenses) ? data.lenses
    .map(l => {
      const rawStart = Number(l.start);
      const rawEnd = Number(l.end || l.start);
      if (!rawStart || !rawEnd) return null;
      const mountId = mountIds.has(l.mountId) ? l.mountId : fallbackMount;
      const styleId = styleIds.has(l.styleId) ? l.styleId : fallbackStyle;
      if (!mountId || !styleId) return null;
      const start = Math.min(rawStart, rawEnd);
      const end = Math.max(rawStart, rawEnd);
      return {
        id: l.id || uid(),
        mountId,
        type: start === end ? "prime" : (l.type === "prime" ? "prime" : "zoom"),
        styleId,
        name: String(l.name || "Untitled Lens").trim(),
        start,
        end,
        tc14: !!l.tc14,
        tc20: !!l.tc20
      };
    })
    .filter(Boolean) : [];

  return { mounts, styles, lenses };
}

function saveState() { localStorage.setItem("lensRoadmapStudioV3", JSON.stringify(state)); }
function mountById(id) { return state.mounts.find(m => m.id === id); }
function styleById(id) { return state.styles.find(s => s.id === id) || state.styles[0] || { name: "Default", color: "#667085", dash: "solid", width: 5, weight: 650 }; }

function loadChartSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("lensRoadmapChartSettingsV1"));
    return {
      chartTitle: String(saved?.chartTitle || defaultChartSettings.chartTitle),
      displayMode: ["actual", "equiv"].includes(saved?.displayMode) ? saved.displayMode : defaultChartSettings.displayMode,
      labelMode: ["both", "actual", "equiv"].includes(saved?.labelMode) ? saved.labelMode : defaultChartSettings.labelMode,
      scaleMode: ["log", "linear"].includes(saved?.scaleMode) ? saved.scaleMode : defaultChartSettings.scaleMode,
      autoCropAxis: saved?.autoCropAxis ?? defaultChartSettings.autoCropAxis,
      axisMin: Math.max(0.1, Number(saved?.axisMin) || defaultChartSettings.axisMin),
      axisMax: Math.max(1, Number(saved?.axisMax) || defaultChartSettings.axisMax),
      showTeleconverters: saved?.showTeleconverters ?? defaultChartSettings.showTeleconverters,
      showZoomGuides: saved?.showZoomGuides ?? defaultChartSettings.showZoomGuides
    };
  } catch {}
  return { ...defaultChartSettings };
}

function readChartSettingsFromDom() {
  return {
    chartTitle: $("chartTitle")?.value || defaultChartSettings.chartTitle,
    displayMode: $("displayMode")?.value || defaultChartSettings.displayMode,
    labelMode: $("labelMode")?.value || defaultChartSettings.labelMode,
    scaleMode: $("scaleMode")?.value || defaultChartSettings.scaleMode,
    autoCropAxis: !!$("autoCropAxis")?.checked,
    axisMin: Math.max(0.1, Number($("axisMin")?.value) || defaultChartSettings.axisMin),
    axisMax: Math.max(1, Number($("axisMax")?.value) || defaultChartSettings.axisMax),
    showTeleconverters: !!$("showTeleconverters")?.checked,
    showZoomGuides: !!$("showZoomGuides")?.checked
  };
}

function saveChartSettings() {
  localStorage.setItem("lensRoadmapChartSettingsV1", JSON.stringify(readChartSettingsFromDom()));
}

function applyChartSettingsToDom(settings = loadChartSettings()) {
  Object.entries(settings).forEach(([key, value]) => {
    const node = $(key);
    if (!node) return;
    if (node.type === "checkbox") node.checked = !!value;
    else node.value = value;
  });
}

function emptyExifResult() {
  return { lenses: [], focalColumns: [], maxCellCount: 0 };
}

function loadStoredExifResult() {
  try {
    const saved = JSON.parse(localStorage.getItem("lensRoadmapExifResultV1"));
    if (Array.isArray(saved?.lenses) && Array.isArray(saved?.focalColumns)) {
      return {
        lenses: saved.lenses,
        focalColumns: saved.focalColumns,
        maxCellCount: Number(saved.maxCellCount) || 0
      };
    }
  } catch {}
  return emptyExifResult();
}

function saveStoredExifResult(result) {
  localStorage.setItem("lensRoadmapExifResultV1", JSON.stringify(result || emptyExifResult()));
}

function normalizeHexColor(value, fallback = "#000000") {
  const text = String(value || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(text)) return text.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(text)) {
    return `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`.toUpperCase();
  }
  return fallback;
}

function loadVisualSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("lensRoadmapVisualSettingsV1"));
    return Object.fromEntries(Object.entries(defaultVisualSettings).map(([key, fallback]) => [key, normalizeHexColor(saved?.[key], fallback)]));
  } catch {}
  return { ...defaultVisualSettings };
}

function saveVisualSettings() {
  localStorage.setItem("lensRoadmapVisualSettingsV1", JSON.stringify(visualSettings));
}

function readVisualSettingsFromDom() {
  const next = { ...visualSettings };
  Object.entries(defaultVisualSettings).forEach(([key, fallback]) => {
    const node = $(key);
    next[key] = normalizeHexColor(node?.value || next[key], fallback);
  });
  return next;
}

function applyVisualSettingsToDom() {
  Object.entries(visualSettings).forEach(([key, value]) => {
    const node = $(key);
    if (node) node.value = normalizeHexColor(value, defaultVisualSettings[key]);
  });
}

function currentVisualSettings() {
  visualSettings = readVisualSettingsFromDom();
  return visualSettings;
}

function hexToRgb(hex) {
  const value = normalizeHexColor(hex).slice(1);
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16)
  };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map(value => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function mixColor(low, high, ratio) {
  const a = hexToRgb(low);
  const b = hexToRgb(high);
  const t = clamp(ratio, 0, 1);
  return rgbToHex({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t
  });
}

function contrastColor(hex) {
  const { r, g, b } = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > .55 ? "#111111" : "#FFFFFF";
}

function clean(n) {
  const v = Math.round(Number(n) * 10) / 10;
  return Number.isInteger(v) ? String(v) : String(v);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function dashArray(style) {
  if (style.dash === "dash") return "8 7";
  if (style.dash === "dot") return "3 5";
  return "";
}

function cropForLens(lens) {
  const mount = mountById(lens.mountId);
  const inferredCrop = inferredCropForLensName(lens.name);
  const isExifMount = String(mount?.id || "").startsWith("exif-crop-") || /^EXIF crop/i.test(mount?.name || "") || lens.styleId === "exif-imported";
  if (isExifMount && inferredCrop) return inferredCrop;
  return Math.max(0.1, toNumber(mount?.crop, 1));
}

function inferredCropForLensName(name) {
  const text = String(name || "").toLowerCase();
  if (!text) return null;
  if (/\b(lumix\s+s|lumix\s+s\s+pro|sigma\s+s|leica\s+sl|sony\s+fe|nikon\s+z|canon\s+rf)\b/.test(text)) return null;
  if (/(?:^|\b)(m\.?\s*zuiko|olympus\s+m\.?\s*\d+|olympus\s+m\s+\d+|om\s+\d+|om-system|om system|leica\s+dg|lumix\s+g|panasonic\s+g)(?:\b|$)/.test(text)) return 2;
  return null;
}

function normalizedCropEstimate(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  const known = [1, 1.5, 1.6, 2, 2.7];
  const close = known.find(crop => Math.abs(crop - number) <= 0.16);
  if (close) return close;
  return number >= 0.8 && number <= 3.1 ? Math.round(number * 10) / 10 : null;
}

function chartCropValues() {
  return [...new Set(state.lenses
    .map(lens => cropForLens(lens))
    .filter(crop => Number.isFinite(crop) && crop > 0)
    .map(crop => Math.round(crop * 1000) / 1000))];
}

function singleChartCrop() {
  const crops = chartCropValues();
  return crops.length === 1 ? crops[0] : null;
}

function representativeChartCrop() {
  const crops = state.lenses
    .map(lens => Math.round(cropForLens(lens) * 1000) / 1000)
    .filter(crop => Number.isFinite(crop) && crop > 0);
  if (!crops.length) return null;
  const counts = new Map();
  crops.forEach(crop => counts.set(crop, (counts.get(crop) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

function chartReferenceCrop() {
  return singleChartCrop() || representativeChartCrop() || 1;
}

function displayValue(lens, value) {
  const crop = cropForLens(lens);
  return $("displayMode").value === "equiv" ? value * crop : value;
}

function actualRange(lens) {
  return Number(lens.start) === Number(lens.end) ? `${clean(lens.start)}mm` : `${clean(lens.start)}-${clean(lens.end)}mm`;
}

function equivRange(lens) {
  const crop = cropForLens(lens);
  const s = Number(lens.start) * crop;
  const e = Number(lens.end) * crop;
  return s === e ? `${clean(s)}mm` : `${clean(s)}-${clean(e)}mm`;
}

function axisModeText() {
  return $("displayMode").value === "equiv" ? "35mm 환산 기준" : "실제 초점거리 기준";
}

function labelModeText() {
  const mode = $("labelMode")?.value || "equiv";
  if (mode === "actual") return "초점거리만";
  if (mode === "both") return "초점거리 + 35mm 환산";
  return "35mm 환산만";
}

function labelRange(lens) {
  const mode = $("labelMode")?.value || "equiv";
  if (mode === "actual") return actualRange(lens);
  if (mode === "both") {
    const actual = actualRange(lens);
    const equiv = equivRange(lens);
    return actual === equiv ? actual : `${actual} / ${equiv} eq`;
  }
  return `${equivRange(lens)} eq`;
}

function shortText(text, max = 42) {
  const cleanText = String(text || "").trim();
  return cleanText.length > max ? `${cleanText.slice(0, max - 3)}...` : cleanText;
}

function textWidth(text, min = 84, max = 360, px = 7.1) {
  return Math.max(min, Math.min(max, String(text).length * px + 24));
}

function parseFocalRange(text) {
  const normalized = String(text || "")
    .replace(/\u2013|\u2014|~|〜|～/g, "-")
    .replace(/ｍｍ/gi, "mm")
    .replace(/\s+/g, " ")
    .trim();
  const zoomPatterns = [
    /(\d+(?:\.\d+)?)\s*mm\s*-\s*(\d+(?:\.\d+)?)\s*mm/i,
    /(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*mm/i,
    /(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)(?=\s*\/)/i,
    /(?:^|[^\d.f])(\d{1,4}(?:\.\d+)?)\s*-\s*(\d{1,4}(?:\.\d+)?)(?=\s+(?:f|t|g|s|o|i|d|v|r|l|is|oss|ois|vr|pro|art|stm|usm|gm|dn|dc|dg)\b)/i
  ];

  for (const pattern of zoomPatterns) {
    const zoom = normalized.match(pattern);
    if (!zoom) continue;
    const start = Number(zoom[1]);
    const end = Number(zoom[2]);
    if (start >= 1 && end > start && end <= 3000) return { start, end, type: "zoom" };
  }

  const prime = normalized.match(/(\d+(?:\.\d+)?)\s*mm/i);
  if (prime) return { start: Number(prime[1]), end: Number(prime[1]), type: "prime" };

  const slashPrime = normalized.match(/\/\s*(\d{1,4}(?:\.\d+)?)(?=\s*(?:$|[a-z]|[-)]))/i);
  if (slashPrime) {
    const focal = Number(slashPrime[1]);
    if (focal >= 4 && focal <= 3000) return { start: focal, end: focal, type: "prime" };
  }

  return null;
}

function teleconverterFactorFromText(text) {
  const source = String(text || "");
  if (!source.includes("+")) return 1;
  const tail = source.split("+").slice(1).join(" ").toLowerCase();
  if (!tail.trim()) return 1;

  const explicit = tail.match(/(\d+(?:\.\d+)?)\s*x\b/);
  if (explicit) {
    const factor = Number(explicit[1]);
    if (factor > 1 && factor <= 3) return Math.round(factor * 100) / 100;
  }

  const code = tail.match(/\b(?:mc|tc|ec|teleconverter|converter)[\s_-]*(\d{2,3})\b/);
  if (code) {
    const raw = code[1];
    if (raw === "14") return 1.4;
    if (raw === "20") return 2;
    if (raw === "25" || raw === "125") return 1.25;
    const parsed = Number(raw) / (raw.length === 2 ? 10 : 100);
    if (parsed > 1 && parsed <= 3) return Math.round(parsed * 100) / 100;
  }

  if (/\b1\.4\b|\b14\b/.test(tail)) return 1.4;
  if (/\b2(?:\.0)?\b|\b20\b/.test(tail)) return 2;
  if (/\b1\.25\b|\b125\b/.test(tail)) return 1.25;
  return /\b(?:mc|tc|ec|teleconverter|converter)\b/.test(tail) ? 1.4 : 1;
}

function applyTeleconverterRange(range, factor) {
  if (!range || !factor || factor <= 1) return range;
  return {
    ...range,
    start: Math.round(Number(range.start) * factor * 10) / 10,
    end: Math.round(Number(range.end) * factor * 10) / 10,
    teleconverterFactor: factor
  };
}

function focalRangeWithTeleconverter(text) {
  const range = parseFocalRange(text);
  return applyTeleconverterRange(range, teleconverterFactorFromText(text));
}

function scaleFactory(min, max, width) {
  if ($("scaleMode").value === "log") {
    const a = Math.log(min);
    const b = Math.log(max);
    return value => ((Math.log(Math.max(value, 0.01)) - a) / (b - a)) * width;
  }
  return value => ((value - min) / (max - min)) * width;
}

const axisFitPresets = [7, 8, 10, 12, 14, 16, 20, 24, 28, 35, 40, 50, 70, 75, 85, 100, 135, 150, 200, 300, 400, 560, 600, 800, 1000, 1200, 1600, 2000, 2400, 3200];
const axisTickPresets = [7, 12, 20, 40, 75, 100, 150, 300, 400, 800, 1000, 1200, 1600, 2000, 2400, 3200];

function axisPresetValue(value) {
  return Math.round(Number(value) * 10) / 10;
}

function axisPresetValues(presets) {
  const crop = chartReferenceCrop();
  if ($("displayMode").value === "equiv" && crop) {
    return presets.map(value => axisPresetValue(value * crop));
  }
  return presets;
}

function uniqueAxisValues(values) {
  return [...new Set(values.map(axisPresetValue))]
    .filter(value => Number.isFinite(value))
    .sort((a, b) => a - b);
}

function ticksFor(min, max) {
  const ticks = axisPresetValues(axisTickPresets).filter(v => v > min && v < max);
  return uniqueAxisValues([min, ...ticks, max]);
}

function lensAxisValues() {
  const values = [];
  state.lenses.forEach(lens => {
    const start = displayValue(lens, Number(lens.start));
    const end = displayValue(lens, Number(lens.end));
    if (!Number.isFinite(start) || !Number.isFinite(end)) return;
    values.push(axisPresetValue(start), axisPresetValue(end));
    if ($("showTeleconverters")?.checked && lens.tc14) values.push(axisPresetValue(displayValue(lens, Number(lens.end) * 1.4)));
    if ($("showTeleconverters")?.checked && lens.tc20) values.push(axisPresetValue(displayValue(lens, Number(lens.end) * 2)));
  });
  return values.filter(value => Number.isFinite(value) && value > 0);
}

function fittedAxisRange() {
  const values = lensAxisValues();
  if (!values.length) return null;

  const minValue = Math.max(1, Math.min(...values));
  const maxValue = Math.max(...values);
  let lowerIndex = -1;
  const fitPresets = axisPresetValues(axisFitPresets);
  for (let i = fitPresets.length - 1; i >= 0; i -= 1) {
    if (fitPresets[i] < minValue) {
      lowerIndex = i;
      break;
    }
  }
  const upperIndex = fitPresets.findIndex(value => value > maxValue);
  let lower = lowerIndex >= 0 ? fitPresets[lowerIndex] : fitPresets[0];
  let upper = upperIndex >= 0 ? fitPresets[upperIndex] : Math.ceil(maxValue * 1.12);

  if (lower >= upper) {
    const nearestIndex = Math.max(0, fitPresets.findIndex(value => value >= minValue));
    lower = fitPresets[Math.max(0, nearestIndex - 1)] || Math.max(1, Math.floor(minValue * .82));
    upper = fitPresets[Math.min(fitPresets.length - 1, nearestIndex + 1)] || Math.ceil(maxValue * 1.18);
  }

  return { min: lower, max: upper };
}

function manualAxisRange() {
  const min = Math.max(0.1, Number($("axisMin").value) || 10);
  const max = Math.max(min + 1, Number($("axisMax").value) || 1600);
  return { min, max };
}

function currentAxisRange() {
  if ($("autoCropAxis")?.checked) {
    return fittedAxisRange() || manualAxisRange();
  }
  return manualAxisRange();
}

function syncAxisControls() {
  const autoCrop = $("autoCropAxis")?.checked;
  const minInput = $("axisMin");
  const maxInput = $("axisMax");
  const fitButton = $("autoFitAxisBtn");

  if (autoCrop) {
    const fitted = fittedAxisRange();
    if (fitted) {
      minInput.value = fitted.min;
      maxInput.value = fitted.max;
    }
  }

  minInput.disabled = !!autoCrop;
  maxInput.disabled = !!autoCrop;
  if (fitButton) fitButton.disabled = !!autoCrop || !state.lenses.length;
}

function makeEl(svg, tag, attrs) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v !== "" && v !== null && v !== undefined) node.setAttribute(k, v);
  });
  svg.appendChild(node);
  return node;
}

function makeText(svg, attrs, content) {
  const node = makeEl(svg, "text", attrs);
  node.textContent = content;
  return node;
}

function lensCategory(lens) {
  if (/macro/i.test(lens.name)) return "macro";
  if (lens.type === "prime" || Number(lens.start) === Number(lens.end)) return "prime";
  return "zoom";
}

function categoryLabel(type) {
  if (type === "macro") return "Macro";
  if (type === "prime") return "Prime";
  return "Zoom";
}

function chartLensName(name) {
  return String(name || "")
    .replace(/^M\.?\s*Zuiko\s+Digital\s+/i, "")
    .replace(/^LEICA\s+DG\s+/i, "")
    .replace(/^Zuiko\s+Digital\s+/i, "")
    .replace(/^OM-System\s+Zuiko\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLensLookupName(name) {
  return chartLensName(name)
    .toLowerCase()
    .replace(/\b(olympus|om-system|om system|m\.?zuiko|zuiko|digital|ed|leica|dg|lumix|panasonic|canon|nikon|sony|fujifilm|fuji|sigma|tamron|lens)\b/g, "")
    .replace(/[^a-z0-9.]+/g, "");
}

function statsFocalRange(stats) {
  const parsed = focalRangeWithTeleconverter(stats?.lensName);
  if (parsed) return parsed;
  if (stats?.lensMin && stats?.lensMax) return { start: stats.lensMin, end: stats.lensMax };
  if (!stats?.focalCounts) return null;
  const focals = Object.keys(stats.focalCounts).map(Number).filter(value => Number.isFinite(value));
  if (!focals.length) return null;
  return { start: Math.min(...focals), end: Math.max(...focals) };
}

function focalRangeScore(lens, stats) {
  const range = statsFocalRange(stats) || parseFocalRange(stats?.lensName);
  if (!range) return 0;
  const lensStart = Number(lens.start);
  const lensEnd = Number(lens.end);
  const startDelta = Math.abs(lensStart - Number(range.start));
  const endDelta = Math.abs(lensEnd - Number(range.end));
  if (lensStart === lensEnd && Math.abs(lensStart - Number(range.start)) <= 0.8) return 1.5;
  if (startDelta <= 0.8 && endDelta <= 0.8) return 2;
  if (Number(range.start) >= lensStart - 0.8 && Number(range.end) <= lensEnd + 0.8) return .7;
  return 0;
}

function roadmapExifEnabled() {
  return (exifAnalysis.result?.lenses || []).length > 0;
}

function roadmapExifStatsForLens(lens) {
  if (!roadmapExifEnabled()) return null;
  const target = normalizeLensLookupName(lens.name);
  let best = null;
  let bestScore = 0;

  (exifAnalysis.result.lenses || []).forEach(stats => {
    if (!stats.lensName || /^unknown lens$/i.test(stats.lensName)) return;
    const key = normalizeLensLookupName(stats.lensName);
    let score = 0;
    if (key && target && key === target) score += 100;
    else if (key && target && (key.includes(target) || target.includes(key))) score += 28;
    score += focalRangeScore(lens, stats);
    if (score > bestScore) {
      best = stats;
      bestScore = score;
    }
  });

  return bestScore >= 2 ? best : null;
}

function heatMaxForResult(result = exifAnalysis.result) {
  const focalValues = [];
  const fallbackValues = [];
  (result?.lenses || []).forEach(lens => {
    fallbackValues.push(Number(lens.total) || 0);
    Object.values(lens.focalCounts || {}).forEach(count => focalValues.push(Number(count) || 0));
  });
  return Math.max(1, ...(focalValues.length ? focalValues : fallbackValues));
}

function heatValueForLensStats(stats) {
  const counts = Object.values(stats?.focalCounts || {})
    .map(count => Number(count) || 0)
    .filter(count => count > 0);
  return counts.length ? Math.max(...counts) : Number(stats?.total) || 0;
}

function heatRatio(count, max, minVisible = 0) {
  const value = Number(count) || 0;
  if (value <= 0) return 0;
  const baseRatio = clamp(value / Math.max(1, Number(max) || 1), 0, 1);
  const emphasized = Math.pow(baseRatio, .58);
  return Math.max(emphasized, minVisible);
}

function heatColor(count, max, minVisible = 0) {
  const settings = currentVisualSettings();
  return mixColor(settings.heatLowColor, settings.heatHighColor, heatRatio(count, max, minVisible));
}

function heatColorWithCutoff(count, max, cutoff = .1) {
  const settings = currentVisualSettings();
  const ratio = heatRatio(count, max, 0);
  if (ratio < cutoff) return settings.heatLowColor;
  const compressed = Math.pow(clamp((ratio - cutoff) / (1 - cutoff), 0, 1), .68);
  return mixColor(settings.heatLowColor, settings.heatHighColor, compressed);
}

function activeTeleconverters() {
  const enabled = $("showTeleconverters")?.checked;
  return {
    tc14: !!enabled && state.lenses.some(lens => lens.tc14),
    tc20: !!enabled && state.lenses.some(lens => lens.tc20)
  };
}

function focalEntriesForLens(lens, stats) {
  const start = Number(lens.start);
  const end = Number(lens.end);
  const factor = Number(stats?.teleconverterFactor) || teleconverterFactorFromText(stats?.lensName);
  const baseRange = parseFocalRange(stats?.lensName);
  const shouldAdjustLegacyTc = factor > 1 && !stats?.teleconverterApplied && baseRange;
  return Object.entries(stats?.focalCounts || {})
    .map(([focal, count]) => {
      const rawFocal = Number(focal);
      const adjustedFocal = shouldAdjustLegacyTc && rawFocal >= baseRange.start - .5 && rawFocal <= baseRange.end + .5
        ? Math.round(rawFocal * factor * 10) / 10
        : rawFocal;
      return { focal: adjustedFocal, count: Number(count) || 0 };
    })
    .filter(item => Number.isFinite(item.focal) && item.count > 0 && item.focal >= start - .5 && item.focal <= end + .5)
    .sort((a, b) => a.focal - b.focal);
}

function ensureExifRoadmapStyle() {
  const existing = state.styles.find(style => style.id === "exif-imported" || style.name.toLowerCase() === "exif imported");
  if (existing) return existing;
  const style = { id: "exif-imported", name: "EXIF Imported", color: currentVisualSettings().rangeFallbackColor, dash: "solid", width: 6, weight: 850 };
  state.styles.push(style);
  return style;
}

function ensureExifRoadmapMount(crop) {
  const cleanCrop = Math.max(0.1, Math.round((Number(crop) || 1) * 10) / 10);
  const close = state.mounts.find(mount => Math.abs(Number(mount.crop) - cleanCrop) < 0.06);
  if (close) return close;
  const mount = {
    id: `exif-crop-${String(cleanCrop).replace(".", "-")}`,
    name: `EXIF crop x${clean(cleanCrop)}`,
    crop: cleanCrop,
    color: "#0F766E"
  };
  state.mounts.push(mount);
  return mount;
}

function findRoadmapLensForExif(stats) {
  const key = normalizeLensLookupName(stats.lensName);
  if (!key) return null;
  return state.lenses.find(lens => {
    const lensKey = normalizeLensLookupName(lens.name);
    if (!lensKey) return false;
    return lensKey === key || lensKey.includes(key) || key.includes(lensKey);
  }) || null;
}

function applyExifStatsToRoadmap(options = {}) {
  const { silent = false, render = true } = options;
  const lenses = exifAnalysis.result?.lenses || [];
  if (!lenses.length) {
    if (!silent) toast("적용할 EXIF 분석 결과가 없습니다.");
    return { added: 0, replaced: 0, skipped: 0 };
  }

  const fallbackCrop = chartReferenceCrop();
  let style = null;
  const nextLenses = [];
  let skipped = 0;

  lenses.forEach(stats => {
    const parsedRange = focalRangeWithTeleconverter(stats.lensName);
    const rawStart = parsedRange?.start ?? stats.lensMin ?? stats.focalMin;
    const rawEnd = parsedRange?.end ?? stats.lensMax ?? stats.focalMax;
    if (!rawStart || !rawEnd || /^unknown lens$/i.test(stats.lensName || "")) {
      skipped += 1;
      return;
    }

    const crop = inferredCropForLensName(stats.lensName) || normalizedCropEstimate(stats.cropEstimate) || fallbackCrop;
    const mount = ensureExifRoadmapMount(crop);
    const start = Math.min(Number(rawStart), Number(rawEnd));
    const end = Math.max(Number(rawStart), Number(rawEnd));
    const type = parsedRange?.type || (Math.abs(start - end) < 0.05 ? "prime" : "zoom");
    style = style || ensureExifRoadmapStyle();

    nextLenses.push({
      id: uid(),
      mountId: mount.id,
      type,
      styleId: style.id,
      name: stats.lensName,
      start,
      end,
      tc14: false,
      tc20: false
    });
  });

  if (!nextLenses.length) {
    if (!silent) toast(`로드맵으로 만들 수 있는 EXIF 렌즈가 없습니다. ${skipped}개를 건너뛰었습니다.`);
    return { added: 0, replaced: 0, skipped };
  }

  const replaced = state.lenses.length;
  state.lenses = nextLenses;
  saveState();
  if (render) renderAll();

  if (!silent) {
    toast(`기존 렌즈 ${replaced}개를 지우고 EXIF 렌즈 ${nextLenses.length}개로 로드맵을 만들었습니다.`);
  }
  return { added: nextLenses.length, replaced, skipped };
}

function chartRows() {
  return ["prime", "macro", "zoom"]
    .map(type => ({
      kind: "lensGroup",
      type,
      items: state.lenses
        .filter(l => lensCategory(l) === type)
        .sort((a, b) => Number(a.start) - Number(b.start) || Number(a.end) - Number(b.end) || a.name.localeCompare(b.name))
    }))
    .filter(row => row.items.length);
}

function axisPair(value, crop) {
  if ($("displayMode").value === "equiv") {
    return { actual: value / crop, equiv: value };
  }
  return { actual: value, equiv: value * crop };
}

function resolvedAxisLabelMode(requestedMode, crop) {
  return requestedMode || ($("displayMode").value === "equiv" ? "equiv" : "actual");
}

function renderChart() {
  const svg = $("chart");
  svg.innerHTML = "";
  const visual = currentVisualSettings();

  const rows = chartRows();
  const emptyState = $("emptyState");
  if (emptyState) {
    emptyState.hidden = rows.length > 0;
    svg.parentElement.hidden = rows.length === 0;
  }

  const rowH = 34;
  const primeRowH = 25;
  const axisTop = 32;
  const plotTop = 78;
  const leftType = 124;
  const leftChart = 176;
  const right = 64;
  const width = 1320;
  const footerH = 34;
  const crop = chartReferenceCrop();

  let contentH = 0;
  rows.forEach(row => {
    if (row.type === "zoom") contentH += Math.max(196, row.items.length * rowH + 44);
    else contentH += Math.max(138, row.items.length * primeRowH + 44);
  });

  const height = plotTop + contentH + footerH + 8;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);

  makeEl(svg, "rect", { x: 0, y: 0, width, height, fill: visual.chartBackgroundColor });
  const defs = makeEl(svg, "defs", {});

  const title = $("chartTitle").value.trim() || "Lens Roadmap";
  const modeText = axisModeText();
  const scaleText = $("scaleMode").value === "log" ? "로그 스케일" : "선형 스케일";

  $("liveTitle").textContent = title;
  $("liveDesc").textContent = `${modeText} · 상단 축 ${labelModeText()} · ${scaleText}`;

  syncAxisControls();
  const axisRange = currentAxisRange();
  const min = axisRange.min;
  const max = axisRange.max;
  const chartW = width - leftChart - right;
  const x = scaleFactory(min, max, chartW);
  const ticks = ticksFor(min, max);
  const plotBottom = height - footerH - 8;
  const plotLeft = 30;
  const plotRight = width - right;
  const labelColumnX = (plotLeft + leftType) / 2;
  const requestedLabelMode = $("labelMode")?.value || "both";
  const labelMode = resolvedAxisLabelMode(requestedLabelMode, crop);
  const tickData = ticks.map(t => ({ t, px: leftChart + x(t) }));
  const labelGap = labelMode === "both" ? 64 : 58;
  const labeledTicks = [];
  tickData.forEach((item, index) => {
    const last = labeledTicks[labeledTicks.length - 1];
    const isLast = index === tickData.length - 1;
    if (!last || item.px - last.px >= labelGap) {
      labeledTicks.push(item);
      return;
    }
    if (isLast) {
      labeledTicks.pop();
      labeledTicks.push(item);
    }
  });
  const labelTickSet = new Set(labeledTicks.map(item => item.t));

  makeText(svg, { x: labelColumnX, y: axisTop + 4, "font-size": 12, "font-weight": 800, "text-anchor": "middle", fill: visual.chartTextColor }, labelMode === "equiv" ? "35mm equivalent" : "focal length");
  if (labelMode === "both") {
    makeText(svg, { x: labelColumnX, y: axisTop + 24, "font-size": 10, "font-weight": 700, "text-anchor": "middle", fill: visual.chartTextColor }, "(35mm equivalent)");
  }

  ticks.forEach(t => {
    const px = leftChart + x(t);
    const pair = crop ? axisPair(t, crop) : { actual: t, equiv: t };
    makeEl(svg, "line", { x1: px, y1: plotTop, x2: px, y2: plotBottom, stroke: visual.chartGridColor, "stroke-width": 1.2, "stroke-dasharray": "5 7" });
    if (!labelTickSet.has(t)) return;
    if (labelMode === "both") {
      makeText(svg, { x: px, y: axisTop, "font-size": 16, "font-weight": 850, "text-anchor": "middle", fill: visual.chartTextColor }, `${clean(pair.actual)}mm`);
      makeText(svg, { x: px, y: axisTop + 20, "font-size": 11, "font-weight": 750, "text-anchor": "middle", fill: visual.chartTextColor }, `${clean(pair.equiv)}mm`);
    } else if (labelMode === "equiv") {
      makeText(svg, { x: px, y: axisTop + 8, "font-size": 16, "font-weight": 850, "text-anchor": "middle", fill: visual.chartTextColor }, `${clean(pair.equiv)}mm`);
    } else {
      makeText(svg, { x: px, y: axisTop + 8, "font-size": 16, "font-weight": 850, "text-anchor": "middle", fill: visual.chartTextColor }, `${clean(pair.actual)}mm`);
    }
  });

  makeEl(svg, "rect", { x: plotLeft, y: plotTop, width: plotRight - plotLeft, height: plotBottom - plotTop, fill: "none", stroke: visual.chartLineColor, "stroke-width": 2 });
  makeEl(svg, "line", { x1: leftType, y1: plotTop, x2: leftType, y2: plotBottom, stroke: visual.chartLineColor, "stroke-width": 2 });

  let y = plotTop;
  const deferredOverlays = [];
  let deferredOverlaysDrawn = false;
  const drawDeferredOverlays = () => {
    if (deferredOverlaysDrawn) return;
    deferredOverlays.forEach(draw => draw());
    deferredOverlaysDrawn = true;
  };
  rows.forEach(row => {
    const { type, items } = row;
    const isZoom = type === "zoom";
    const blockH = isZoom ? Math.max(196, items.length * rowH + 44) : Math.max(138, items.length * primeRowH + 44);
    makeEl(svg, "rect", { x: plotLeft, y, width: plotRight - plotLeft, height: blockH, fill: visual.plotBackgroundColor, stroke: visual.chartLineColor, "stroke-width": 1.4 });
    makeText(svg, { x: labelColumnX, y: y + blockH / 2 + 6, "font-size": 19, "font-weight": 850, "text-anchor": "middle", fill: visual.chartTextColor }, categoryLabel(type));

    const plottedItems = items.map((lens, idx) => {
      const style = styleById(lens.styleId);
      const start = Math.min(displayValue(lens, Number(lens.start)), displayValue(lens, Number(lens.end)));
      const end = Math.max(displayValue(lens, Number(lens.start)), displayValue(lens, Number(lens.end)));
      const startX = clamp(leftChart + x(start), leftChart, leftChart + chartW);
      const endX = clamp(leftChart + x(end), leftChart, leftChart + chartW);
      const label = isZoom ? shortText(chartLensName(lens.name), 46) : chartLensName(lens.name);
      const color = normalizeHexColor(style.color, visual.rangeFallbackColor);
      const cy = isZoom ? y + 33 + idx * rowH : y + 31 + idx * primeRowH;
      const exifStats = roadmapExifStatsForLens(lens);
      return { lens, idx, style, start, end, startX, endX, label, color, cy, exifStats };
    });

    if (isZoom) {
      if ($("showZoomGuides")?.checked) {
        plottedItems.forEach(item => {
          drawZoomGuide(svg, item.startX, plotTop + 1, item.cy - 8);
          drawZoomGuide(svg, item.endX, plotTop + 1, item.cy - 8);
        });
      }
      drawDeferredOverlays();
    }

    plottedItems.forEach(item => {
      const { lens, style, startX, endX, label, color, cy, end, exifStats } = item;
      if (!isZoom) {
        const labelW = textWidth(label, 82, 560, 6.1);
        const labelRightX = startX + 12;
        const labelFitsRight = labelRightX + labelW < plotRight - 8;
        const labelX = labelFitsRight ? labelRightX : startX - 12;
        const anchor = labelFitsRight ? "start" : "end";
        const maskX = anchor === "start" ? labelX - 3 : labelX - labelW - 3;
        const redraw = () => {
          const primeColor = exifStats ? heatColor(heatValueForLensStats(exifStats), heatMaxForResult(), .04) : color;
          makeEl(svg, "circle", { cx: startX, cy, r: exifStats ? 5.7 : 4.5, fill: primeColor, stroke: exifStats ? visual.chartBackgroundColor : "", "stroke-width": exifStats ? 1.5 : "" });
          makeEl(svg, "rect", { x: maskX, y: cy - 9, width: labelW + 6, height: 15, fill: visual.plotBackgroundColor });
          makeText(svg, { x: labelX, y: cy + 4, "font-size": 10.8, "font-weight": 850, "text-anchor": anchor, fill: visual.chartTextColor }, label);
        };
        deferredOverlays.push(redraw);
        return;
      }

      const markerColor = exifStats ? heatColor(heatValueForLensStats(exifStats), heatMaxForResult(), .04) : color;
      makeEl(svg, "rect", { x: startX - 6, y: cy - 5, width: 8, height: 10, fill: markerColor });
      const heatDrawn = exifStats ? drawZoomHeatmapLine(svg, defs, item, exifStats, leftChart, chartW, x, heatMaxForResult()) : false;
      if (exifStats && !heatDrawn) {
        drawZoomFallbackHeatLine(svg, item, exifStats, heatMaxForResult());
      } else if (!heatDrawn) {
        makeEl(svg, "line", { x1: startX, y1: cy, x2: endX, y2: cy, stroke: color, "stroke-width": Number(style.width) + 1, "stroke-linecap": "butt", "stroke-dasharray": dashArray(style) });
      }
      const labelW = textWidth(label, 104, 250, 6.1);
      const labelX = clamp(startX + 9, leftChart + 7, plotRight - labelW - 5);
      makeEl(svg, "rect", { x: labelX - 3, y: cy + 8, width: labelW, height: 16, fill: visual.plotBackgroundColor });
      makeText(svg, { x: labelX, y: cy + 20, "font-size": 11.5, "font-weight": style.weight, fill: visual.chartTextColor }, label);

      if ($("showTeleconverters").checked) {
        if (lens.tc14) drawTc(svg, leftChart, chartW, x, endX, cy - 2, end * 1.4, max, "#B9A37C", "", "");
        if (lens.tc20) drawTc(svg, leftChart, chartW, x, endX, cy + 2, end * 2, max, "#6F7C85", "", "");
      }
    });

    y += blockH;
  });
  drawDeferredOverlays();

  makeText(svg, { x: plotLeft + 4, y: height - 16, "font-size": 11, "font-weight": 800, fill: visual.chartTextColor }, "As of current data");

  let lx = width - 320;
  const legendY = height - 14;
  const teleconverters = activeTeleconverters();
  if (teleconverters.tc14 || teleconverters.tc20) {
    const tcLegendX = plotLeft + 132;
    let tcX = tcLegendX;
    if (teleconverters.tc14) {
      makeEl(svg, "line", { x1: tcX, y1: legendY - 4, x2: tcX + 28, y2: legendY - 4, stroke: "#B9A37C", "stroke-width": 4, "stroke-linecap": "butt" });
      makeText(svg, { x: tcX + 35, y: legendY, "font-size": 11, "font-weight": 850, fill: visual.chartTextColor }, "1.4x TC");
      tcX += 100;
    }
    if (teleconverters.tc20) {
      makeEl(svg, "line", { x1: tcX, y1: legendY - 4, x2: tcX + 28, y2: legendY - 4, stroke: "#6F7C85", "stroke-width": 4, "stroke-linecap": "butt" });
      makeText(svg, { x: tcX + 35, y: legendY, "font-size": 11, "font-weight": 850, fill: visual.chartTextColor }, "2x TC");
    }
  }
  if (roadmapExifEnabled()) {
    const heatX = plotLeft + 300;
    drawHeatLegend(svg, heatX, legendY - 4, 58, 5);
    makeText(svg, { x: heatX + 68, y: legendY, "font-size": 11, "font-weight": 850, fill: visual.chartTextColor }, "EXIF heatmap low → high");
  }
  state.styles.forEach(style => {
    const color = normalizeHexColor(style.color, visual.rangeFallbackColor);
    makeEl(svg, "rect", { x: lx, y: legendY - 8, width: 9, height: 9, fill: color });
    makeText(svg, { x: lx + 15, y: legendY, "font-size": 12, "font-weight": 850, fill: visual.chartTextColor, "font-style": "italic" }, style.name);
    lx += Math.max(82, style.name.length * 7 + 34);
  });
}

function drawTc(svg, leftChart, chartW, x, startX, y, tcEnd, max, color, dash, label) {
  if (tcEnd > max) return;
  const tcX = clamp(leftChart + x(tcEnd), leftChart, leftChart + chartW);
  makeEl(svg, "line", { x1: startX, y1: y, x2: tcX, y2: y, stroke: color, "stroke-width": 4, "stroke-linecap": "butt", "stroke-dasharray": dash });
  if (label) makeText(svg, { x: tcX + 8, y: y + 4, "font-size": 10, "font-weight": 800, fill: "#64748B" }, label);
}

function drawHeatLegend(svg, x, y, width, strokeWidth) {
  const segments = 160;
  for (let index = 0; index < segments; index += 1) {
    const x1 = x + (width * index) / segments;
    const x2 = x + (width * (index + 1)) / segments + .25;
    const count = ((index + .5) / segments) * 100;
    makeEl(svg, "line", {
      x1,
      y1: y,
      x2,
      y2: y,
      stroke: heatColorWithCutoff(count, 100, .2),
      "stroke-width": strokeWidth,
      "stroke-linecap": index === 0 || index === segments - 1 ? "round" : "butt"
    });
  }
}

function interpolateHeatCount(offset, stops) {
  if (!stops.length) return 0;
  if (offset <= stops[0].offset) return stops[0].count;
  for (let index = 1; index < stops.length; index += 1) {
    const prev = stops[index - 1];
    const next = stops[index];
    if (offset <= next.offset) {
      const span = Math.max(.001, next.offset - prev.offset);
      const linear = (offset - prev.offset) / span;
      const smooth = linear * linear * (3 - 2 * linear);
      return prev.count + (next.count - prev.count) * smooth;
    }
  }
  return stops[stops.length - 1].count;
}

function smoothedHeatCount(offset, stops, sigma) {
  if (!stops.length) return 0;
  const spread = Math.max(.25, Number(sigma) || 1);
  return stops.reduce((peak, stop) => {
    const distance = offset - stop.offset;
    const weight = Math.exp(-0.5 * (distance / spread) ** 2);
    return Math.max(peak, stop.count * weight);
  }, 0);
}

function drawZoomFallbackHeatLine(svg, item, stats, heatMax) {
  const lineStart = Math.min(item.startX, item.endX);
  const lineEnd = Math.max(item.startX, item.endX);
  if (lineEnd <= lineStart + 1) return;
  const width = Math.max(7, Number(item.style.width) + 5);
  const color = heatColorWithCutoff(heatValueForLensStats(stats), heatMax, .22);
  makeEl(svg, "line", {
    x1: lineStart,
    y1: item.cy,
    x2: lineEnd,
    y2: item.cy,
    stroke: color,
    "stroke-width": width,
    "stroke-linecap": "butt"
  });
}

function drawZoomHeatmapLine(svg, defs, item, stats, leftChart, chartW, x, heatMax) {
  const entries = focalEntriesForLens(item.lens, stats);
  if (!entries.length) return false;

  const visual = currentVisualSettings();
  const lensStart = Number(item.lens.start);
  const lensEnd = Number(item.lens.end);
  const lineStart = Math.min(item.startX, item.endX);
  const lineEnd = Math.max(item.startX, item.endX);
  const lineW = lineEnd - lineStart;
  if (lineW <= 1) return false;

  const maxCount = Math.max(1, Number(heatMax) || heatMaxForResult());
  const width = Math.max(7, Number(item.style.width) + 5);
  const measuredStops = entries
    .map(entry => {
      const px = clamp(leftChart + x(displayValue(item.lens, entry.focal)), lineStart, lineEnd);
      return {
        offset: clamp(((px - lineStart) / lineW) * 100, 0, 100),
        count: entry.count
      };
    })
    .sort((a, b) => a.offset - b.offset);

  const stops = measuredStops.slice();
  if (!stops.length) return false;
  if (entries[0].focal > lensStart + .2) stops.unshift({ offset: 0, count: 0 });
  else if (stops[0].offset > 0) stops.unshift({ offset: 0, count: stops[0].count });
  if (entries[entries.length - 1].focal < lensEnd - .2) stops.push({ offset: 100, count: 0 });
  else if (stops[stops.length - 1].offset < 100) stops.push({ offset: 100, count: stops[stops.length - 1].count });

  makeEl(svg, "line", {
    x1: lineStart,
    y1: item.cy,
    x2: lineEnd,
    y2: item.cy,
    stroke: heatColor(0, maxCount),
    "stroke-width": width + 1.5,
    "stroke-linecap": "butt",
    opacity: .75
  });

  const segments = Math.max(180, Math.min(900, Math.ceil(lineW / 1.35)));
  const sigma = clamp(100 / Math.max(96, measuredStops.length * 9), .42, 1.05);
  for (let index = 0; index < segments; index += 1) {
    const offset1 = (index / segments) * 100;
    const offset2 = ((index + 1) / segments) * 100;
    const midOffset = (offset1 + offset2) / 2;
    const x1 = lineStart + (lineW * offset1) / 100;
    const x2 = lineStart + (lineW * offset2) / 100 + .2;
    makeEl(svg, "line", {
      x1,
      y1: item.cy,
      x2,
      y2: item.cy,
      stroke: heatColorWithCutoff(smoothedHeatCount(midOffset, measuredStops, sigma), maxCount, .28),
      "stroke-width": width,
      "stroke-linecap": "butt"
    });
  }

  return true;
}

function drawZoomGuide(svg, x, y1, y2) {
  if (y2 <= y1 + 4) return;
  makeEl(svg, "line", { x1: x, y1, x2: x, y2, stroke: "#8EA2B8", "stroke-width": 1.1, "stroke-dasharray": "3 5", opacity: .72 });
}

function renderMountSelect() {
  const select = $("lensMount");
  const current = select.value;
  select.innerHTML = "";

  if (!state.mounts.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "마운트를 먼저 추가하세요";
    select.appendChild(opt);
    select.disabled = true;
    return;
  }

  select.disabled = false;
  state.mounts.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = `${m.name} · crop x${clean(m.crop)}`;
    select.appendChild(opt);
  });
  if (state.mounts.some(m => m.id === current)) select.value = current;
}

function renderStyleSelect() {
  const select = $("lensStyle");
  const current = select.value;
  select.innerHTML = "";

  if (!state.styles.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "스타일을 먼저 추가하세요";
    select.appendChild(opt);
    select.disabled = true;
    return;
  }

  select.disabled = false;
  state.styles.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name;
    select.appendChild(opt);
  });
  if (state.styles.some(s => s.id === current)) select.value = current;
}

function renderMountSummary() {
  const box = $("mountSummary");
  if (!box) return;
  box.innerHTML = "";

  if (!state.mounts.length) {
    const pill = document.createElement("span");
    pill.className = "summary-pill";
    pill.textContent = "마운트 없음";
    box.appendChild(pill);
    return;
  }

  state.mounts.forEach(m => {
    const count = state.lenses.filter(l => l.mountId === m.id).length;
    const pill = document.createElement("span");
    pill.className = "summary-pill";
    pill.innerHTML = `<span class="dot" style="background:${m.color}"></span>${m.name} · ${count}`;
    box.appendChild(pill);
  });
}

function stylePreview(style) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "style-preview");
  svg.setAttribute("viewBox", "0 0 92 24");
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", "8");
  line.setAttribute("x2", "84");
  line.setAttribute("y1", "12");
  line.setAttribute("y2", "12");
  line.setAttribute("stroke", style.color);
  line.setAttribute("stroke-width", style.width);
  line.setAttribute("stroke-linecap", "round");
  const dash = dashArray(style);
  if (dash) line.setAttribute("stroke-dasharray", dash);
  svg.appendChild(line);
  return svg;
}

function emptyRow(body, colspan, text) {
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = colspan;
  cell.className = "empty-row";
  cell.textContent = text;
  row.appendChild(cell);
  body.appendChild(row);
}

function formatCount(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function rangeLabel(min, max) {
  if (!min && !max) return "-";
  if (min === max) return `${clean(min)}mm`;
  return `${clean(min)}-${clean(max)}mm`;
}

function fileExtension(file) {
  const name = String(file?.name || "").toLowerCase();
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index + 1) : "";
}

function isJpegFile(file) {
  const ext = fileExtension(file);
  return ext === "jpg" || ext === "jpeg";
}

function isRawFile(file) {
  return rawExtensions.has(fileExtension(file));
}

function photoPath(file) {
  return file.webkitRelativePath || file.name;
}

function photoBaseKey(file) {
  return photoPath(file).replace(/\.[^.\\/]+$/i, "").toLowerCase();
}

function nextFrame() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function setProgress(barId, textId, current, total, text) {
  const bar = $(barId);
  const label = $(textId);
  const pct = total ? Math.min(100, Math.round((current / total) * 100)) : 0;
  if (bar) bar.style.width = `${pct}%`;
  if (label) label.textContent = text || (total ? `${formatCount(current)} / ${formatCount(total)}` : "대기");
}

function resetExifSummary(total = 0) {
  exifAnalysis.summary = {
    total,
    processed: 0,
    cacheHits: 0,
    parsed: 0,
    errors: 0,
    withLens: 0,
    withFocal: 0
  };
}

function renderTopFocals(topFocals) {
  const wrap = document.createElement("div");
  wrap.className = "top-focal-list";
  if (!topFocals?.length) {
    wrap.textContent = "-";
    return wrap;
  }
  topFocals.forEach(item => {
    const pill = document.createElement("span");
    pill.textContent = `${item.focal}mm · ${formatCount(item.count)}`;
    wrap.appendChild(pill);
  });
  return wrap;
}

function renderExifLensTable(lenses) {
  const body = $("exifLensTable");
  if (!body) return;
  body.innerHTML = "";
  if (!lenses.length) {
    emptyRow(body, 5, "아직 분석된 JPEG가 없습니다. 오른쪽에서 사진 폴더를 선택하세요.");
    return;
  }

  lenses.forEach(lens => {
    const row = document.createElement("tr");
    [lens.lensName, formatCount(lens.total), rangeLabel(lens.focalMin, lens.focalMax), rangeLabel(lens.equivMin, lens.equivMax)].forEach(text => {
      const cell = document.createElement("td");
      cell.textContent = text;
      row.appendChild(cell);
    });
    const topCell = document.createElement("td");
    topCell.appendChild(renderTopFocals(lens.topFocals));
    row.appendChild(topCell);
    body.appendChild(row);
  });
}

function renderExifHeatmap(result) {
  const wrap = $("exifHeatmap");
  if (!wrap) return;
  wrap.innerHTML = "";

  const lenses = result.lenses || [];
  const columns = result.focalColumns || [];
  if (!lenses.length || !columns.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = "<strong>히트맵 데이터가 없습니다.</strong><span>초점거리 EXIF가 있는 JPEG를 분석하면 여기에 표시됩니다.</span>";
    wrap.appendChild(empty);
    return;
  }

  const table = document.createElement("table");
  table.className = "heatmap-table";
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  const firstHead = document.createElement("th");
  firstHead.textContent = "Lens Name";
  headRow.appendChild(firstHead);
  columns.forEach(column => {
    const th = document.createElement("th");
    th.textContent = `${column}mm`;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  const maxCell = heatMaxForResult(result);
  lenses.forEach(lens => {
    const row = document.createElement("tr");
    const nameCell = document.createElement("td");
    nameCell.textContent = lens.lensName;
    row.appendChild(nameCell);
    columns.forEach(column => {
      const count = lens.focalCounts?.[column] || 0;
      const cell = document.createElement("td");
      cell.className = count ? "heatmap-cell" : "heatmap-cell empty";
      if (count) {
        const color = heatColor(count, maxCell);
        cell.style.background = color;
        cell.style.color = contrastColor(color);
        cell.textContent = formatCount(count);
        cell.title = `${lens.lensName} · ${column}mm · ${formatCount(count)} files`;
      }
      row.appendChild(cell);
    });
    tbody.appendChild(row);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
}

function renderExifAnalysis() {
  const scan = exifAnalysis.scan;
  const summary = exifAnalysis.summary;
  const result = exifAnalysis.result || { lenses: [], focalColumns: [], maxCellCount: 0 };

  setProgress("photoScanProgressBar", "photoScanProgressText", scan.scanned, scan.total, scan.total ? `${formatCount(scan.scanned)} / ${formatCount(scan.total)} · JPG ${formatCount(scan.jpegs)} · RAW ${formatCount(scan.raws)}` : "대기");
  setProgress("photoExifProgressBar", "photoExifProgressText", summary.processed, summary.total, summary.total ? `${formatCount(summary.processed)} / ${formatCount(summary.total)}` : "대기");

  const status = $("photoAnalysisStatus");
  if (status) status.textContent = exifAnalysis.status;
  const cancelBtn = $("cancelExifScanBtn");
  if (cancelBtn) cancelBtn.disabled = !exifAnalysis.running;
  const applyBtn = $("applyExifRoadmapBtn");
  if (applyBtn) applyBtn.disabled = exifAnalysis.running || !(result.lenses || []).length;

  const total = summary.total || Math.max(0, scan.jpegs + scan.raws - scan.rawIgnored);
  const statMap = {
    exifStatTotal: total,
    exifStatProcessed: summary.processed,
    exifStatCached: summary.cacheHits,
    exifStatLens: summary.withLens
  };
  Object.entries(statMap).forEach(([id, value]) => {
    const node = $(id);
    if (node) node.textContent = formatCount(value);
  });

  const ignored = $("exifIgnoredText");
  if (ignored) ignored.textContent = `중복 RAW ${formatCount(scan.rawIgnored)}개 제외 · 기타 ${formatCount(scan.otherIgnored)}개 제외 · 오류 ${formatCount(summary.errors)}개`;

  renderExifLensTable(result.lenses || []);
  renderExifHeatmap(result);
}

async function analyzePhotoFolder(fileList) {
  if (!fileList?.length) return;
  cancelExifAnalysis(false);

  exifAnalysis.running = true;
  exifAnalysis.cancelRequested = false;
  exifAnalysis.scan = { total: fileList.length, scanned: 0, jpegs: 0, raws: 0, rawIgnored: 0, otherIgnored: 0 };
  exifAnalysis.result = { lenses: [], focalColumns: [], maxCellCount: 0 };
  resetExifSummary(0);
  exifAnalysis.status = "폴더를 스캔하는 중입니다. 하위 폴더까지 포함해 JPEG와 RAW EXIF 후보를 골라냅니다.";
  switchTab("Exif");
  renderExifAnalysis();

  const photoEntries = new Map();
  for (let index = 0; index < fileList.length; index += 1) {
    if (exifAnalysis.cancelRequested) return;
    const file = fileList[index];
    const baseKey = photoBaseKey(file);
    if (isJpegFile(file)) {
      const previous = photoEntries.get(baseKey);
      if (previous?.kind === "raw") exifAnalysis.scan.rawIgnored += 1;
      photoEntries.set(baseKey, {
        file,
        kind: "jpeg",
        path: photoPath(file),
        name: file.name,
        size: file.size,
        lastModified: file.lastModified
      });
      exifAnalysis.scan.jpegs += 1;
    } else if (isRawFile(file)) {
      exifAnalysis.scan.raws += 1;
      if (photoEntries.has(baseKey)) {
        exifAnalysis.scan.rawIgnored += 1;
      } else {
        photoEntries.set(baseKey, {
          file,
          kind: "raw",
          path: photoPath(file),
          name: file.name,
          size: file.size,
          lastModified: file.lastModified
        });
      }
    } else {
      exifAnalysis.scan.otherIgnored += 1;
    }
    exifAnalysis.scan.scanned = index + 1;
    if (index % 1000 === 0 || index === fileList.length - 1) {
      renderExifAnalysis();
      await nextFrame();
    }
  }

  if (exifAnalysis.cancelRequested) return;
  const photoFiles = [...photoEntries.values()];
  if (!photoFiles.length) {
    exifAnalysis.running = false;
    exifAnalysis.status = "분석할 JPEG/RAW 파일을 찾지 못했습니다. 사진 파일이 있는 폴더를 선택하세요.";
    renderExifAnalysis();
    return;
  }

  resetExifSummary(photoFiles.length);
  exifAnalysis.status = `${formatCount(photoFiles.length)}개 사진을 찾았습니다. JPG가 있는 동일 RAW는 제외했고, EXIF 캐시를 확인합니다.`;
  renderExifAnalysis();
  startExifWorker(photoFiles);
}

function startExifWorker(files) {
  if (!window.Worker) {
    exifAnalysis.running = false;
    exifAnalysis.status = "이 브라우저는 Web Worker를 지원하지 않아 대용량 EXIF 분석을 실행할 수 없습니다.";
    renderExifAnalysis();
    return;
  }

  const worker = new Worker("exif-worker.js");
  exifAnalysis.worker = worker;

  worker.onmessage = event => {
    const message = event.data || {};
    if (message.type === "progress") {
      exifAnalysis.summary = message.summary;
      exifAnalysis.status = `EXIF 분석 중입니다. 캐시 ${formatCount(message.summary.cacheHits)}개, 신규 분석 ${formatCount(message.summary.parsed)}개.`;
      renderExifAnalysis();
      return;
    }

    if (message.type === "done") {
      exifAnalysis.summary = message.summary;
      exifAnalysis.result = message.result || { lenses: [], focalColumns: [], maxCellCount: 0 };
      saveStoredExifResult(exifAnalysis.result);
      exifAnalysis.running = false;
      exifAnalysis.worker = null;
      const applied = applyExifStatsToRoadmap({ silent: true, render: false });
      exifAnalysis.status = `분석 완료: ${formatCount(message.summary.processed)}개 사진, 렌즈 감지 ${formatCount(message.summary.withLens)}개, 초점거리 감지 ${formatCount(message.summary.withFocal)}개. 기존 렌즈 ${formatCount(applied.replaced)}개를 지우고 EXIF 렌즈 ${formatCount(applied.added)}개로 로드맵을 만들었습니다.`;
      worker.terminate();
      renderAll();
      switchTab("Exif");
      return;
    }

    if (message.type === "cancelled") {
      exifAnalysis.running = false;
      exifAnalysis.worker = null;
      exifAnalysis.status = "분석이 취소되었습니다.";
      worker.terminate();
      renderExifAnalysis();
      return;
    }

    if (message.type === "error") {
      exifAnalysis.running = false;
      exifAnalysis.worker = null;
      exifAnalysis.status = `분석 오류: ${message.message}`;
      worker.terminate();
      renderExifAnalysis();
    }
  };

  worker.onerror = error => {
    exifAnalysis.running = false;
    exifAnalysis.worker = null;
    exifAnalysis.status = `분석 오류: ${error.message || "Worker failed"}`;
    worker.terminate();
    renderExifAnalysis();
  };

  worker.postMessage({ type: "start", files });
}

function cancelExifAnalysis(showStatus = true) {
  if (!exifAnalysis.running && !exifAnalysis.worker) return;
  exifAnalysis.cancelRequested = true;
  if (exifAnalysis.worker) {
    exifAnalysis.worker.postMessage({ type: "cancel" });
    exifAnalysis.worker.terminate();
    exifAnalysis.worker = null;
  }
  exifAnalysis.running = false;
  if (showStatus) exifAnalysis.status = "분석이 취소되었습니다.";
  renderExifAnalysis();
}

function clearExifCache() {
  if (!window.indexedDB) {
    alert("이 브라우저는 IndexedDB를 지원하지 않아 EXIF 캐시를 사용할 수 없습니다.");
    return;
  }
  if (exifAnalysis.running) {
    alert("분석이 진행 중일 때는 캐시를 초기화할 수 없습니다. 먼저 분석을 취소해 주세요.");
    return;
  }
  if (!confirm("이 브라우저에 저장된 EXIF 분석 캐시를 삭제할까요? 사진 파일은 건드리지 않습니다.")) return;

  const dbNames = ["lensRoadmapExifCacheV5", "lensRoadmapExifCacheV4", "lensRoadmapExifCacheV3", "lensRoadmapExifCacheV2", "lensRoadmapExifCacheV1"];
  let done = 0;
  let failed = false;
  const finish = () => {
    exifAnalysis.summary.cacheHits = 0;
    exifAnalysis.result = emptyExifResult();
    saveStoredExifResult(exifAnalysis.result);
    exifAnalysis.status = "EXIF 캐시를 초기화했습니다. 다음 분석에서는 JPEG/RAW를 다시 읽습니다.";
    renderAll();
    toast("EXIF 캐시를 초기화했습니다.");
  };

  dbNames.forEach(name => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => {
      done += 1;
      if (done === dbNames.length && !failed) finish();
    };
    request.onerror = () => {
      failed = true;
      alert("EXIF 캐시를 초기화하지 못했습니다. 브라우저 저장소 권한을 확인해 주세요.");
    };
    request.onblocked = () => {
      exifAnalysis.status = "캐시 초기화가 대기 중입니다. 다른 탭에서 이 앱을 닫은 뒤 다시 시도해 주세요.";
      renderExifAnalysis();
    };
  });
}

function renderTables() {
  const mountBody = $("mountTable");
  const styleBody = $("styleTable");
  const lensBody = $("lensTable");
  mountBody.innerHTML = "";
  styleBody.innerHTML = "";
  lensBody.innerHTML = "";

  if (!state.mounts.length) {
    emptyRow(mountBody, 5, "마운트가 없습니다. 프리셋을 누르거나 새 마운트를 추가하세요.");
  } else {
    const mountTmpl = $("mountRowTemplate");
    state.mounts.forEach(m => {
      const row = mountTmpl.content.cloneNode(true);
      row.querySelector(".mount-name").textContent = m.name;
      row.querySelector(".mount-crop").textContent = `x${clean(m.crop)}`;
      row.querySelector(".mount-count").textContent = `${state.lenses.filter(l => l.mountId === m.id).length}개`;
      const swatch = document.createElement("div");
      swatch.className = "color-swatch";
      swatch.style.background = m.color;
      const input = document.createElement("input");
      input.type = "color";
      input.className = "table-color";
      input.value = normalizeHexColor(m.color, "#111827");
      input.addEventListener("input", () => {
        m.color = normalizeHexColor(input.value, m.color);
        swatch.style.background = m.color;
        saveState();
        renderMountSummary();
        renderChart();
      });
      row.querySelector(".mount-color").append(swatch, input);
      row.querySelector("button").addEventListener("click", () => deleteMount(m.id));
      mountBody.appendChild(row);
    });
  }

  if (!state.styles.length) {
    emptyRow(styleBody, 6, "스타일이 없습니다. 기본 스타일이나 새 스타일을 추가하세요.");
  } else {
    const styleTmpl = $("styleRowTemplate");
    state.styles.forEach(style => {
      const row = styleTmpl.content.cloneNode(true);
      row.querySelector(".style-name").textContent = style.name;
      row.querySelector(".style-count").textContent = `${state.lenses.filter(l => l.styleId === style.id).length}개`;
      const preview = stylePreview(style);
      const input = document.createElement("input");
      input.type = "color";
      input.className = "table-color";
      input.value = normalizeHexColor(style.color, "#667085");
      input.addEventListener("input", () => {
        style.color = normalizeHexColor(input.value, style.color);
        const line = preview.querySelector("line");
        if (line) line.setAttribute("stroke", style.color);
        saveState();
        renderChart();
      });
      row.querySelector(".style-preview-cell").append(preview, input);
      row.querySelector(".style-dash").textContent = style.dash === "solid" ? "실선" : style.dash === "dash" ? "긴 점선" : "짧은 점선";
      row.querySelector(".style-width").textContent = style.width;
      row.querySelector("button").addEventListener("click", () => deleteStyle(style.id));
      styleBody.appendChild(row);
    });
  }

  if (!state.lenses.length) {
    emptyRow(lensBody, 7, "아직 렌즈가 없습니다. 왼쪽의 렌즈 빠르게 추가 패널을 사용하세요.");
  } else {
    const lensTmpl = $("lensRowTemplate");
    state.lenses.forEach(lens => {
      const mount = mountById(lens.mountId);
      const style = styleById(lens.styleId);
      const row = lensTmpl.content.cloneNode(true);
      row.querySelector(".lens-name").textContent = lens.name;
      row.querySelector(".lens-mount").textContent = mount ? mount.name : "Unknown";
      row.querySelector(".lens-type").textContent = lens.type === "prime" ? "Prime" : "Zoom";
      row.querySelector(".lens-actual").textContent = actualRange(lens);
      row.querySelector(".lens-equiv").textContent = equivRange(lens);
      row.querySelector(".lens-style").textContent = style.name;
      row.querySelector("button").addEventListener("click", () => {
        state.lenses = state.lenses.filter(x => x.id !== lens.id);
        saveState();
        renderAll();
      });
      lensBody.appendChild(row);
    });
  }
}

function renderAll() {
  renderMountSelect();
  renderStyleSelect();
  renderMountSummary();
  renderChart();
  renderTables();
  renderExifAnalysis();
  updateLensPreview();
}

function slug(text) {
  return text.toLowerCase().trim().replace(/[^a-z0-9가-힣]+/gi, "-").replace(/^-|-$/g, "") || "custom";
}

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.hidden = true, 1700);
}

function addMount(name, crop, color, selectAfter = true) {
  const cleanName = String(name || "").trim();
  const cleanCrop = toNumber(crop);
  if (!cleanName || !cleanCrop) {
    alert("마운트 이름과 크롭 팩터를 입력해 주세요.");
    return null;
  }

  const existing = state.mounts.find(m => m.name.toLowerCase() === cleanName.toLowerCase());
  if (existing) {
    if (selectAfter) $("lensMount").value = existing.id;
    toast(`${existing.name} 마운트를 선택했습니다.`);
    updateLensPreview();
    return existing;
  }

  const mount = { id: `${slug(cleanName)}-${Math.random().toString(36).slice(2, 7)}`, name: cleanName, crop: cleanCrop, color };
  state.mounts.push(mount);
  saveState();
  renderAll();
  if (selectAfter) $("lensMount").value = mount.id;
  updateLensPreview();
  toast(`${mount.name} 마운트를 추가했습니다.`);
  return mount;
}

function addStyle(name, color, dash = "solid", width = 5, weight = 800, selectAfter = true) {
  const cleanName = String(name || "").trim();
  if (!cleanName) {
    alert("스타일 이름을 입력해 주세요.");
    return null;
  }

  const existing = state.styles.find(s => s.name.toLowerCase() === cleanName.toLowerCase());
  if (existing) {
    if (selectAfter) $("lensStyle").value = existing.id;
    toast(`${existing.name} 스타일을 선택했습니다.`);
    updateLensPreview();
    return existing;
  }

  const style = { id: `${slug(cleanName)}-${Math.random().toString(36).slice(2, 7)}`, name: cleanName, color, dash, width: Number(width) || 5, weight: Number(weight) || 800 };
  state.styles.push(style);
  saveState();
  renderAll();
  if (selectAfter) $("lensStyle").value = style.id;
  updateLensPreview();
  toast(`${style.name} 스타일을 추가했습니다.`);
  return style;
}

function deleteMount(id) {
  const mount = mountById(id);
  if (!mount) return;
  if (!confirm(`${mount.name} 마운트와 해당 렌즈를 모두 삭제하시겠습니까?`)) return;
  state.mounts = state.mounts.filter(m => m.id !== id);
  state.lenses = state.lenses.filter(l => l.mountId !== id);
  saveState();
  renderAll();
}

function deleteStyle(id) {
  const style = styleById(id);
  const used = state.lenses.filter(l => l.styleId === id).length;
  if (used > 0) {
    alert("이 스타일을 사용하는 렌즈가 있습니다. 먼저 렌즈를 삭제하거나 다른 스타일로 바꿔 주세요.");
    return;
  }
  if (!confirm(`${style.name} 스타일을 삭제하시겠습니까?`)) return;
  state.styles = state.styles.filter(s => s.id !== id);
  saveState();
  renderAll();
}

function applyParsedFocal(force = false) {
  const parsed = focalRangeWithTeleconverter($("lensName").value);
  if (!parsed) {
    if (force) toast("렌즈 이름에서 mm 값을 찾지 못했습니다.");
    return false;
  }

  if (force || !$("focalStart").value) $("focalStart").value = clean(parsed.start);
  if (force || !$("focalEnd").value) $("focalEnd").value = clean(parsed.end);
  if (force || !$("lensType").value) $("lensType").value = parsed.type;
  if (force) toast(`${clean(parsed.start)}-${clean(parsed.end)}mm 값을 입력했습니다.`);
  updateLensPreview();
  return true;
}

function updateLensPreview() {
  const preview = $("lensPreview");
  if (!preview) return;

  const addBtn = $("addLensBtn");
  const canAddBase = state.mounts.length > 0 && state.styles.length > 0;
  if (addBtn) addBtn.disabled = !canAddBase;

  if (!state.mounts.length) {
    preview.textContent = "먼저 마운트를 추가해 주세요. 프리셋을 누르면 바로 시작할 수 있습니다.";
    return;
  }
  if (!state.styles.length) {
    preview.textContent = "먼저 스타일을 추가해 주세요.";
    return;
  }

  const start = Number($("focalStart").value);
  const end = $("focalEnd").value ? Number($("focalEnd").value) : start;
  if (!start || !end) {
    preview.textContent = "렌즈 정보를 입력하면 실제/환산 화각이 여기에 표시됩니다.";
    return;
  }

  const lens = {
    mountId: $("lensMount").value,
    start: Math.min(start, end),
    end: Math.max(start, end)
  };
  const mount = mountById(lens.mountId);
  preview.textContent = `${mount?.name || "선택된 마운트"} · 실제 ${actualRange(lens)} · 35mm 환산 ${equivRange(lens)} · 환산값은 상단 축에서 표시됩니다.`;
}

function addLens() {
  if (!state.mounts.length) {
    alert("먼저 마운트를 만들어 주세요.");
    return;
  }
  if (!state.styles.length) {
    alert("먼저 스타일을 만들어 주세요.");
    return;
  }

  applyParsedFocal(false);

  const name = $("lensName").value.trim();
  const rawStart = Number($("focalStart").value);
  const rawEnd = $("focalEnd").value ? Number($("focalEnd").value) : rawStart;

  if (!name || !rawStart || !rawEnd) {
    alert("렌즈 이름, 시작 mm, 끝 mm를 입력해 주세요.");
    return;
  }

  const start = Math.min(rawStart, rawEnd);
  const end = Math.max(rawStart, rawEnd);

  state.lenses.push({
    id: uid(),
    mountId: $("lensMount").value,
    type: start === end ? "prime" : $("lensType").value,
    styleId: $("lensStyle").value,
    name,
    start,
    end,
    tc14: $("tc14").checked,
    tc20: $("tc20").checked
  });

  $("lensName").value = "";
  $("focalStart").value = "";
  $("focalEnd").value = "";
  $("tc14").checked = false;
  $("tc20").checked = false;

  saveState();
  renderAll();
  switchTab("Lenses");
  toast("렌즈를 추가했습니다.");
}

function autoFitAxis() {
  if (!state.lenses.length) {
    toast("축에 맞출 렌즈가 없습니다.");
    return;
  }

  const fitted = fittedAxisRange();
  if (!fitted) {
    toast("축에 맞출 렌즈가 없습니다.");
    return;
  }

  $("axisMin").value = fitted.min;
  $("axisMax").value = fitted.max;
  renderChart();
  toast("현재 렌즈 범위에 맞춰 축을 조정했습니다.");
}

function chartSvgBlobUrl() {
  const source = $("chart").cloneNode(true);
  source.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const vb = $("chart").viewBox.baseVal;
  source.setAttribute("width", Math.round(vb.width));
  source.setAttribute("height", Math.round(vb.height));
  const xml = new XMLSerializer().serializeToString(source);
  const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
  return URL.createObjectURL(blob);
}

function exportImage(format) {
  saveChartSettings();
  saveVisualSettings();
  renderChart();
  const mime = format === "webp" ? "image/webp" : format === "jpg" ? "image/jpeg" : "image/png";
  const extension = format === "webp" ? "webp" : format === "jpg" ? "jpg" : "png";
  const url = chartSvgBlobUrl();
  const visual = currentVisualSettings();
  const img = new Image();
  img.onload = () => {
    const vb = $("chart").viewBox.baseVal;
    const canvas = document.createElement("canvas");
    const scale = Math.min(2, Math.max(1, window.devicePixelRatio || 1.5));
    canvas.width = Math.round(vb.width * scale);
    canvas.height = Math.round(vb.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      URL.revokeObjectURL(url);
      alert("이미지를 생성할 수 없습니다. 브라우저를 새로고침한 뒤 다시 시도해 주세요.");
      return;
    }
    ctx.fillStyle = visual.chartBackgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    canvas.toBlob(blob => {
      if (!blob) {
        alert(`${extension.toUpperCase()} 파일을 만들 수 없습니다.`);
        return;
      }
      if (format === "webp" && blob.type !== mime) {
        alert("현재 브라우저가 WebP 저장을 지원하지 않습니다. PNG 저장을 사용해 주세요.");
        return;
      }
      if (format === "jpg" && blob.type !== mime) {
        alert("현재 브라우저가 JPG 저장을 지원하지 않습니다. PNG 저장을 사용해 주세요.");
        return;
      }
      downloadBlob(blob, `lens-roadmap.${extension}`, mime);
    }, mime, format === "webp" ? 0.92 : format === "jpg" ? 0.94 : undefined);
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    alert("차트 이미지를 읽을 수 없습니다. 입력값을 확인한 뒤 다시 시도해 주세요.");
  };
  img.src = url;
}

function exportPng() {
  exportImage("png");
}

function exportJpg() {
  exportImage("jpg");
}

function exportWebp() {
  exportImage("webp");
}

function downloadBlob(content, filename, type) {
  if (!content) return;
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportJson() {
  const data = {
    version: 4,
    settings: readChartSettingsFromDom(),
    visualSettings: currentVisualSettings(),
    ...state
  };
  downloadBlob(JSON.stringify(data, null, 2), "lens-roadmap-data.json", "application/json;charset=utf-8");
}

function importJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data.mounts) || !Array.isArray(data.lenses)) throw new Error("Invalid JSON");
      state = normalizeState({
        mounts: data.mounts,
        styles: Array.isArray(data.styles) ? data.styles : clone(defaultData.styles),
        lenses: data.lenses.map(l => ({
          id: l.id || uid(),
          mountId: l.mountId,
          type: l.type,
          styleId: l.styleId || (l.style === "premium" || l.style === "pro" ? "premium" : l.style === "vintage" ? "vintage" : "standard"),
          name: l.name,
          start: l.start,
          end: l.end,
          tc14: !!l.tc14,
          tc20: !!l.tc20
        }))
      });
      if (data.settings) {
        applyChartSettingsToDom({
          ...defaultChartSettings,
          ...loadChartSettings(),
          ...data.settings
        });
        saveChartSettings();
      }
      if (data.visualSettings) {
        visualSettings = Object.fromEntries(Object.entries(defaultVisualSettings).map(([key, fallback]) => [key, normalizeHexColor(data.visualSettings[key], fallback)]));
        saveVisualSettings();
        applyVisualSettingsToDom();
      }
      saveState();
      renderAll();
      toast("JSON을 불러왔습니다.");
    } catch {
      alert("올바른 JSON 파일이 아닙니다.");
    }
  };
  reader.readAsText(file);
}

const sheetAliases = {
  name: ["렌즈명", "렌즈 이름", "렌즈", "lens name", "lens", "name"],
  mount: ["마운트", "mount", "mount name", "system"],
  crop: ["크롭", "크롭팩터", "crop", "crop factor"],
  style: ["스타일", "등급", "라인", "style", "line", "grade"],
  focal: ["초점거리", "화각", "focal", "focal length", "range", "mm"],
  start: ["시작mm", "시작 mm", "시작", "start", "start mm", "wide"],
  end: ["끝mm", "끝 mm", "끝", "end", "end mm", "tele"],
  type: ["유형", "타입", "type"],
  tc14: ["1.4x", "tc14", "tc 1.4", "teleconverter 1.4"],
  tc20: ["2x", "tc20", "tc 2", "teleconverter 2"]
};

function sheetKey(value) {
  return String(value || "").toLowerCase().replace(/[\s_\-().:/]/g, "");
}

function sheetValue(row, key) {
  const aliases = sheetAliases[key].map(sheetKey);
  const entry = Object.entries(row).find(([header]) => aliases.includes(sheetKey(header)));
  return entry ? entry[1] : "";
}

function sheetNumber(value) {
  return toNumber(value);
}

function sheetBool(value) {
  if (value === true) return true;
  const text = String(value || "").trim().toLowerCase();
  return ["1", "true", "yes", "y", "o", "ok", "on", "v", "가능", "지원", "사용", "체크"].includes(text);
}

function sheetType(value, start, end) {
  const text = String(value || "").toLowerCase();
  if (text.includes("prime") || text.includes("단")) return "prime";
  if (text.includes("zoom") || text.includes("줌")) return "zoom";
  return Number(start) === Number(end) ? "prime" : "zoom";
}

function ensureSheetMount(name, crop) {
  const fallback = state.mounts[0] || { name: "Default Mount", crop: 1, color: "#111827" };
  const cleanName = String(name || fallback.name).trim() || "Default Mount";
  const parsedCrop = toNumber(crop);
  const cleanCrop = parsedCrop || toNumber(fallback.crop, 1);
  const existing = state.mounts.find(m => m.name.toLowerCase() === cleanName.toLowerCase());
  if (existing) {
    if (!existing.crop && cleanCrop) existing.crop = cleanCrop;
    return existing;
  }

  const colors = ["#111827", "#2563EB", "#64748B", "#7C3AED", "#059669", "#DC2626"];
  const mount = {
    id: `${slug(cleanName)}-${Math.random().toString(36).slice(2, 7)}`,
    name: cleanName,
    crop: cleanCrop,
    color: colors[state.mounts.length % colors.length]
  };
  state.mounts.push(mount);
  return mount;
}

function ensureSheetStyle(name) {
  const fallback = state.styles[0] || { name: "Standard", color: "#667085", dash: "solid", width: 5, weight: 800 };
  const cleanName = String(name || fallback.name).trim() || "Standard";
  const existing = state.styles.find(s => s.name.toLowerCase() === cleanName.toLowerCase());
  if (existing) return existing;

  const style = {
    id: `${slug(cleanName)}-${Math.random().toString(36).slice(2, 7)}`,
    name: cleanName,
    color: fallback.color || "#667085",
    dash: "solid",
    width: 5,
    weight: /standard|basic|보급/i.test(cleanName) ? 650 : 800
  };
  state.styles.push(style);
  return style;
}

function lensFromSheetRow(row) {
  const name = String(sheetValue(row, "name") || "").trim();
  const focalText = sheetValue(row, "focal");
  let start = sheetNumber(sheetValue(row, "start"));
  let end = sheetNumber(sheetValue(row, "end"));
  const parsed = parseFocalRange(focalText) || focalRangeWithTeleconverter(name);

  if (!start && parsed) start = parsed.start;
  if (!end && parsed) end = parsed.end;
  if (!end) end = start;
  if (!name || !start || !end) return null;

  const mount = ensureSheetMount(sheetValue(row, "mount"), sheetNumber(sheetValue(row, "crop")));
  const style = ensureSheetStyle(sheetValue(row, "style"));
  const cleanStart = Math.min(start, end);
  const cleanEnd = Math.max(start, end);

  return {
    id: uid(),
    mountId: mount.id,
    type: sheetType(sheetValue(row, "type"), cleanStart, cleanEnd),
    styleId: style.id,
    name,
    start: cleanStart,
    end: cleanEnd,
    tc14: sheetBool(sheetValue(row, "tc14")),
    tc20: sheetBool(sheetValue(row, "tc20"))
  };
}

function sheetLib() {
  if (typeof XLSX !== "undefined") return XLSX;
  if (typeof globalThis !== "undefined" && globalThis.XLSX) return globalThis.XLSX;
  return null;
}

function importSheet(file) {
  const xlsx = sheetLib();
  if (!xlsx) {
    alert("Excel 파일을 읽는 라이브러리를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const workbook = xlsx.read(reader.result, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });
      let imported = 0;
      let skipped = 0;

      rows.forEach(row => {
        const lens = lensFromSheetRow(row);
        if (!lens) {
          skipped += 1;
          return;
        }
        state.lenses.push(lens);
        imported += 1;
      });

      if (!imported) {
        alert("가져올 렌즈를 찾지 못했습니다. 양식의 렌즈명과 초점거리 열을 확인해 주세요.");
        return;
      }

      saveState();
      renderAll();
      toast(skipped ? `${imported}개 렌즈를 가져왔고 ${skipped}개 행은 건너뛰었습니다.` : `${imported}개 렌즈를 가져왔습니다.`);
    } catch {
      alert("Excel 파일을 읽지 못했습니다. .xlsx, .xls, .csv 형식인지 확인해 주세요.");
    }
  };
  reader.readAsArrayBuffer(file);
}

function downloadSheetTemplate() {
  const rows = [
    { "렌즈명": "M.Zuiko Digital ED 12-40mm F2.8 PRO II", "마운트": "Micro Four Thirds", "크롭": 2, "스타일": "PRO / Leica", "초점거리": "12-40mm", "시작mm": 12, "끝mm": 40, "유형": "Zoom", "1.4x": "", "2x": "" },
    { "렌즈명": "M.Zuiko Digital ED 25mm F1.2 PRO", "마운트": "Micro Four Thirds", "크롭": 2, "스타일": "PRO / Leica", "초점거리": "25mm", "시작mm": 25, "끝mm": 25, "유형": "Prime", "1.4x": "", "2x": "" }
  ];

  const xlsx = sheetLib();
  if (xlsx) {
    const worksheet = xlsx.utils.json_to_sheet(rows);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Lenses");
    const content = xlsx.write(workbook, { bookType: "xlsx", type: "array" });
    downloadBlob(new Blob([content], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "lens-roadmap-template.xlsx");
    return;
  }

  const headers = Object.keys(rows[0]);
  const csv = "\uFEFF" + [headers.join(","), ...rows.map(row => headers.map(header => `"${String(row[header] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
  downloadBlob(csv, "lens-roadmap-template.csv", "text/csv;charset=utf-8");
}

function switchTab(tab) {
  const panelByTab = {
    Mounts: "mountPanel",
    Styles: "stylePanel",
    Lenses: "lensPanel",
    Exif: "exifPanel"
  };

  Object.keys(panelByTab).forEach(name => {
    $(`tab${name}`).classList.toggle("active", name === tab);
    $(panelByTab[name]).hidden = name !== tab;
  });
}

function bind() {
  $("addMountBtn").addEventListener("click", () => {
    addMount($("newMountName").value, $("newMountCrop").value, $("newMountColor").value);
    $("newMountName").value = "";
  });

  document.querySelectorAll(".mount-preset").forEach(btn => {
    btn.addEventListener("click", () => {
      $("newMountName").value = btn.dataset.name;
      $("newMountCrop").value = btn.dataset.crop;
      $("newMountColor").value = btn.dataset.color;
      addMount(btn.dataset.name, btn.dataset.crop, btn.dataset.color);
    });
  });

  $("addStyleBtn").addEventListener("click", () => {
    addStyle($("newStyleName").value, $("newStyleColor").value, $("newStyleDash").value, $("newStyleWidth").value, $("newStyleWeight").value);
    $("newStyleName").value = "";
  });

  document.querySelectorAll(".style-preset").forEach(btn => {
    btn.addEventListener("click", () => {
      $("newStyleName").value = btn.dataset.name;
      $("newStyleColor").value = btn.dataset.color;
      addStyle(btn.dataset.name, btn.dataset.color, "solid", 5, 800);
    });
  });

  $("parseLensBtn").addEventListener("click", () => applyParsedFocal(true));
  $("addLensBtn").addEventListener("click", addLens);
  $("autoFitAxisBtn").addEventListener("click", autoFitAxis);
  $("savePngBtn").addEventListener("click", exportPng);
  $("saveJpgBtn").addEventListener("click", exportJpg);
  $("saveWebpBtn").addEventListener("click", exportWebp);
  $("exportJsonBtn").addEventListener("click", exportJson);
  $("importJsonInput").addEventListener("change", e => e.target.files[0] && importJson(e.target.files[0]));
  $("downloadSheetTemplateBtn").addEventListener("click", downloadSheetTemplate);
  $("importSheetInput").addEventListener("change", e => e.target.files[0] && importSheet(e.target.files[0]));
  $("photoFolderInput").addEventListener("change", e => {
    const files = Array.from(e.target.files || []);
    analyzePhotoFolder(files);
    e.target.value = "";
  });
  $("photoFilesInput").addEventListener("change", e => {
    const files = Array.from(e.target.files || []);
    analyzePhotoFolder(files);
    e.target.value = "";
  });
  $("applyExifRoadmapBtn").addEventListener("click", () => applyExifStatsToRoadmap());
  $("cancelExifScanBtn").addEventListener("click", () => cancelExifAnalysis());
  $("clearExifCacheBtn").addEventListener("click", clearExifCache);

  $("lensName").addEventListener("input", () => {
    applyParsedFocal(false);
    updateLensPreview();
  });
  ["lensMount", "lensStyle", "lensType", "focalStart", "focalEnd", "tc14", "tc20"].forEach(id => {
    $(id).addEventListener("input", updateLensPreview);
    $(id).addEventListener("change", updateLensPreview);
  });
  ["lensName", "focalStart", "focalEnd"].forEach(id => {
    $(id).addEventListener("keydown", e => {
      if (e.key === "Enter") addLens();
    });
  });

  $("loadSampleBtn").addEventListener("click", () => {
    state = clone(defaultData);
    saveState();
    renderAll();
    toast("샘플을 불러왔습니다.");
  });

  $("clearBtn").addEventListener("click", () => {
    if (!confirm("전체 마운트, 스타일, 렌즈를 삭제하시겠습니까?")) return;
    state = { mounts: [], styles: [], lenses: [] };
    saveState();
    renderAll();
  });

  ["displayMode", "labelMode", "scaleMode", "chartTitle", "autoCropAxis", "axisMin", "axisMax", "showTeleconverters", "showZoomGuides"].forEach(id => {
    $(id).addEventListener("input", () => {
      saveChartSettings();
      renderChart();
      updateLensPreview();
    });
    $(id).addEventListener("change", () => {
      saveChartSettings();
      renderChart();
      updateLensPreview();
    });
  });

  Object.keys(defaultVisualSettings).forEach(id => {
    const node = $(id);
    if (!node) return;
    node.addEventListener("input", () => {
      visualSettings = readVisualSettingsFromDom();
      saveVisualSettings();
      renderChart();
      renderExifHeatmap(exifAnalysis.result);
    });
  });

  $("tabMounts").addEventListener("click", () => switchTab("Mounts"));
  $("tabStyles").addEventListener("click", () => switchTab("Styles"));
  $("tabLenses").addEventListener("click", () => switchTab("Lenses"));
  $("tabExif").addEventListener("click", () => switchTab("Exif"));
}

bind();
applyChartSettingsToDom();
applyVisualSettingsToDom();
renderAll();
