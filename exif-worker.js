importScripts("vendor/dexie.min.js", "vendor/exifr.full.umd.js");

const DB_NAME = "lensRoadmapExifCacheV1";
const BATCH_SIZE = 96;
const UNKNOWN_LENS = "Unknown lens";
const EXIF_PICK = [
  "LensModel",
  "Lens",
  "LensID",
  "LensType",
  "FocalLength",
  "FocalLengthIn35mmFormat",
  "FocalLengthIn35mmFilm",
  "FocalLength35efl"
];

let cancelled = false;

const db = new Dexie(DB_NAME);
db.version(1).stores({
  photos: "&cacheKey,path,size,lastModified,lensName,focalLength,focalLength35mm,parsedAt"
});

function roundFocal(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return Math.round(number * 10) / 10;
}

function formatFocal(value) {
  const rounded = roundFocal(value);
  if (!rounded) return "";
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function numericValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const number = numericValue(item);
      if (number) return number;
    }
    return null;
  }
  if (value && typeof value === "object") {
    if (Number.isFinite(value.numerator) && Number.isFinite(value.denominator) && value.denominator !== 0) {
      return value.numerator / value.denominator;
    }
    if ("value" in value) return numericValue(value.value);
    if ("description" in value) return numericValue(value.description);
  }
  const match = String(value || "").replace(",", ".").match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function textValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return `Lens ID ${value}`;
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join(" / ");
  if (typeof value === "object") {
    if (value.description) return textValue(value.description);
    if (value.value) return textValue(value.value);
    if (value.name) return textValue(value.name);
  }
  return "";
}

function lensNameFrom(tags = {}) {
  const candidates = [tags.LensModel, tags.Lens, tags.LensID, tags.LensType];
  for (const candidate of candidates) {
    const text = textValue(candidate).replace(/\s+/g, " ").trim();
    if (text && text !== "0") return text;
  }
  return UNKNOWN_LENS;
}

function focal35From(tags = {}) {
  return numericValue(tags.FocalLengthIn35mmFormat)
    || numericValue(tags.FocalLengthIn35mmFilm)
    || numericValue(tags.FocalLength35efl);
}

function entryFile(entry) {
  return entry?.file || entry;
}

function filePath(entry) {
  const file = entryFile(entry);
  return entry?.path || file.webkitRelativePath || file.relativePath || file.name;
}

function cacheKeyFor(entry) {
  const file = entryFile(entry);
  const size = entry?.size ?? file.size;
  const lastModified = entry?.lastModified ?? file.lastModified;
  return `${filePath(entry)}|${size}|${lastModified}`;
}

async function parsePhoto(entry) {
  const file = entryFile(entry);
  const path = filePath(entry);
  const base = {
    cacheKey: cacheKeyFor(entry),
    path,
    name: entry?.name || file.name,
    size: entry?.size ?? file.size,
    lastModified: entry?.lastModified ?? file.lastModified,
    lensName: UNKNOWN_LENS,
    focalLength: null,
    focalLength35mm: null,
    parsedAt: Date.now(),
    error: ""
  };

  try {
    const tags = await exifr.parse(file, {
      exif: true,
      ifd0: true,
      interop: true,
      makerNote: true,
      tiff: true,
      xmp: true,
      gps: false,
      icc: false,
      iptc: false,
      jfif: false,
      mergeOutput: true,
      reviveValues: false,
      sanitize: true,
      translateKeys: true,
      translateValues: false,
      pick: EXIF_PICK
    });

    return {
      ...base,
      lensName: lensNameFrom(tags),
      focalLength: roundFocal(numericValue(tags?.FocalLength)),
      focalLength35mm: roundFocal(focal35From(tags))
    };
  } catch (error) {
    return {
      ...base,
      error: error?.message || "EXIF parse failed"
    };
  }
}

