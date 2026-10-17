import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LIBRARY_HANDOFF_KEY,
  LIBRARY_HANDOFF_PATH,
  libraryHandoffPath,
  libraryHandoffSignInDestination,
  readLibraryHandoffDraft,
  saveLibraryHandoffDraft,
} from "./library-project-handoff";

afterEach(() => vi.unstubAllGlobals());
function storage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
describe("Library project handoff draft", () => {
  it("preserves only a bounded known route through sign-in", () => {
    expect(libraryHandoffPath("KDE/krita")).toBe(
      LIBRARY_HANDOFF_PATH + "?repo=KDE%2Fkrita",
    );
    expect(
      libraryHandoffSignInDestination(
        "/app/library/start?repo=KDE%2Fkrita&redirect=https%3A%2F%2Fevil.invalid",
      ),
    ).toBe(libraryHandoffPath("KDE/krita"));
    for (const next of [
      null,
      "https://evil.invalid",
      "//evil.invalid",
      "/app/library/start/../evil?repo=KDE/krita",
      "/app/library/start?repo=../../private",
      "/app/library/start?repo=" + "x".repeat(600),
      "/app?repo=KDE/krita",
    ])
      expect(libraryHandoffSignInDestination(next)).toBeNull();
  });
  it("retains one intent nonce across reload and strips non-authoritative browser facts", () => {
    const local = storage();
    const draft = {
      candidateId: "KDE/krita",
      role: "reference" as const,
      brief: "Plan a local image workflow.",
      botId: "bot-one",
      clientNonce: "intent-one",
    };
    saveLibraryHandoffDraft(local, draft);
    expect(readLibraryHandoffDraft(local, "KDE/krita")).toEqual(draft);
    local.setItem(
      LIBRARY_HANDOFF_KEY,
      JSON.stringify({
        ...draft,
        runtimeTested: true,
        sourceRevision: "fake-pin",
      }),
    );
    expect(readLibraryHandoffDraft(local, "KDE/krita")).toEqual(draft);
    expect(readLibraryHandoffDraft(local, "morluto/rea").brief).toBe("");
  });
  it("rejects malformed draft, unsupported role, excessive brief and blocked storage", () => {
    const local = storage();
    const draft = {
      candidateId: "KDE/krita",
      role: "reference",
      brief: "A plan.",
      botId: "bot-one",
      clientNonce: "intent-one",
    };
    for (const text of [
      "invalid",
      JSON.stringify({ ...draft, role: "execute" }),
      JSON.stringify({ ...draft, brief: "x".repeat(2001) }),
      JSON.stringify({ ...draft, clientNonce: "../../unsafe" }),
      "x".repeat(8193),
    ]) {
      local.setItem(LIBRARY_HANDOFF_KEY, text);
      expect(readLibraryHandoffDraft(local, "KDE/krita")).toMatchObject({
        brief: "",
        botId: "",
        role: "reference",
      });
    }
    const blocked = {
      getItem: () => {
        throw Error("blocked");
      },
      setItem: () => {
        throw Error("blocked");
      },
    };
    const memory = readLibraryHandoffDraft(blocked, "KDE/krita");
    expect(() => saveLibraryHandoffDraft(blocked, memory)).not.toThrow();
    expect(memory.clientNonce).toMatch(/^[a-zA-Z0-9_-]+$/u);
  });
});
