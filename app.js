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

function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

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
      crop: Math.max(0.1, Number(m.crop) || 1),
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

function displayValue(lens, value) {
  const mount = mountById(lens.mountId);
  const crop = mount ? Number(mount.crop) : 1;
  return $("displayMode").value === "equiv" ? value * crop : value;
}

function actualRange(lens) {
  return Number(lens.start) === Number(lens.end) ? `${clean(lens.start)}mm` : `${clean(lens.start)}-${clean(lens.end)}mm`;
}

function equivRange(lens) {
  const mount = mountById(lens.mountId);
  const crop = mount ? Number(mount.crop) : 1;
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
  const normalized = String(text || "").replace(/\u2013|\u2014/g, "-");
  const zoom = normalized.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*mm/i);
  if (zoom) return { start: Number(zoom[1]), end: Number(zoom[2]), type: "zoom" };

  const prime = normalized.match(/(\d+(?:\.\d+)?)\s*mm/i);
  if (prime) return { start: Number(prime[1]), end: Number(prime[1]), type: "prime" };

  return null;
}

function scaleFactory(min, max, width) {
  if ($("scaleMode").value === "log") {
    const a = Math.log(min);
    const b = Math.log(max);
    return value => ((Math.log(Math.max(value, 0.01)) - a) / (b - a)) * width;
  }
  return value => ((value - min) / (max - min)) * width;
}

