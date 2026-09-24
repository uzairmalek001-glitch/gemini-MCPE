// ai.js
//
// Talks to the local bridge server over HTTP (never directly to Gemini -
// see README for why). Only usable where @minecraft/server-net is
// available, which today means a Bedrock Dedicated Server world, not the
// bare Minecraft client - see SETUP.md.

import { http, HttpRequest, HttpRequestMethod, HttpHeader } from "@minecraft/server-net";
import { getBridgeUrl, REQUEST_TIMEOUT_MS, MAX_ACTIONS_PER_RESPONSE } from "./config.js";
import { get_player_state } from "./tools.js";

function log(msg) {
  console.warn(`[gemini-mcpe] ${msg}`);
}

/**
 * Sends the player's chat query + a snapshot of their state to the bridge,
 * and returns the parsed { message, actions } object - or a fallback
 * object describing what went wrong, never throws.
 */
export async function askGemini(player, query) {
  const bridgeUrl = getBridgeUrl();
  const payload = {
    query,
    playerState: get_player_state(player),
  };

  const request = new HttpRequest(`${bridgeUrl}/ask`);
  request.method = HttpRequestMethod.Post;
  request.headers = [new HttpHeader("Content-Type", "application/json")];
  request.body = JSON.stringify(payload);
  request.timeout = REQUEST_TIMEOUT_MS;

  try {
    const response = await http.request(request);

    if (response.status !== 200) {
      log(`bridge returned HTTP ${response.status}: ${response.body}`);
      return {
        ok: false,
        message: `The AI bridge returned an error (HTTP ${response.status}). Check the bridge console for details.`,
        actions: [],
      };
    }

    let parsed;
    try {
      parsed = JSON.parse(response.body);
    } catch (e) {
      log(`bridge sent malformed JSON: ${response.body}`);
      return {
        ok: false,
        message: "The AI bridge sent a response I couldn't understand. Try again in a moment.",
        actions: [],
      };
    }

    if (typeof parsed.message !== "string") {
      return {
        ok: false,
        message: "The AI response was missing a 'message' field.",
        actions: [],
      };
    }

    const actions = Array.isArray(parsed.actions) ? parsed.actions.slice(0, MAX_ACTIONS_PER_RESPONSE) : [];
    return { ok: true, message: parsed.message, actions };
  } catch (e) {
    // Network failure: bridge not running, wrong URL, no internet on the
    // bridge's side, DNS failure, etc. This is the "no internet" /
    // "unavailable bridge" case from the error-handling requirements.
    log(`request to bridge failed: ${e}`);
    return {
      ok: false,
      message:
        "I can't reach the AI bridge right now. Make sure the bridge server is running " +
        `and reachable at ${bridgeUrl} (see SETUP.md).`,
      actions: [],
    };
  }
}

/** Lightweight health check used by the !ai-status command. */
export async function checkBridgeStatus() {
  const bridgeUrl = getBridgeUrl();
  try {
    const response = await http.get(`${bridgeUrl}/health`);
    if (response.status === 200) {
      return { ok: true, message: `Bridge OK at ${bridgeUrl}.` };
    }
    return { ok: false, message: `Bridge at ${bridgeUrl} responded with HTTP ${response.status}.` };
  } catch (e) {
    return { ok: false, message: `Bridge unreachable at ${bridgeUrl}: ${e}` };
  }
}
