// tools.js
//
// The ONLY code in this addon that is allowed to touch the world. Every
// function here assumes its arguments have ALREADY passed validator.js.
// Gemini never calls these directly - main.js/ai.js route validated
// { tool, args } objects here after the validator approves them.

import { world, system, ItemStack } from "@minecraft/server";
import { SCAN_RADIUS } from "./config.js";

function log(msg) {
  console.warn(`[gemini-mcpe] ${msg}`);
}

/** Read-only snapshot of the player's current state. */
export function get_player_state(player) {
  const loc = player.location;
  return {
    name: player.name,
    dimension: player.dimension.id,
    location: { x: Math.round(loc.x), y: Math.round(loc.y), z: Math.round(loc.z) },
    health: player.getComponent("minecraft:health")?.currentValue ?? null,
    isSneaking: player.isSneaking,
    isFlying: player.isFlying,
    selectedSlot: player.selectedSlotIndex,
  };
}

/**
 * Samples a small box of blocks around the player. Full block-by-block
 * scanning of a large radius is expensive on Bedrock, so this stays small
 * and returns only non-air block type ids with relative offsets.
 */
export function get_nearby_blocks(player, args) {
  const radius = Math.min(args?.radius ?? SCAN_RADIUS, 16);
  const dim = player.dimension;
  const base = player.location;
  const found = [];
  const MAX_RESULTS = 40;

  for (let dx = -radius; dx <= radius && found.length < MAX_RESULTS; dx += 1) {
    for (let dz = -radius; dz <= radius && found.length < MAX_RESULTS; dz += 1) {
      for (let dy = -2; dy <= 2 && found.length < MAX_RESULTS; dy += 1) {
        const x = Math.floor(base.x) + dx;
        const y = Math.floor(base.y) + dy;
        const z = Math.floor(base.z) + dz;
        try {
          const block = dim.getBlock({ x, y, z });
          if (block && !block.isAir) {
            found.push({ id: block.typeId, dx, dy, dz });
          }
        } catch (e) {
          // Unloaded chunk - skip silently.
        }
      }
    }
  }
  return { radius, sampled: found.length, blocks: found };
}

export function get_nearby_entities(player, args) {
  const radius = Math.min(args?.radius ?? SCAN_RADIUS * 2, 32);
  const dim = player.dimension;
  const entities = dim.getEntities({ location: player.location, maxDistance: radius });
  return {
    radius,
    entities: entities
      .filter((e) => e.id !== player.id)
      .slice(0, 40)
      .map((e) => ({
        type: e.typeId,
        location: {
          x: Math.round(e.location.x),
          y: Math.round(e.location.y),
          z: Math.round(e.location.z),
        },
      })),
  };
}

/**
 * Bedrock's Script API has no direct "find nearest village" call. The
 * closest working alternative (per project spec item 8) is:
 *   1. Try the vanilla `/locate structure <name>` command, which prints
 *      coordinates to the requesting player's chat if the structure exists
 *      nearby. Script API's runCommand() only reports success/failure
 *      counts, not the printed text, so we cannot read the coordinates
 *      back into script - but running it *does* surface them to the player.
 *   2. As a script-readable fallback, use dimension.findClosestBiome(),
 *      which IS exposed to scripts, to point the player toward a
 *      plausible biome (e.g. plains/desert/savanna for villages).
 * Both limitations are surfaced honestly in the returned object so the AI
 * can explain them instead of pretending it found exact coordinates.
 */
export function find_structure(player, args) {
  const structure = args.structure;
  const dim = player.dimension;
  let commandRan = false;
  let commandError = null;
  try {
    dim.runCommand(`locate structure ${structure}`);
    commandRan = true;
  } catch (e) {
    commandError = String(e);
  }

  let biomeHint = null;
  try {
    // findClosestBiome is part of the stable @minecraft/server Dimension API.
    const biomeGuessMap = {
      village: "plains",
      village_plains: "plains",
      village_desert: "desert",
      village_savanna: "savanna",
      village_taiga: "taiga",
      pillager_outpost: "plains",
    };
    const biomeId = biomeGuessMap[structure.toLowerCase()];
    if (biomeId && dim.findClosestBiome) {
      const result = dim.findClosestBiome(player.location, biomeId, { boundingSize: { x: 256, y: 256, z: 256 } });
      if (result) {
        biomeHint = { biome: biomeId, location: { x: Math.round(result.x), y: Math.round(result.y), z: Math.round(result.z) } };
      }
    }
  } catch (e) {
    log(`find_structure biome fallback failed: ${e}`);
  }

  return {
    structure,
    ranLocateCommand: commandRan,
    locateCommandError: commandError,
    note:
      "Bedrock's Script API can't read /locate's printed coordinates back into script. " +
      "The /locate command was run so exact coordinates (if found) were printed directly " +
      "to the player's chat. biomeHint below is a script-readable approximation only.",
    biomeHint,
  };
}

export function send_message(player, args) {
  player.sendMessage(args.text);
  return { sent: true };
}

export function place_block(player, args) {
  const dim = player.dimension;
  const loc = player.location;
  const target = { x: Math.floor(loc.x) + args.x, y: Math.floor(loc.y) + args.y, z: Math.floor(loc.z) + args.z };
  const block = dim.getBlock(target);
  if (!block) return { placed: false, reason: "target chunk not loaded" };
  try {
    dim.getBlock(target).setType(args.block);
    return { placed: true, at: target, block: args.block };
  } catch (e) {
    return { placed: false, reason: String(e) };
  }
}

export function remove_block(player, args) {
  const dim = player.dimension;
  const loc = player.location;
  const target = { x: Math.floor(loc.x) + args.x, y: Math.floor(loc.y) + args.y, z: Math.floor(loc.z) + args.z };
  try {
    dim.getBlock(target).setType("minecraft:air");
    return { removed: true, at: target };
  } catch (e) {
    return { removed: false, reason: String(e) };
  }
}

export function give_item(player, args) {
  try {
    const inventory = player.getComponent("minecraft:inventory");
    const container = inventory?.container;
    if (!container) return { given: false, reason: "no inventory component" };
    const stack = new ItemStack(args.item, args.amount ?? 1);
    container.addItem(stack);
    return { given: true, item: args.item, amount: args.amount ?? 1 };
  } catch (e) {
    return { given: false, reason: String(e) };
  }
}

export function teleport(player, args) {
  const loc = player.location;
  const target = { x: loc.x + args.x, y: loc.y + args.y, z: loc.z + args.z };
  try {
    player.teleport(target, { dimension: player.dimension });
    return { teleported: true, to: target };
  } catch (e) {
    return { teleported: false, reason: String(e) };
  }
}

export const TOOL_IMPLEMENTATIONS = {
  get_player_state,
  get_nearby_blocks,
  get_nearby_entities,
  find_structure,
  send_message,
  place_block,
  remove_block,
  give_item,
  teleport,
};
