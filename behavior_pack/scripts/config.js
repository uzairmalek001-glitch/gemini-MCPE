// config.js
//
// IMPORTANT (see README "API key security"):
// This file NEVER contains the Gemini API key. The key lives only in
// bridge/.env on whatever machine runs the bridge server. The behavior
// pack only needs to know *where* the bridge is (a plain URL, not a
// secret), so it's safe to ship this file inside a distributed .mcpack.
//
// The bridge URL can be overridden per-world without editing/repacking
// the addon, by running this command as an operator in-game:
//   /scriptevent gemini:config {"bridgeUrl":"http://192.168.1.20:3000"}

import { world } from "@minecraft/server";

const DEFAULT_BRIDGE_URL = "http://localhost:3000";
const DYNAMIC_PROP_KEY = "gemini:bridge_url";

/** Chat prefix players type to talk to the assistant, e.g. "!ai help me build a house" */
export const CHAT_PREFIX = "!ai";

/** Command players type to check bridge connectivity, e.g. "!ai-status" */
export const STATUS_COMMAND = "!ai-status";

/** How long (ms) we wait for the bridge to respond before giving up. */
export const REQUEST_TIMEOUT_MS = 15000;

/** Max number of tool actions the AI is allowed to request in a single reply. */
export const MAX_ACTIONS_PER_RESPONSE = 5;

/** Radius (in blocks) used for get_nearby_blocks / get_nearby_entities. Kept small to avoid lag. */
export const SCAN_RADIUS = 8;

export function getBridgeUrl() {
  try {
    const stored = world.getDynamicProperty(DYNAMIC_PROP_KEY);
    if (typeof stored === "string" && stored.length > 0) {
      return stored;
    }
  } catch (e) {
    // world not fully ready yet; fall through to default
  }
  return DEFAULT_BRIDGE_URL;
}

export function setBridgeUrl(url) {
  world.setDynamicProperty(DYNAMIC_PROP_KEY, url);
}
