import assert from "node:assert/strict";
import { test } from "node:test";
import { dockerSizeUpperBound } from "./footprint.mjs";

test("actual Docker rounded JSON sizes produce conservative finite byte bounds", () => {
  for (const [input, bound] of [
    ["318.8MB", 318900000],
    ["4.096kB", 4097],
    ["1.516GB", 1517000000],
    ["0B", 0],
    ["2133152856", 2133152856],
    [2133152856, 2133152856],
    ["2GiB", 3221225472],
  ])
    assert.equal(dockerSizeUpperBound(input), bound);
});
test("unknown/NaN/negative/overflow measurements cannot bypass footprint cap", () => {
  for (const input of [
    null,
    undefined,
    NaN,
    Infinity,
    -1,
    "NaN",
    "unknown",
    "2XB",
    "-2GB",
    "900719925474099300B",
    {},
    [],
  ])
    assert.throws(() => dockerSizeUpperBound(input), /FOOTPRINT_MEASUREMENT_INVALID/);
  const retained = 2133152856 + 704345712 + dockerSizeUpperBound("318.8MB");
  assert.ok(Number.isSafeInteger(retained));
  assert.ok(retained > 2000000000);
  assert.ok(retained < 6442450944);
});