function ticksFor(min, max) {
  const base = [7, 12, 20, 40, 75, 100, 150, 300, 400, 800, 1000, 1200, 1600, 2000, 2400, 3200];
  return base.filter(v => v >= min && v <= max);
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

function chartRows() {
  const rows = [];
  state.mounts.forEach(mount => {
    const mountLenses = state.lenses.filter(l => l.mountId === mount.id);
    if (!mountLenses.length) return;
    rows.push({ kind: "mountHeader", mount });
    ["prime", "macro", "zoom"].forEach(type => {
      const items = mountLenses.filter(l => lensCategory(l) === type);
      if (items.length) rows.push({ kind: "lensGroup", mount, type, items });
    });
  });
  return rows;
}

function referenceCrop(rows) {
  const mountRow = rows.find(row => row.kind === "mountHeader");
  return mountRow ? Number(mountRow.mount.crop) || 1 : 1;
}

function axisPair(value, crop) {
  if ($("displayMode").value === "equiv") {
    return { actual: value / crop, equiv: value };
  }
  return { actual: value, equiv: value * crop };
}

function drawLensIcon(svg, x, y, color, variant = "dark") {
  const body = variant === "light" ? "#4B5563" : "#111827";
  makeEl(svg, "rect", { x: x - 13, y: y - 6, width: 22, height: 12, rx: 3, fill: body, stroke: "#0F172A", "stroke-width": .7 });
  makeEl(svg, "rect", { x: x - 6, y: y - 8, width: 11, height: 16, rx: 3, fill: "#1F2937", stroke: "#0F172A", "stroke-width": .7 });
  makeEl(svg, "ellipse", { cx: x + 9, cy: y, rx: 5, ry: 8, fill: color, opacity: .92, stroke: "#0F172A", "stroke-width": .7 });
  makeEl(svg, "ellipse", { cx: x + 9, cy: y, rx: 2.6, ry: 5, fill: "#E5E7EB", opacity: .42 });
}

function renderChart() {
  const svg = $("chart");
  svg.innerHTML = "";

  const rows = chartRows();
  const emptyState = $("emptyState");
  if (emptyState) {
    emptyState.hidden = rows.length > 0;
    svg.parentElement.hidden = rows.length === 0;
  }

  const rowH = 42;
  const groupHeaderH = 30;
  const axisTop = 42;
  const plotTop = 104;
  const leftType = 140;
  const leftChart = 220;
  const right = 42;
  const width = 1520;
  const footerH = 58;
  const crop = referenceCrop(rows);

  let contentH = 0;
  rows.forEach(row => {
    if (row.kind === "mountHeader") {
      contentH += groupHeaderH;
      return;
    }
    if (row.type === "zoom") contentH += Math.max(160, row.items.length * rowH + 40);
    else contentH += Math.max(230, Math.ceil(row.items.length / 4) * 132 + 28);
  });

  const height = Math.max(720, plotTop + contentH + footerH);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);

  makeEl(svg, "rect", { x: 0, y: 0, width, height, fill: "#FFFFFF" });

  const title = $("chartTitle").value.trim() || "Lens Roadmap";
  const modeText = axisModeText();
  const scaleText = $("scaleMode").value === "log" ? "로그 스케일" : "선형 스케일";

  $("liveTitle").textContent = title;
  $("liveDesc").textContent = `${modeText} · 상단 축 ${labelModeText()} · ${scaleText}`;

  const min = Math.max(0.1, Number($("axisMin").value) || 10);
  const max = Math.max(min + 1, Number($("axisMax").value) || 1600);
  const chartW = width - leftChart - right;
  const x = scaleFactory(min, max, chartW);
  const ticks = ticksFor(min, max);
  const plotBottom = height - footerH - 8;
  const plotLeft = 30;
  const plotRight = width - right;
  const labelMode = $("labelMode")?.value || "both";
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

  makeText(svg, { x: 76, y: axisTop + 5, "font-size": 14, "font-weight": 800, "text-anchor": "middle", fill: "#111827" }, labelMode === "equiv" ? "35mm equivalent" : "focal length");
  if (labelMode === "both") {
    makeText(svg, { x: 76, y: axisTop + 29, "font-size": 12, "font-weight": 700, "text-anchor": "middle", fill: "#111827" }, "(35mm equivalent)");
  }

  ticks.forEach(t => {
    const px = leftChart + x(t);
    const pair = axisPair(t, crop);
    makeEl(svg, "line", { x1: px, y1: plotTop, x2: px, y2: plotBottom, stroke: "#BEBEBE", "stroke-width": 1.2, "stroke-dasharray": "5 7" });
    if (!labelTickSet.has(t)) return;
    if (labelMode === "both") {
      makeText(svg, { x: px, y: axisTop, "font-size": 18, "font-weight": 850, "text-anchor": "middle", fill: "#111111" }, `${clean(pair.actual)}mm`);
      makeText(svg, { x: px, y: axisTop + 24, "font-size": 13, "font-weight": 750, "text-anchor": "middle", fill: "#111111" }, `${clean(pair.equiv)}mm`);
    } else if (labelMode === "equiv") {
      makeText(svg, { x: px, y: axisTop + 10, "font-size": 18, "font-weight": 850, "text-anchor": "middle", fill: "#111111" }, `${clean(pair.equiv)}mm`);
    } else {
      makeText(svg, { x: px, y: axisTop + 10, "font-size": 18, "font-weight": 850, "text-anchor": "middle", fill: "#111111" }, `${clean(pair.actual)}mm`);
    }
  });

  makeEl(svg, "rect", { x: plotLeft, y: plotTop, width: plotRight - plotLeft, height: plotBottom - plotTop, fill: "none", stroke: "#4B4B4B", "stroke-width": 2 });
  makeEl(svg, "line", { x1: leftType, y1: plotTop, x2: leftType, y2: plotBottom, stroke: "#4B4B4B", "stroke-width": 2 });

  let y = plotTop;
  rows.forEach(row => {
    if (row.kind === "mountHeader") {
      const m = row.mount;
      const count = state.lenses.filter(l => l.mountId === m.id).length;
      makeEl(svg, "rect", { x: plotLeft, y, width: plotRight - plotLeft, height: groupHeaderH, fill: "#FAFAFA", stroke: "#DADADA", "stroke-width": 1 });
      makeText(svg, { x: leftType + 12, y: y + 20, "font-size": 13, "font-weight": 800, fill: "#111111" }, `${m.name} · crop x${clean(m.crop)} · ${count} lenses`);
      y += groupHeaderH;
      return;
    }

    const { type, items } = row;
    const isZoom = type === "zoom";
    const blockH = isZoom ? Math.max(160, items.length * rowH + 40) : Math.max(230, Math.ceil(items.length / 4) * 132 + 28);
    makeEl(svg, "rect", { x: plotLeft, y, width: plotRight - plotLeft, height: blockH, fill: "#FFFFFF", stroke: "#4B4B4B", "stroke-width": 1.4 });
    makeText(svg, { x: 76, y: y + blockH / 2 + 8, "font-size": 22, "font-weight": 850, "text-anchor": "middle", fill: "#111111" }, categoryLabel(type));

    items.forEach((lens, idx) => {
      const style = styleById(lens.styleId);
      const start = Math.min(displayValue(lens, Number(lens.start)), displayValue(lens, Number(lens.end)));
      const end = Math.max(displayValue(lens, Number(lens.start)), displayValue(lens, Number(lens.end)));
      const startX = clamp(leftChart + x(start), leftChart, leftChart + chartW);
      const endX = clamp(leftChart + x(end), leftChart, leftChart + chartW);
      const label = shortText(chartLensName(lens.name), isZoom ? 46 : 24);
      const color = style.name.toLowerCase().includes("standard") ? "#9A9A9A" : "#1F1F1F";

      if (!isZoom) {
        const lane = idx % 4;
        const row = Math.floor(idx / 4);
        const cy = y + 58 + row * 132 + lane * 32;
        makeEl(svg, "rect", { x: startX - 5, y: cy - 45, width: 10, height: 10, fill: color });
        drawLensIcon(svg, startX, cy - 12, color, style.name.toLowerCase().includes("standard") ? "light" : "dark");
        makeText(svg, { x: startX, y: cy + 13, "font-size": 12.5, "font-weight": 850, "text-anchor": "middle", fill: "#111111" }, label);
        return;
      }

      const cy = y + 42 + idx * rowH;
      drawLensIcon(svg, startX - 26, cy - 7, color, color === "#9A9A9A" ? "light" : "dark");
      makeEl(svg, "line", { x1: startX, y1: cy, x2: endX, y2: cy, stroke: color, "stroke-width": Number(style.width) + 1, "stroke-linecap": "butt", "stroke-dasharray": dashArray(style) });
      makeText(svg, { x: clamp(startX + 10, leftChart + 8, width - right - 260), y: cy + 18, "font-size": 14, "font-weight": style.weight, fill: "#111111" }, label);

      if ($("showTeleconverters").checked) {
        if (lens.tc14) drawTc(svg, leftChart, chartW, x, endX, cy, end * 1.4, max, "#C9C9C9", "", "");
        if (lens.tc20) drawTc(svg, leftChart, chartW, x, endX, cy, end * 2, max, "#C9C9C9", "", "");
      }
    });

    y += blockH;
  });

  makeText(svg, { x: plotLeft + 4, y: height - 34, "font-size": 13, "font-weight": 800, fill: "#111111" }, "As of current data");

  let lx = width - 360;
  const legendY = height - 30;
  state.styles.forEach(style => {
    const color = style.name.toLowerCase().includes("standard") ? "#9A9A9A" : "#1F1F1F";
    makeEl(svg, "rect", { x: lx, y: legendY - 10, width: 11, height: 11, fill: color });
    makeText(svg, { x: lx + 18, y: legendY, "font-size": 15, "font-weight": 850, fill: "#111111", "font-style": "italic" }, style.name);
    lx += Math.max(100, style.name.length * 9 + 44);
  });
}

