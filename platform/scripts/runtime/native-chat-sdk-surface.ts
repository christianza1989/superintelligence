import type * as Source from "../../packages/adapters/src/chat-sdk-surface.js";
export type { MessagingPlatform } from "../../packages/adapters/src/chat-sdk-surface.js";

// Preserve the shared webhook bound; the constructor never creates a surface.
export const MESSAGING_WEBHOOK_MAX_BODY_BYTES: typeof Source.MESSAGING_WEBHOOK_MAX_BODY_BYTES =
  256 * 1024;

// This profile has no messaging runtime. The cast preserves the source boundary's
// constructor type; no instance can escape the throwing constructor.
export const ChatSdkMessagingSurface = class {
  constructor() {
    throw new Error("Messaging is unsupported by native-mcp-local-v1");
  }
} as unknown as typeof Source.ChatSdkMessagingSurface;

export const providerOfThreadId: typeof Source.providerOfThreadId = () => {
  throw new Error("Messaging is unsupported by native-mcp-local-v1");
};
