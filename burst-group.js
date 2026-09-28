(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.BurstGroup = api;
    if (typeof globalThis !== "undefined") globalThis.BurstGroup = api;
    if (typeof self !== "undefined") self.BurstGroup = api;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function normalizeName(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function median(values) {
    var list = (values || []).filter(function (v) {
      return typeof v === "number" && isFinite(v) && v > 0;
    }).sort(function (a, b) { return a - b; });
    if (!list.length) return null;
    var mid = Math.floor(list.length / 2);
    if (list.length % 2 === 1) return Math.round(list[mid] * 10) / 10;
    return Math.round(((list[mid - 1] + list[mid]) / 2) * 10) / 10;
  }

  function focalClose(a, b, tolerance) {
    if (a == null || b == null) return true;
    var tol = Math.max(0.1, Number(tolerance) || 1);
    return Math.abs(Number(a) - Number(b)) <= tol + 1e-9;
  }

  function hasTimestamp(record) {
    var ts = Number(record && record.timestampMs);
    return isFinite(ts) && ts > 0;
  }

  function representativeFocal(members, key) {
    var values = members.map(function (m) { return Number(m[key]); })
      .filter(function (v) { return isFinite(v) && v > 0; });
    if (!values.length) return null;
    return median(values);
  }

  // Group consecutive burst shots. Records stay untouched; collapsed copies
  // carry _burstSize so aggregation can count 1 per burst.
  function groupBursts(records, options) {
    var opts = options || {};
    var enabled = opts.enabled !== false;
    var windowMs = Math.max(100, (Number(opts.windowSec) || 1) * 1000);
    var focalTolerance = Math.max(0.1, Number(opts.focalTolerance) || 1);
    var list = Array.isArray(records) ? records.slice() : [];

    if (!enabled || list.length <= 1) {
      var plain = list.map(function (r) {
        var copy = Object.assign({}, r);
        copy._burstSize = 1;
        copy._burstSpanMs = 0;
        return copy;
      });
      return {
        collapsed: plain,
        groups: plain.map(function (r) { return [r]; }),
        stats: { raw: list.length, collapsed: plain.length, burstGroups: 0, burstShots: 0, saved: 0 }
      };
    }

    var timed = [];
    var untimed = [];
    list.forEach(function (record) {
      if (hasTimestamp(record)) timed.push(record);
      else untimed.push(record);
    });
    timed.sort(function (a, b) {
      var diff = Number(a.timestampMs) - Number(b.timestampMs);
      if (diff) return diff;
      return String(a.path || a.name || "").localeCompare(String(b.path || b.name || ""));
    });

    var groups = [];
    var current = [];
    var currentLens = "";
    var currentBody = "";
    var currentFocal = null;
    var currentLastTs = 0;

    function flush() {
      if (current.length) groups.push(current);
      current = [];
      currentLens = "";
      currentBody = "";
      currentFocal = null;
      currentLastTs = 0;
    }

    timed.forEach(function (record) {
      var lens = normalizeName(record.lensName);
      var body = normalizeName(record.bodyName);
      var ts = Number(record.timestampMs);
      var focal = Number(record.focalLength);
      if (!isFinite(focal) || focal <= 0) focal = null;

      if (!current.length) {
        current = [record];
        currentLens = lens;
        currentBody = body;
        currentFocal = focal;
        currentLastTs = ts;
        return;
      }

      var sameLens = lens === currentLens;
      var sameBody = body === currentBody;
      var withinWindow = ts - currentLastTs >= 0 && ts - currentLastTs <= windowMs;
      var focalOk = focalClose(focal, currentFocal, focalTolerance);

      if (sameLens && sameBody && withinWindow && focalOk) {
        current.push(record);
        currentLastTs = ts;
        if (currentFocal == null && focal != null) currentFocal = focal;
      } else {
        flush();
        current = [record];
        currentLens = lens;
        currentBody = body;
        currentFocal = focal;
        currentLastTs = ts;
      }
    });
    flush();

    untimed.forEach(function (record) {
      groups.push([record]);
    });

    var collapsed = groups.map(function (members) {
      var first = members[0] || {};
      var copy = Object.assign({}, first);
      if (members.length === 1) {
        copy._burstSize = 1;
        copy._burstSpanMs = 0;
        return copy;
      }
      var focalMed = representativeFocal(members, "focalLength");
      var equivMed = representativeFocal(members, "focalLength35mm");
      if (focalMed != null) copy.focalLength = focalMed;
      if (equivMed != null) copy.focalLength35mm = equivMed;
      copy._burstSize = members.length;
      var start = Number(members[0].timestampMs) || 0;
      var end = Number(members[members.length - 1].timestampMs) || start;
      copy._burstSpanMs = Math.max(0, end - start);
      return copy;
    });

    var burstGroups = groups.filter(function (g) { return g.length > 1; }).length;
    var burstShots = groups.reduce(function (sum, g) { return sum + (g.length > 1 ? g.length : 0); }, 0);

    return {
      collapsed: collapsed,
      groups: groups,
      stats: {
        raw: list.length,
        collapsed: collapsed.length,
        burstGroups: burstGroups,
        burstShots: burstShots,
        saved: list.length - collapsed.length
      }
    };
  }

  return {
    groupBursts: groupBursts,
    median: median,
    focalClose: focalClose
  };
});
