import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LIBRARY_FILTERS_KEY,
  libraryReturnPath,
} from "./repository-library-navigation";

afterEach(() => vi.unstubAllGlobals());

describe("Library return navigation", () => {
  it("restores only Library URL parameters on a fixed public route", () => {
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (key: string) =>
          key === LIBRARY_FILTERS_KEY
            ? "q=image+editor&category=images&repo=KDE%2Fkrita&view=saved&redirect=https%3A%2F%2Fexample.test"
            : null,
      },
    });
    const path = libraryReturnPath();
    expect(path).toBe(
      "/discover?q=image+editor&category=images&view=saved&repo=KDE%2Fkrita",
    );
  });
  it("handles missing, blocked and oversized stored state", () => {
    for (const value of [null, "x".repeat(2049)]) {
      vi.stubGlobal("window", { sessionStorage: { getItem: () => value } });
      expect(libraryReturnPath()).toBe("/discover");
    }
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(libraryReturnPath()).toBe("/discover");
  });
});
