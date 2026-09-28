const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { groupBursts, median, focalClose } = require("../burst-group");

function photo(overrides = {}) {
  return {
    lensName: "M.Zuiko 12-40mm",
    bodyName: "OM-1",
    focalLength: 25,
    focalLength35mm: 50,
    timestampMs: 1_700_000_000_000,
    path: "a.jpg",
    ...overrides,
  };
}

describe("burst-group", () => {
  it("collapses rapid same-lens shots into one", () => {
    const base = 1_700_000_000_000;
    const records = [0, 300, 700].map((offset, i) =>
      photo({ timestampMs: base + offset, path: `burst-${i}.jpg` })
    );
    const result = groupBursts(records, { enabled: true, windowSec: 1, focalTolerance: 1 });
    assert.equal(result.collapsed.length, 1);
    assert.equal(result.collapsed[0]._burstSize, 3);
    assert.equal(result.stats.burstGroups, 1);
    assert.equal(result.stats.saved, 2);
  });

  it("splits bursts when the gap exceeds the window", () => {
    const base = 1_700_000_000_000;
    const records = [
      photo({ timestampMs: base, path: "a.jpg" }),
      photo({ timestampMs: base + 5000, path: "b.jpg" }),
    ];
    const result = groupBursts(records, { enabled: true, windowSec: 1, focalTolerance: 1 });
    assert.equal(result.collapsed.length, 2);
    assert.equal(result.stats.burstGroups, 0);
  });

  it("does not merge different lenses or bodies", () => {
    const base = 1_700_000_000_000;
    const records = [
      photo({ timestampMs: base, path: "a.jpg" }),
      photo({ timestampMs: base + 200, lensName: "M.Zuiko 45mm", path: "b.jpg" }),
      photo({ timestampMs: base + 400, bodyName: "E-M1", path: "c.jpg" }),
    ];
    const result = groupBursts(records, { enabled: true, windowSec: 1, focalTolerance: 1 });
    assert.equal(result.collapsed.length, 3);
  });

  it("respects the enabled=false passthrough", () => {
    const base = 1_700_000_000_000;
    const records = [0, 100, 200].map((offset, i) =>
      photo({ timestampMs: base + offset, path: `p-${i}.jpg` })
    );
    const result = groupBursts(records, { enabled: false, windowSec: 2, focalTolerance: 2 });
    assert.equal(result.collapsed.length, 3);
    assert.equal(result.stats.saved, 0);
  });

  it("keeps photos without timestamps separate", () => {
    const records = [photo({ timestampMs: null, path: "a.jpg" }), photo({ timestampMs: null, path: "b.jpg" })];
    const result = groupBursts(records, { enabled: true, windowSec: 2, focalTolerance: 1 });
    assert.equal(result.collapsed.length, 2);
  });

  it("uses median focal length for a burst", () => {
    const base = 1_700_000_000_000;
    const records = [24, 25, 26].map((focal, i) =>
      photo({ focalLength: focal, timestampMs: base + i * 200, path: `f-${i}.jpg` })
    );
    const result = groupBursts(records, { enabled: true, windowSec: 1, focalTolerance: 2 });
    assert.equal(result.collapsed.length, 1);
    assert.equal(result.collapsed[0].focalLength, 25);
  });

  it("median and focalClose helpers behave", () => {
    assert.equal(median([25, 24, 26]), 25);
    assert.equal(median([]), null);
    assert.equal(focalClose(25, 25.8, 1), true);
    assert.equal(focalClose(25, 27, 1), false);
    assert.equal(focalClose(null, 27, 1), true);
  });
});
