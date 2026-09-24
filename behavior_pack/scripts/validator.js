// validator.js
//
// Gemini never executes anything directly. It can only *request* one of the
// tools below, as strict JSON. Every request is checked against the schema
// here before tools.js is allowed to touch the world. If a field is missing,
// the wrong type, or out of range, the whole action is rejected and logged
// instead of executed. This is the "action validator" from the architecture.

// A conservative block/item allowlist. Extend this list deliberately -
// don't let the AI place/give anything not explicitly reviewed here.
const ALLOWED_BLOCKS = new Set([
  "minecraft:dirt", "minecraft:stone", "minecraft:cobblestone", "minecraft:oak_planks",
  "minecraft:oak_log", "minecraft:glass", "minecraft:oak_door", "minecraft:torch",
  "minecraft:crafting_table", "minecraft:furnace", "minecraft:sand", "minecraft:air",
]);

const ALLOWED_ITEMS = new Set([
  "minecraft:oak_planks", "minecraft:torch", "minecraft:crafting_table", "minecraft:furnace",
  "minecraft:bread", "minecraft:apple", "minecraft:stone_pickaxe", "minecraft:stone_axe",
  "minecraft:stone_sword", "minecraft:iron_ingot", "minecraft:oak_log",
]);

const MAX_COORD_OFFSET = 24; // how far from the player an action may target
const MAX_ITEM_COUNT = 64;

function isFiniteNumber(n) {
  return typeof n === "number" && Number.isFinite(n);
}

function isSmallOffset(n) {
  return isFiniteNumber(n) && Math.abs(n) <= MAX_COORD_OFFSET;
}

/**
 * Schema table. Each validator receives the raw `args` object from Gemini's
 * JSON and returns { valid: boolean, error?: string }.
 */
const SCHEMAS = {
  send_message: (args) => {
    if (typeof args?.text !== "string" || args.text.length === 0) {
      return { valid: false, error: "send_message requires a non-empty string 'text'" };
    }
    if (args.text.length > 512) {
      return { valid: false, error: "send_message text too long (max 512 chars)" };
    }
    return { valid: true };
  },

  get_player_state: () => ({ valid: true }),

  get_nearby_blocks: (args) => {
    if (args?.radius !== undefined && (!isFiniteNumber(args.radius) || args.radius < 1 || args.radius > 16)) {
      return { valid: false, error: "get_nearby_blocks radius must be a number between 1 and 16" };
    }
    return { valid: true };
  },

  get_nearby_entities: (args) => {
    if (args?.radius !== undefined && (!isFiniteNumber(args.radius) || args.radius < 1 || args.radius > 32)) {
      return { valid: false, error: "get_nearby_entities radius must be a number between 1 and 32" };
    }
    return { valid: true };
  },

  find_structure: (args) => {
    if (typeof args?.structure !== "string" || args.structure.length === 0) {
      return { valid: false, error: "find_structure requires a non-empty string 'structure'" };
    }
    return { valid: true };
  },

  place_block: (args) => {
    if (typeof args?.block !== "string" || !ALLOWED_BLOCKS.has(args.block)) {
      return { valid: false, error: `place_block: '${args?.block}' is not an allowed block id` };
    }
    if (!isSmallOffset(args?.x) || !isSmallOffset(args?.y) || !isSmallOffset(args?.z)) {
      return { valid: false, error: `place_block: x/y/z must be numbers within +/-${MAX_COORD_OFFSET} of the player` };
    }
    return { valid: true };
  },

  remove_block: (args) => {
    if (!isSmallOffset(args?.x) || !isSmallOffset(args?.y) || !isSmallOffset(args?.z)) {
      return { valid: false, error: `remove_block: x/y/z must be numbers within +/-${MAX_COORD_OFFSET} of the player` };
    }
    return { valid: true };
  },

  give_item: (args) => {
    if (typeof args?.item !== "string" || !ALLOWED_ITEMS.has(args.item)) {
      return { valid: false, error: `give_item: '${args?.item}' is not an allowed item id` };
    }
    const amount = args?.amount ?? 1;
    if (!isFiniteNumber(amount) || amount < 1 || amount > MAX_ITEM_COUNT) {
      return { valid: false, error: `give_item: amount must be between 1 and ${MAX_ITEM_COUNT}` };
    }
    return { valid: true };
  },

  teleport: (args) => {
    if (!isSmallOffset(args?.x) || !isSmallOffset(args?.y) || !isSmallOffset(args?.z)) {
      return { valid: false, error: `teleport: x/y/z must be numbers within +/-${MAX_COORD_OFFSET} of the player` };
    }
    return { valid: true };
  },
};

/**
 * Validates a single { tool, args } action object from Gemini's JSON.
 * Never throws - always returns a result object.
 */
export function validateAction(action) {
  if (!action || typeof action !== "object") {
    return { valid: false, error: "action must be an object" };
  }
  const { tool, args } = action;
  if (typeof tool !== "string" || !(tool in SCHEMAS)) {
    return { valid: false, error: `unknown or missing tool: '${tool}'` };
  }
  try {
    return SCHEMAS[tool](args ?? {});
  } catch (e) {
    return { valid: false, error: `validator threw for tool '${tool}': ${e}` };
  }
}

export function isKnownTool(name) {
  return typeof name === "string" && name in SCHEMAS;
}
