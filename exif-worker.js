importScripts("vendor/dexie.min.js", "vendor/exifr.full.umd.js");

const DB_NAME = "lensRoadmapExifCacheV7";
const BATCH_SIZE = 96;
const UNKNOWN_LENS = "Unknown lens";
const UNKNOWN_BODY = "Unknown body";
const EXIF_PICK = [
  "Make",
  "Model",
  "Camera",
  "BodySerialNumber",
  "SerialNumber",
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
const OLYMPUS_LENS_TYPES = {
  "0 35 10": "Olympus M.Zuiko 100-400mm F5.0-6.3"
};
const OLYMPUS_EXTENDERS = {
  "0 00": { name: "", factor: 1 },
  "0 04": { name: "EC-14 1.4x Teleconverter", factor: 1.4 },
  "0 08": { name: "EX-25 Extension Tube", factor: 1 },
  "0 10": { name: "EC-20 2.0x Teleconverter", factor: 2 }
};

let cancelled = false;

const db = new Dexie(DB_NAME);
db.version(1).stores({
  photos: "&cacheKey,path,size,lastModified,lensName,bodyName,focalLength,focalLength35mm,lensMin,lensMax,teleconverterFactor,teleconverterApplied,parsedAt"
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

function cleanExifText(text) {
  return String(text || "")
    .replace(/\0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lensNameFrom(tags = {}) {
  const candidates = [tags.LensModel, tags.Lens, tags.LensID, tags.LensType];
  for (const candidate of candidates) {
    const text = textValue(candidate).replace(/\s+/g, " ").trim();
    if (text && text !== "0") return text;
  }
  return UNKNOWN_LENS;
}

function bodyNameFrom(tags = {}) {
  const make = cleanExifText(textValue(tags.Make));
  const model = cleanExifText(textValue(tags.Model) || textValue(tags.Camera));
  if (!make && !model) return UNKNOWN_BODY;
  if (!make) return model;
  if (!model) return make;
  const makeKey = make.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const modelKey = model.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (modelKey.startsWith(makeKey)) return model;
  return `${make} ${model}`.replace(/\s+/g, " ").trim();
}

function fileExtensionFromName(name) {
  const match = String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : "";
}

async function readFileChunk(file, start, length) {
  const end = Math.min(file.size || length, start + length);
  const blob = file.slice ? file.slice(start, end) : file;
  if (blob.arrayBuffer) return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

function safeU16(view, offset, little) {
  if (offset < 0 || offset + 2 > view.byteLength) return null;
  return view.getUint16(offset, little);
}

function safeU32(view, offset, little) {
  if (offset < 0 || offset + 4 > view.byteLength) return null;
  return view.getUint32(offset, little);
}

function asciiFromView(view, offset, length) {
  if (offset < 0 || offset >= view.byteLength || length <= 0) return "";
  const end = Math.min(view.byteLength, offset + length);
  let text = "";
  for (let i = offset; i < end; i += 1) text += String.fromCharCode(view.getUint8(i));
  return cleanExifText(text);
}

function tiffTypeSize(type) {
  return {
    1: 1,
    2: 1,
    3: 2,
    4: 4,
    5: 8,
    7: 1,
    8: 2,
    9: 4,
    10: 8,
    11: 4,
    12: 8,
    13: 4
  }[type] || 1;
}

function parseTiffIfd(view, offset, little, valueBase = 0) {
  const count = safeU16(view, offset, little);
  if (!count || count < 1 || count > 512) return null;
  const entriesEnd = offset + 2 + count * 12;
  if (entriesEnd > view.byteLength) return null;

  const entries = new Map();
  for (let index = 0; index < count; index += 1) {
    const entryOffset = offset + 2 + index * 12;
    const tag = safeU16(view, entryOffset, little);
    const type = safeU16(view, entryOffset + 2, little);
    const itemCount = safeU32(view, entryOffset + 4, little);
    const value = safeU32(view, entryOffset + 8, little);
    if (tag === null || type === null || itemCount === null || value === null) continue;
    const byteLength = tiffTypeSize(type) * itemCount;
    const valueOffset = byteLength <= 4 ? entryOffset + 8 : valueBase + value;
    entries.set(tag, { tag, type, count: itemCount, value, valueOffset, byteLength, entryOffset });
  }
  return entries;
}

function readTiffBytes(view, entry) {
  if (!entry || entry.valueOffset < 0 || entry.valueOffset >= view.byteLength) return [];
  const length = Math.min(entry.byteLength, view.byteLength - entry.valueOffset);
  return Array.from({ length }, (_, index) => view.getUint8(entry.valueOffset + index));
}

function readTiffAscii(view, entry) {
  if (!entry) return "";
  return asciiFromView(view, entry.valueOffset, entry.count || entry.byteLength || 0);
}

function readTiffShort(view, entry, little) {
  if (!entry) return null;
  if (entry.type === 3 || entry.type === 8) return safeU16(view, entry.valueOffset, little);
  if (entry.type === 4 || entry.type === 13) return safeU32(view, entry.valueOffset, little);
  if (entry.type === 1 || entry.type === 7) return view.getUint8(entry.valueOffset);
  return null;
}

function hexByte(value) {
  return Number(value || 0).toString(16).toUpperCase().padStart(2, "0").replace(/^0(?=[1-9A-F])/, "");
}

function olympusLensTypeKey(bytes) {
  if (!bytes || bytes.length < 4) return "";
  return `${bytes[0]} ${hexByte(bytes[2])} ${hexByte(bytes[3])}`;
}

function olympusExtenderKey(bytes) {
  if (!bytes || bytes.length < 3) return "";
  return `${bytes[0]} ${hexByte(bytes[2])}`;
}

function extenderFromText(text) {
  const value = cleanExifText(text);
  if (!value) return { name: "", factor: 1 };
  const lower = value.toLowerCase();
  if (/\b(mc|ec|tc)[\s_-]?14\b|1\.4x/.test(lower)) return { name: value, factor: 1.4 };
  if (/\b(mc|ec|tc)[\s_-]?20\b|2\.0x|2x/.test(lower)) return { name: value, factor: 2 };
  if (/1\.25x/.test(lower)) return { name: value, factor: 1.25 };
  return { name: value, factor: 1 };
}

function findOlympusMakerRoot(view, makerOffset, little) {
  const signature = asciiFromView(view, makerOffset, 16).toUpperCase();
  const candidates = signature.startsWith("OM SYSTEM")
    ? [makerOffset + 16, makerOffset + 12, makerOffset + 10]
    : signature.startsWith("OLYMPUS")
      ? [makerOffset + 12, makerOffset + 16, makerOffset + 10]
      : [makerOffset + 16, makerOffset + 12, makerOffset + 10, makerOffset + 8];

  for (const offset of candidates) {
    const entries = parseTiffIfd(view, offset, little, makerOffset);
    if (entries?.has(0x2010)) return entries;
  }
  return null;
}

async function parseOlympusRawMetadata(file) {
  if (fileExtensionFromName(file?.name) !== "orf") return null;

  const buffer = await readFileChunk(file, 0, Math.min(file.size || 0, 1024 * 1024));
  const view = new DataView(buffer);
  if (view.byteLength < 64) return null;

  const byteOrder = asciiFromView(view, 0, 2);
  const little = byteOrder === "II";
  if (!little && byteOrder !== "MM") return null;

  const ifd0Offset = safeU32(view, 4, little);
  const ifd0 = parseTiffIfd(view, ifd0Offset, little, 0);
  const exifOffset = ifd0?.get(0x8769)?.value;
  const exifIfd = exifOffset ? parseTiffIfd(view, exifOffset, little, 0) : null;
  const makerOffset = exifIfd?.get(0x927c)?.value;
  if (!makerOffset || makerOffset >= view.byteLength) return null;

  const root = findOlympusMakerRoot(view, makerOffset, little);
  const equipmentPointer = root?.get(0x2010)?.value;
  const equipment = equipmentPointer ? parseTiffIfd(view, makerOffset + equipmentPointer, little, makerOffset) : null;
  if (!equipment) return null;

  const lensModel = readTiffAscii(view, equipment.get(0x0203));
  const lensTypeName = OLYMPUS_LENS_TYPES[olympusLensTypeKey(readTiffBytes(view, equipment.get(0x0201)))] || "";
  const rawLensName = lensModel || lensTypeName;
  if (!rawLensName) return null;

  const extenderModel = readTiffAscii(view, equipment.get(0x0303));
  const extenderByText = extenderFromText(extenderModel);
  const extenderByCode = OLYMPUS_EXTENDERS[olympusExtenderKey(readTiffBytes(view, equipment.get(0x0301)))] || { name: "", factor: 1 };
  const extender = extenderByText.factor > 1 || extenderByText.name ? extenderByText : extenderByCode;
  const lensName = extender.name && extender.factor > 1 ? `${rawLensName} + ${extender.name}` : rawLensName;
  const lensMin = roundFocal(readTiffShort(view, equipment.get(0x0207), little));
  const lensMax = roundFocal(readTiffShort(view, equipment.get(0x0208), little));

  return {
    lensName,
    lensMin,
    lensMax,
    teleconverterFactor: extender.factor || 1,
    teleconverterApplied: (extender.factor || 1) > 1
  };
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
  const nameRange = focalRangeFromText(lensName);
  if (nameRange) return nameRange;

  const directMin = roundFocal(numericValue(tags.MinFocalLength));
  const directMax = roundFocal(numericValue(tags.MaxFocalLength));
  if (directMin && directMax) return { start: Math.min(directMin, directMax), end: Math.max(directMin, directMax) };

  const textRange = focalRangeFromText(textValue(tags.LensInfo))
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
    bodyName: UNKNOWN_BODY,
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

    const olympusRaw = await parseOlympusRawMetadata(file).catch(() => null);
    const exifLensName = lensNameFrom(tags);
    const lensName = olympusRaw?.lensName && (!exifLensName || exifLensName === UNKNOWN_LENS || /^Lens ID/i.test(exifLensName))
      ? olympusRaw.lensName
      : exifLensName;
    const bodyName = bodyNameFrom(tags);
    const olympusRange = olympusRaw?.lensMin && olympusRaw?.lensMax
      ? { start: olympusRaw.lensMin, end: olympusRaw.lensMax }
      : null;
    const lensRange = olympusRange || focalRangeFromTags(tags, lensName);
    const teleconverterFactor = Math.max(teleconverterFactorFromText(lensName), Number(olympusRaw?.teleconverterFactor) || 1);
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
      bodyName,
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
      bodyCounts: new Map(),
      bodyFocalCounts: new Map(),
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
  const bodyName = record.bodyName || UNKNOWN_BODY;
  group.bodyCounts.set(bodyName, (group.bodyCounts.get(bodyName) || 0) + 1);
  group.teleconverterFactor = Math.max(group.teleconverterFactor || 1, record.teleconverterFactor || 1);
  group.teleconverterApplied = group.teleconverterApplied || !!record.teleconverterApplied;

  if (record.focalLength) {
    const key = formatFocal(record.focalLength);
    group.withFocal += 1;
    group.focalCounts.set(key, (group.focalCounts.get(key) || 0) + 1);
    if (!group.bodyFocalCounts.has(bodyName)) group.bodyFocalCounts.set(bodyName, new Map());
    const bodyMap = group.bodyFocalCounts.get(bodyName);
    bodyMap.set(key, (bodyMap.get(key) || 0) + 1);
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
  const bodies = new Set();

  const lenses = [...groups.values()]
    .map(group => {
      const focalCounts = Object.fromEntries([...group.focalCounts.entries()].sort((a, b) => Number(a[0]) - Number(b[0])));
      const equivCounts = Object.fromEntries([...group.equivCounts.entries()].sort((a, b) => Number(a[0]) - Number(b[0])));
      const bodyCounts = Object.fromEntries([...group.bodyCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
      const bodyFocalCounts = Object.fromEntries([...group.bodyFocalCounts.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([bodyName, focalMap]) => {
          bodies.add(bodyName);
          return [bodyName, Object.fromEntries([...focalMap.entries()].sort((a, b) => Number(a[0]) - Number(b[0])))];
        }));
      Object.keys(bodyCounts).forEach(bodyName => bodies.add(bodyName));
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
        bodyCounts,
        bodyFocalCounts,
        focalCounts,
        equivCounts,
        topFocals: topFocals(group.focalCounts)
      };
    })
    .sort((a, b) => b.total - a.total || a.lensName.localeCompare(b.lensName));

  return {
    lenses,
    focalColumns: [...focalColumns].sort((a, b) => Number(a) - Number(b)),
    maxCellCount,
    bodies: [...bodies].filter(Boolean).sort((a, b) => a.localeCompare(b))
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
