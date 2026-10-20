import type * as Source from "../../packages/adapters/src/sendblue-emulator.js";
export type { EmulatorInboundInput } from "../../packages/adapters/src/sendblue-emulator.js";

// Emulators are unsupported too; their barrel exports must not retain a vendor.
export const SendBlueEmulator = class {
  constructor() {
    throw new Error("Messaging is unsupported by native-mcp-local-v1");
  }
} as unknown as typeof Source.SendBlueEmulator;

export const createEmulatedSendbluePlatform: typeof Source.createEmulatedSendbluePlatform = () => {
  throw new Error("Messaging is unsupported by native-mcp-local-v1");
};
