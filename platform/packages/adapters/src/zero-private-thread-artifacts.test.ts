import { describe, expect, it, vi } from "vitest";
import { attachWorkspaceFileToThread, materializeCurrentTurnFiles } from "./thread-artifacts.js";
import { loadCurrentTurnImages } from "./executor.js";
const context = {
  spaceId: "space",
  userId: "user",
  botId: "bot",
  runId: "run",
  operationId: "operation",
  traceId: "trace",
  signal: new AbortController().signal,
};
describe("private component artifacts cannot be attached or materialized by generic model paths", () => {
  it("rejects workspace export under a reserved artifact name before storing bytes", async () => {
    const put = vi.fn();
    await expect(
      attachWorkspaceFileToThread(
        { prisma: {} as never, artifacts: { put } as never },
        {
          ...context,
          filePath: "zero-pdf-input.pdf",
          bytes: Buffer.from("private"),
        },
      ),
    ).rejects.toThrow();
    expect(put).not.toHaveBeenCalled();
  });
  it("rejects a private artifact ID in a current-turn file block before any host read/write", async () => {
    const get = vi.fn(),
      writeFile = vi.fn();
    const deps = {
      prisma: {
        artifact: {
          findMany: vi.fn(async () => [
            {
              id: "private",
              name: "zero-jev-request.json",
              clientNonce: "zero.jev.request:job",
              storageKey: "secret",
            },
          ]),
        },
      },
      artifacts: { get },
      sandbox: { writeFile },
    };
    await expect(
      materializeCurrentTurnFiles(
        deps as never,
        [
          {
            kind: "file",
            artifactId: "private",
            name: "ordinary.txt",
            mimeType: "text/plain",
            size: 7,
          },
        ],
        { context, computer: {} as never, computerMode: "bot" } as never,
      ),
    ).rejects.toThrow("unavailable");
    expect(get).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });
  it("does not treat a forged image block as permission to load a private request", async () => {
    const get = vi.fn(),
      deps = {
        prisma: {
          artifact: {
            findMany: vi.fn(async () => [
              {
                id: "private",
                name: "renamed.png",
                clientNonce: "zero.csv.request:job",
                storageKey: "secret",
              },
            ]),
          },
        },
        artifacts: { get },
      };
    expect(
      await loadCurrentTurnImages(
        deps as never,
        [
          {
            kind: "image",
            artifactId: "private",
            name: "ordinary.png",
            mimeType: "image/png",
          },
        ],
        context,
      ),
    ).toBeUndefined();
    expect(get).not.toHaveBeenCalled();
  });
});
