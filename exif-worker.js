importScripts("vendor/dexie.min.js", "vendor/exifr.full.umd.js");

const DB_NAME = "lensRoadmapExifCacheV4";
const BATCH_SIZE = 96;
const UNKNOWN_LENS = "Unknown lens";
const EXIF_PICK = [
  "LensModel",
  "Lens",
  "LensID",
  "LensType",
  "LensInfo",
  "LensSpec",
  "LensSpecification",
  "LensFocalLength",
  "MinFocalLength",
  "MaxFocalLength",
  "FocalLength",
  "FocalLengthIn35mmFormat",
  "FocalLengthIn35mmFilm",
  "FocalLength35efl",
  "FocalLength35mm",
  "FocalLenIn35mmFilm",
  "DigitalZoomRatio"
];

let cancelled = false;

const db = new Dexie(DB_NAME);
db.version(1).stores({
  photos: "&cacheKey,path,size,lastModified,lensName,focalLength,focalLength35mm,lensMin,lensMax,teleconverterFactor,teleconverterApplied,parsedAt"
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
    if (value.length === 2 && value.every(item => typeof item === "number" && Number.isFinite(item)) && value[1] !== 0) {
      const ratio = value[0] / value[1];
      if (Number.isFinite(ratio) && ratio > 0 && ratio < 10000) return ratio;
    }
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

function numericValues(value) {
  if (typeof value === "number" && Number.isFinite(value)) return [value];
  if (Array.isArray(value)) return value.flatMap(numericValues);
  if (value && typeof value === "object") {
    if (Number.isFinite(value.numerator) && Number.isFinite(value.denominator) && value.denominator !== 0) {
      return [value.numerator / value.denominator];
    }
    if ("value" in value) return numericValues(value.value);
    if ("description" in value) return numericValues(value.description);
  }
  return [...String(value || "").replace(/,/g, ".").matchAll(/\d+(?:\.\d+)?/g)].map(match => Number(match[0]));
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
    || numericValue(tags.FocalLength35efl)
    || numericValue(tags.FocalLength35mm)
    || numericValue(tags.FocalLenIn35mmFilm);
}

function focalRangeFromText(text) {
  const normalized = String(text || "")
    .replace(/\u2013|\u2014|~|〜|～/g, "-")
    .replace(/ｍｍ/gi, "mm")
    .replace(/\s+/g, " ")
    .trim();
  const patterns = [
    /(\d+(?:\.\d+)?)\s*mm\s*-\s*(\d+(?:\.\d+)?)\s*mm/i,
    /(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*mm/i,
    /(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)(?=\s*\/)/i,
    /(?:^|[^\d.f])(\d{1,4}(?:\.\d+)?)\s*-\s*(\d{1,4}(?:\.\d+)?)(?=\s+(?:f|t|g|s|o|i|d|v|r|l|is|oss|ois|vr|pro|art|stm|usm|gm|dn|dc|dg)\b)/i
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) continue;
    const start = Number(match[1]);
    const end = Number(match[2]);
    if (start >= 1 && end > start && end <= 3000) return { start, end };
  }

  const prime = normalized.match(/(\d+(?:\.\d+)?)\s*mm/i) || normalized.match(/\/\s*(\d{1,4}(?:\.\d+)?)(?=\s*(?:$|[a-z]|[-)]))/i);
  if (prime) {
    const focal = Number(prime[1]);
    if (focal >= 4 && focal <= 3000) return { start: focal, end: focal };
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
    start: roundFocal(range.start * factor),
    end: roundFocal(range.end * factor)
  };
}

function focalAlreadyTeleconverted(focal, range, adjustedRange) {
  if (!focal || !range || !adjustedRange) return false;
  return focal > range.end + 0.8 && focal >= adjustedRange.start - 0.8 && focal <= adjustedRange.end + 0.8;
}

function focalRangeFromTags(tags = {}, lensName = "") {
  const directMin = roundFocal(numericValue(tags.MinFocalLength));
  const directMax = roundFocal(numericValue(tags.MaxFocalLength));
  if (directMin && directMax) return { start: Math.min(directMin, directMax), end: Math.max(directMin, directMax) };

  const textRange = focalRangeFromText(lensName)
    || focalRangeFromText(textValue(tags.LensInfo))
    || focalRangeFromText(textValue(tags.LensSpecification))
    || focalRangeFromText(textValue(tags.LensSpec))
    || focalRangeFromText(textValue(tags.LensType));
  if (textRange) return textRange;

  const candidates = [tags.LensInfo, tags.LensSpecification, tags.LensSpec, tags.LensFocalLength]
    .flatMap(numericValues)
    .map(roundFocal)
    .filter(value => value && value >= 4 && value <= 3000);
  if (candidates.length >= 2) {
    const start = Math.min(candidates[0], candidates[1]);
    const end = Math.max(candidates[0], candidates[1]);
    if (end > start) return { start, end };
  }
  return null;
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
    kind: entry?.kind || "photo",
    size: entry?.size ?? file.size,
    lastModified: entry?.lastModified ?? file.lastModified,
    lensName: UNKNOWN_LENS,
    focalLength: null,
    focalLength35mm: null,
    lensMin: null,
    lensMax: null,
    teleconverterFactor: 1,
    teleconverterApplied: false,
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

    const lensName = lensNameFrom(tags);
    const lensRange = focalRangeFromTags(tags, lensName);
    const teleconverterFactor = teleconverterFactorFromText(lensName);
    const adjustedRange = applyTeleconverterRange(lensRange, teleconverterFactor);
    const directFocal = roundFocal(numericValue(tags?.FocalLength));
    const fallbackPrimeFocal = lensRange && Math.abs(lensRange.start - lensRange.end) < 0.05 ? roundFocal(lensRange.start) : null;
    let focalLength = directFocal || fallbackPrimeFocal;
    let focalLength35mm = roundFocal(focal35From(tags));

    if (teleconverterFactor > 1 && focalLength && !focalAlreadyTeleconverted(focalLength, lensRange, adjustedRange)) {
      const baseLike = !lensRange || (focalLength >= lensRange.start - 0.8 && focalLength <= lensRange.end + 0.8);
      if (baseLike) {
        focalLength = roundFocal(focalLength * teleconverterFactor);
        if (focalLength35mm) focalLength35mm = roundFocal(focalLength35mm * teleconverterFactor);
      }
    }

    return {
      ...base,
      lensName,
      focalLength,
      focalLength35mm,
      lensMin: adjustedRange ? roundFocal(adjustedRange.start) : null,
      lensMax: adjustedRange ? roundFocal(adjustedRange.end) : null,
      teleconverterFactor,
      teleconverterApplied: teleconverterFactor > 1
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
      lensMin: null,
      lensMax: null,
      equivMin: null,
      equivMax: null,
      cropSum: 0,
      cropCount: 0,
      teleconverterFactor: 1,
      teleconverterApplied: false
    });
  }

  const group = groups.get(lensName);
  group.total += 1;
  group.teleconverterFactor = Math.max(group.teleconverterFactor || 1, record.teleconverterFactor || 1);
  group.teleconverterApplied = group.teleconverterApplied || !!record.teleconverterApplied;

  if (record.focalLength) {
    const key = formatFocal(record.focalLength);
    group.withFocal += 1;
    group.focalCounts.set(key, (group.focalCounts.get(key) || 0) + 1);
    group.focalMin = group.focalMin === null ? record.focalLength : Math.min(group.focalMin, record.focalLength);
    group.focalMax = group.focalMax === null ? record.focalLength : Math.max(group.focalMax, record.focalLength);
  }

  if (record.lensMin && record.lensMax) {
    group.lensMin = group.lensMin === null ? record.lensMin : Math.min(group.lensMin, record.lensMin);
    group.lensMax = group.lensMax === null ? record.lensMax : Math.max(group.lensMax, record.lensMax);
  }

  if (record.focalLength35mm) {
    const key = formatFocal(record.focalLength35mm);
    group.withFocal35mm += 1;
    group.equivCounts.set(key, (group.equivCounts.get(key) || 0) + 1);
    group.equivMin = group.equivMin === null ? record.focalLength35mm : Math.min(group.equivMin, record.focalLength35mm);
    group.equivMax = group.equivMax === null ? record.focalLength35mm : Math.max(group.equivMax, record.focalLength35mm);
    if (record.focalLength) {
      const crop = record.focalLength35mm / record.focalLength;
      if (Number.isFinite(crop) && crop >= 0.5 && crop <= 10) {
        group.cropSum += crop;
        group.cropCount += 1;
      }
    }
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
        lensMin: group.lensMin,
        lensMax: group.lensMax,
        teleconverterFactor: group.teleconverterFactor,
        teleconverterApplied: group.teleconverterApplied,
        equivMin: group.equivMin,
        equivMax: group.equivMax,
        cropEstimate: group.cropCount ? Math.round((group.cropSum / group.cropCount) * 10) / 10 : null,
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