function addToGroup(groups, record) {
  if (!record || record.error) return;
  const lensName = record.lensName || UNKNOWN_LENS;
  if (!groups.has(lensName)) {
    groups.set(lensName, {
      lensName,
      total: 0,
      withFocal: 0,
      withFocal35mm: 0,
      focalCounts: new Map(),
      equivCounts: new Map(),
      focalMin: null,
      focalMax: null,
      equivMin: null,
      equivMax: null
    });
  }

  const group = groups.get(lensName);
  group.total += 1;

  if (record.focalLength) {
    const key = formatFocal(record.focalLength);
    group.withFocal += 1;
    group.focalCounts.set(key, (group.focalCounts.get(key) || 0) + 1);
    group.focalMin = group.focalMin === null ? record.focalLength : Math.min(group.focalMin, record.focalLength);
    group.focalMax = group.focalMax === null ? record.focalLength : Math.max(group.focalMax, record.focalLength);
  }

  if (record.focalLength35mm) {
    const key = formatFocal(record.focalLength35mm);
    group.withFocal35mm += 1;
    group.equivCounts.set(key, (group.equivCounts.get(key) || 0) + 1);
    group.equivMin = group.equivMin === null ? record.focalLength35mm : Math.min(group.equivMin, record.focalLength35mm);
    group.equivMax = group.equivMax === null ? record.focalLength35mm : Math.max(group.equivMax, record.focalLength35mm);
  }
}

function topFocals(map, limit = 5) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))
    .slice(0, limit)
    .map(([focal, count]) => ({ focal, count }));
}

function serializeGroups(groups) {
  let maxCellCount = 0;
  const focalColumns = new Set();

  const lenses = [...groups.values()]
    .map(group => {
      const focalCounts = Object.fromEntries([...group.focalCounts.entries()].sort((a, b) => Number(a[0]) - Number(b[0])));
      const equivCounts = Object.fromEntries([...group.equivCounts.entries()].sort((a, b) => Number(a[0]) - Number(b[0])));
      Object.entries(focalCounts).forEach(([focal, count]) => {
        focalColumns.add(focal);
        maxCellCount = Math.max(maxCellCount, count);
      });

      return {
        lensName: group.lensName,
        total: group.total,
        withFocal: group.withFocal,
        withFocal35mm: group.withFocal35mm,
        focalMin: group.focalMin,
        focalMax: group.focalMax,
        equivMin: group.equivMin,
        equivMax: group.equivMax,
        focalCounts,
        equivCounts,
        topFocals: topFocals(group.focalCounts)
      };
    })
    .sort((a, b) => b.total - a.total || a.lensName.localeCompare(b.lensName));

  return {
    lenses,
    focalColumns: [...focalColumns].sort((a, b) => Number(a) - Number(b)),
    maxCellCount
  };
}

function postProgress(summary) {
  self.postMessage({
    type: "progress",
    summary: { ...summary }
  });
}

async function processFiles(files) {
  cancelled = false;
  const groups = new Map();
  const summary = {
    total: files.length,
    processed: 0,
    cacheHits: 0,
    parsed: 0,
    errors: 0,
    withLens: 0,
    withFocal: 0,
    startedAt: Date.now()
  };

  for (let offset = 0; offset < files.length; offset += BATCH_SIZE) {
    if (cancelled) {
      self.postMessage({ type: "cancelled", summary });
      return;
    }

    const batch = files.slice(offset, offset + BATCH_SIZE);
    const keys = batch.map(cacheKeyFor);
    const cached = await db.photos.bulkGet(keys);
    const toCache = [];

    for (let index = 0; index < batch.length; index += 1) {
      if (cancelled) {
        self.postMessage({ type: "cancelled", summary });
        return;
      }

      let record = cached[index];
      if (record) {
        summary.cacheHits += 1;
      } else {
        record = await parsePhoto(batch[index]);
        toCache.push(record);
        summary.parsed += 1;
      }

      if (record.error) summary.errors += 1;
      if (record.lensName && record.lensName !== UNKNOWN_LENS && !record.error) summary.withLens += 1;
      if (record.focalLength && !record.error) summary.withFocal += 1;
      addToGroup(groups, record);
      summary.processed += 1;
    }

    if (toCache.length) await db.photos.bulkPut(toCache);
    postProgress(summary);
  }

  const result = serializeGroups(groups);
  self.postMessage({
    type: "done",
    summary: {
      ...summary,
      finishedAt: Date.now()
    },
    result
  });
}

self.onmessage = async event => {
  const { type, files } = event.data || {};

  if (type === "cancel") {
    cancelled = true;
    return;
  }

  if (type === "clear-cache") {
    await db.photos.clear();
    self.postMessage({ type: "cache-cleared" });
    return;
  }

  if (type === "start") {
    if (!self.Dexie || !self.exifr) {
      self.postMessage({ type: "error", message: "EXIF parser or cache library did not load." });
      return;
    }
    processFiles(files || []).catch(error => {
      self.postMessage({ type: "error", message: error?.message || "Photo analysis failed." });
    });
  }
};
