import type { RepositoryReuseRole } from "@rakazo/contracts";
export const LIBRARY_HANDOFF_PATH = "/app/library/start";
export const LIBRARY_HANDOFF_KEY = "repositoryzero.library.handoff.v1";
export type LibraryHandoffDraft = {
  candidateId: string;
  role: RepositoryReuseRole;
  brief: string;
  botId: string;
  clientNonce: string;
};
type Store = Pick<Storage, "getItem" | "setItem">;
export function libraryHandoffPath(candidateId: string): string {
  return `${LIBRARY_HANDOFF_PATH}?repo=${encodeURIComponent(candidateId)}`;
}
/** Only this known in-app destination may survive authentication. */
export function libraryHandoffSignInDestination(
  next: string | null,
): string | null {
  if (!next || next.length > 500) return null;
  const [path, query] = next.split("?");
  if (path !== LIBRARY_HANDOFF_PATH) return null;
  const candidate = new URLSearchParams(query).get("repo") ?? "";
  return /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/u.test(candidate) &&
    candidate.length <= 200
    ? libraryHandoffPath(candidate)
    : null;
}
export function readLibraryHandoffDraft(
  storage: Store | null,
  candidateId: string,
): LibraryHandoffDraft {
  try {
    const raw = storage?.getItem(LIBRARY_HANDOFF_KEY);
    if (raw && raw.length <= 8192) {
      const value: unknown = JSON.parse(raw);
      if (
        value &&
        typeof value === "object" &&
        "candidateId" in value &&
        value.candidateId === candidateId &&
        "role" in value &&
        ["foundation", "component", "reference"].includes(
          value.role as string,
        ) &&
        "brief" in value &&
        typeof value.brief === "string" &&
        value.brief.length <= 2000 &&
        "botId" in value &&
        typeof value.botId === "string" &&
        value.botId.length <= 200 &&
        "clientNonce" in value &&
        typeof value.clientNonce === "string" &&
        /^[a-zA-Z0-9_-]{1,120}$/u.test(value.clientNonce)
      )
        return {
          candidateId,
          role: value.role as RepositoryReuseRole,
          brief: value.brief,
          botId: value.botId,
          clientNonce: value.clientNonce,
        };
    }
  } catch {
    /* Keep an in-memory draft when storage is unavailable. */
  }
  return {
    candidateId,
    role: "reference",
    brief: "",
    botId: "",
    clientNonce: crypto.randomUUID(),
  };
}
export function saveLibraryHandoffDraft(
  storage: Store | null,
  draft: LibraryHandoffDraft,
): void {
  try {
    storage?.setItem(LIBRARY_HANDOFF_KEY, JSON.stringify(draft));
  } catch {
    /* Current-page retries retain the same nonce. */
  }
}
