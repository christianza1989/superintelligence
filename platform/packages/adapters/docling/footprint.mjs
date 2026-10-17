// Docker versions render JSON .Size as either bytes or rounded SI strings.
// Rounded display values are upper bounds, never treated as exact byte counts.
export function dockerSizeUpperBound(value) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value !== "string" || value.length > 40)
    throw new Error("FOOTPRINT_MEASUREMENT_INVALID");
  if (/^\d+$/.test(value)) {
    const number = Number(value);
    if (Number.isSafeInteger(number)) return number;
  }
  const match = /^(\d+(?:\.\d+)?)(B|kB|KB|MB|GB|TB|KiB|MiB|GiB)$/.exec(value);
  if (!match) throw new Error("FOOTPRINT_MEASUREMENT_INVALID");
  const unit = {
    B: 1,
    kB: 1000,
    KB: 1000,
    MB: 1e6,
    GB: 1e9,
    TB: 1e12,
    KiB: 1024,
    MiB: 1048576,
    GiB: 1073741824,
  }[match[2]];
  const digits = match[1].split(".")[1]?.length ?? 0;
  const denominator = 10n ** BigInt(digits);
  const numerator =
    (BigInt(match[1].replace(".", "")) + (match[2] === "B" ? 0n : 1n)) * BigInt(unit);
  const bound = Number((numerator + denominator - 1n) / denominator);
  if (!Number.isSafeInteger(bound) || bound < 0) throw new Error("FOOTPRINT_MEASUREMENT_INVALID");
  return bound;
}
