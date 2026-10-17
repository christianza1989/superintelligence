import { preparedProfiles, ZERO_CSV_SOURCE_PINS } from "@rakazo/core/zero-prepared-profiles";
import { describe, expect, it } from "vitest";
import {
  executeZeroCsv,
  prepareZeroCsvComponent,
  validateZeroCsv,
  verifyZeroCsvRows,
  ZERO_CSV_LIMITS,
  zeroCsvHash,
} from "./zero-csv-profile.js";

describe("bounded CSV preparation profile", () => {
  it.each([
    [
      "a,b\n1,2\n",
      [
        ["a", "b"],
        ["1", "2"],
      ],
    ],
    [
      'name,note\r\n"A,B","line\r\nnext"\r\n',
      [
        ["name", "note"],
        ["A,B", "line\r\nnext"],
      ],
    ],
    ['"escaped ""quote""",\n', [['escaped "quote"', ""]]],
    ["žodis,値", [["žodis", "値"]]],
  ])("executes reviewed d3 parser and independently validates %s", (csv, expected) => {
    expect(executeZeroCsv(csv as string)).toMatchObject({
      rows: expected,
      verification: { outcome: "pass" },
    });
  });
  it.each([
    '"unterminated',
    'a"b,c',
    '"a"junk,b',
    "a,b\nc",
    "a\rb",
    "",
    "\ufeffa",
    "a\0b",
    "a".repeat(ZERO_CSV_LIMITS.cellChars + 1),
    "a,".repeat(65),
  ])("rejects unsupported/malformed input before accepting a result: %s", (csv) => {
    expect(() => executeZeroCsv(csv)).toThrow();
  });
  it("detects a deliberately broken component result", () => {
    const expected = validateZeroCsv('name,value\n"one,two",3');
    expect(() =>
      verifyZeroCsvRows(expected, [
        ["name", "value"],
        ["one", "two", "3"],
      ]),
    ).toThrow("csv_verification_failed");
  });
  it("keeps byte and row bounds finite including non-ASCII input", () => {
    expect(() => validateZeroCsv("値".repeat(6000))).toThrow();
    expect(() => validateZeroCsv("a\n".repeat(ZERO_CSV_LIMITS.rows + 1))).toThrow();
  });
  it("prepares the exact pinned component files and license", async () => {
    const component = await prepareZeroCsvComponent();
    expect(component).toMatchObject({
      name: "d3-dsv",
      version: "3.0.1",
      license: "ISC",
      entrypoint: "src/csv.js#csvParseRows",
    });
    for (const file of component.files) expect(zeroCsvHash(file.content)).toBe(file.sha256);
    expect(component.files.map((file) => file.path)).toEqual([
      "src/csv.js",
      "src/dsv.js",
      "LICENSE",
      "package.json",
    ]);
    const profile = preparedProfiles[0]!;
    expect(component.profile).toBe(profile.profileId);
    expect(component.version).toBe(profile.packageVersion);
    expect(component.license).toBe(profile.licenseSource);
    expect(component.entrypoint).toBe(profile.entrypoint);
    expect(component.files.slice(0, 3).map(({ path, sha256 }) => [path, sha256])).toEqual(
      Object.entries(ZERO_CSV_SOURCE_PINS),
    );
  });
});
