// main.js
//
// Entry point (see manifest.json "entry"). Wires together:
//   chat input -> ai.js (Gemini via bridge) -> validator.js -> tools.js
//
// Player types:  !ai <anything>        -> sends <anything> to Gemini
//                !ai-status            -> checks the bridge connection
//
// Everything below is defensive: a bad reply from the bridge, an
// unreachable network, or a malformed action should show the player a
// clear chat message and never crash the world.

import { world, system } from "@minecraft/server";
import { CHAT_PREFIX, STATUS_COMMAND } from "./config.js";
import { askGemini, checkBridgeStatus } from "./ai.js";
import { validateAction, isKnownTool } from "./validator.js";
import { TOOL_IMPLEMENTATIONS } from "./tools.js";
import { formatAiReply, formatSystem, formatError } from "./ui.js";

world.beforeEvents.chatSend.subscribe((ev) => {
  const message = ev.message;

  if (message === STATUS_COMMAND) {
    ev.cancel = true;
    const player = ev.sender;
    system.run(async () => {
      const status = await checkBridgeStatus();
      player.sendMessage(status.ok ? formatSystem(status.message) : formatError(status.message));
    });
    return;
  }

  if (message.startsWith(CHAT_PREFIX)) {
    ev.cancel = true;
    const player = ev.sender;
    const query = message.slice(CHAT_PREFIX.length).trim();

    if (query.length === 0) {
      player.sendMessage(formatError(`Usage: ${CHAT_PREFIX} <your message>`));
      return;
    }

    // All real work happens on the next tick via system.run, since chat
    // event handlers must stay synchronous and this addon then awaits a
    // network call.
    system.run(() => handleAiChat(player, query));
  }
});

async function handleAiChat(player, query) {
  player.onScreenDisplay?.setActionBar?.(formatSystem("Thinking..."));

  const result = await askGemini(player, query);
  player.sendMessage(formatAiReply(result.message));

  if (!result.ok || !Array.isArray(result.actions) || result.actions.length === 0) {
    return;
  }

  for (const action of result.actions) {
    runValidatedAction(player, action);
  }
}

function runValidatedAction(player, action) {
  const validation = validateAction(action);
  if (!validation.valid) {
    console.warn(`[gemini-mcpe] rejected action ${JSON.stringify(action)}: ${validation.error}`);
    player.sendMessage(formatError(`Skipped an AI action (${action?.tool ?? "unknown"}): ${validation.error}`));
    return;
  }

  if (!isKnownTool(action.tool)) {
    // Defensive - validateAction already checks this, but never trust once.
    return;
  }

  try {
    const impl = TOOL_IMPLEMENTATIONS[action.tool];
    const outcome = impl(player, action.args ?? {});
    console.warn(`[gemini-mcpe] executed ${action.tool}: ${JSON.stringify(outcome)}`);
  } catch (e) {
    console.warn(`[gemini-mcpe] tool '${action.tool}' threw: ${e}`);
    player.sendMessage(formatError(`The AI's '${action.tool}' action failed: ${e}`));
  }
}

world.afterEvents.worldLoad?.subscribe?.(() => {
  console.warn("[gemini-mcpe] Gemini AI Assistant loaded.");
});

console.warn("[gemini-mcpe] main.js initialized.");