function drawTc(svg, leftChart, chartW, x, startX, y, tcEnd, max, color, dash, label) {
  if (tcEnd > max) return;
  const tcX = clamp(leftChart + x(tcEnd), leftChart, leftChart + chartW);
  makeEl(svg, "line", { x1: startX, y1: y, x2: tcX, y2: y, stroke: color, "stroke-width": 5, "stroke-linecap": "butt", "stroke-dasharray": dash });
  if (label) makeText(svg, { x: tcX + 8, y: y + 4, "font-size": 10, "font-weight": 800, fill: "#64748B" }, label);
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
      row.querySelector(".mount-color").appendChild(swatch);
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
      row.querySelector(".style-preview-cell").appendChild(stylePreview(style));
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
  const cleanCrop = Number(crop);
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
  const parsed = parseFocalRange($("lensName").value);
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

  const values = [];
  state.lenses.forEach(lens => {
    const start = displayValue(lens, Number(lens.start));
    const end = displayValue(lens, Number(lens.end));
    values.push(start, end);
    if ($("showTeleconverters").checked && lens.tc14) values.push(end * 1.4);
    if ($("showTeleconverters").checked && lens.tc20) values.push(end * 2);
  });

  const minValue = Math.max(1, Math.min(...values));
  const maxValue = Math.max(...values);
  const presets = [7, 8, 10, 12, 14, 16, 20, 24, 28, 35, 40, 50, 70, 85, 100, 135, 150, 200, 300, 400, 560, 600, 800, 1000, 1200, 1600, 2000, 2400, 3200];
  const lower = [...presets].reverse().find(v => v <= minValue * .88) || Math.max(1, Math.floor(minValue * .8));
  const upper = presets.find(v => v >= maxValue * 1.08) || Math.ceil(maxValue * 1.15);

  $("axisMin").value = lower;
  $("axisMax").value = upper;
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
  const mime = format === "webp" ? "image/webp" : "image/png";
  const extension = format === "webp" ? "webp" : "png";
  const url = chartSvgBlobUrl();
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
    ctx.fillStyle = "#fff";
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
      downloadBlob(blob, `lens-roadmap.${extension}`, mime);
    }, mime, format === "webp" ? 0.92 : undefined);
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
    settings: {
      chartTitle: $("chartTitle").value,
      displayMode: $("displayMode").value,
      labelMode: $("labelMode").value,
      scaleMode: $("scaleMode").value,
      axisMin: Number($("axisMin").value),
      axisMax: Number($("axisMax").value),
      showTeleconverters: $("showTeleconverters").checked
    },
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
        $("chartTitle").value = data.settings.chartTitle || $("chartTitle").value;
        $("displayMode").value = data.settings.displayMode || "equiv";
        $("labelMode").value = data.settings.labelMode || "equiv";
        $("scaleMode").value = data.settings.scaleMode || "log";
        $("axisMin").value = data.settings.axisMin || 14;
        $("axisMax").value = data.settings.axisMax || 1600;
        $("showTeleconverters").checked = data.settings.showTeleconverters ?? true;
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

function switchTab(tab) {
  const panelByTab = {
    Mounts: "mountPanel",
    Styles: "stylePanel",
    Lenses: "lensPanel"
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
  $("saveWebpBtn").addEventListener("click", exportWebp);
  $("exportJsonBtn").addEventListener("click", exportJson);
  $("importJsonInput").addEventListener("change", e => e.target.files[0] && importJson(e.target.files[0]));

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

  ["displayMode", "labelMode", "scaleMode", "chartTitle", "axisMin", "axisMax", "showTeleconverters"].forEach(id => {
    $(id).addEventListener("input", () => {
      renderChart();
      updateLensPreview();
    });
    $(id).addEventListener("change", () => {
      renderChart();
      updateLensPreview();
    });
  });

  $("tabMounts").addEventListener("click", () => switchTab("Mounts"));
  $("tabStyles").addEventListener("click", () => switchTab("Styles"));
  $("tabLenses").addEventListener("click", () => switchTab("Lenses"));
}

bind();
renderAll();
