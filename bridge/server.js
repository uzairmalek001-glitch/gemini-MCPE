// server.js
//
// Local bridge: Minecraft (behavior pack) <--HTTP/JSON--> this process <--HTTPS--> Gemini API.
//
// Why a bridge at all, instead of calling Gemini straight from the
// behavior pack (item 5 in the spec, "API key security")?
//   1. The Gemini API key never has to exist inside any file that ships
//      with the addon. It lives only in this process's .env.
//   2. Prompt construction, retries, and "did Gemini actually return
//      valid JSON" cleanup happen here in normal Node.js instead of the
//      more constrained Bedrock Script API sandbox.
//   3. You can swap providers later (a different model, a local LLM,
//      etc.) without touching the .mcpack at all - only this file.
//
// Run with: npm install && npm start   (see bridge/README.md)

require("dotenv").config();
const express = require("express");

const PORT = Number(process.env.PORT || 3000);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const ALLOWED_PLAYERS = (process.env.ALLOWED_PLAYERS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SYSTEM_PROMPT = `You are an AI assistant embedded inside a Minecraft Bedrock Edition world.

Rules you must follow:
- You do not control Minecraft directly. You can only REQUEST actions by naming one of the tools listed below; a separate validator decides whether each request is actually carried out.
- Never claim you performed an action. Only say what you are requesting, and let "message" describe what you told the player.
- Always respond with ONLY a single JSON object, no markdown fences, no commentary outside the JSON.
- The JSON object must have this shape:
  {
    "message": "<what to say to the player>",
    "actions": [ { "tool": "<tool_name>", "args": { ... } }, ... ]
  }
- "actions" may be an empty array if no tool call is needed.
- Never invent information about the Minecraft world. Use only the "playerState" data you were given. If you need more information to answer well, say so in "message" and ask a clarifying question instead of guessing.
- Keep actions small, few, and directly relevant to the player's request (max 5 per reply).
- Available tools:
  get_player_state() - re-fetch the player's current status
  get_nearby_blocks({ radius }) - list nearby non-air blocks (radius 1-16)
  get_nearby_entities({ radius }) - list nearby entities (radius 1-32)
  find_structure({ structure }) - attempt to locate a structure (e.g. "village")
  send_message({ text }) - send an extra chat line to the player
  place_block({ block, x, y, z }) - place a block at an offset from the player (x/y/z within +/-24)
  remove_block({ x, y, z }) - clear a block at an offset from the player
  give_item({ item, amount }) - give the player an item (amount 1-64)
  teleport({ x, y, z }) - move the player by an offset (x/y/z within +/-24)
- Block/item ids must be valid Minecraft Bedrock ids prefixed with "minecraft:" (e.g. "minecraft:oak_planks"). Only request items/blocks you are reasonably confident exist; the validator will reject anything not on its allowlist and you'll be told in the next turn.
- If the player's request is unrelated to Minecraft or unclear, respond conversationally in "message" with an empty "actions" array.`;

const app = express();
app.use(express.json({ limit: "256kb" }));

app.get("/health", (req, res) => {
  res.status(200).json({ ok: true, model: GEMINI_MODEL, hasApiKey: Boolean(GEMINI_API_KEY) });
});

app.post("/ask", async (req, res) => {
  const { query, playerState } = req.body || {};

  if (typeof query !== "string" || query.length === 0) {
    return res.status(400).json({ message: "Missing 'query' string in request body.", actions: [] });
  }

  if (ALLOWED_PLAYERS.length > 0 && playerState?.name && !ALLOWED_PLAYERS.includes(playerState.name)) {
    return res.status(403).json({ message: "This player is not allowed to use the AI assistant.", actions: [] });
  }

  if (!GEMINI_API_KEY) {
    console.error("[bridge] GEMINI_API_KEY is not set. Copy .env.example to .env and fill it in.");
    return res.status(500).json({ message: "The bridge is missing its Gemini API key. Ask the server operator to configure it.", actions: [] });
  }

  const userContent = `playerState: ${JSON.stringify(playerState ?? {})}\nplayer message: ${query}`;

  try {
    const geminiResponse = await callGeminiWithRetry(userContent);
    const parsed = extractJson(geminiResponse);

    if (!parsed || typeof parsed.message !== "string") {
      console.error("[bridge] Gemini reply was not the expected JSON shape:", geminiResponse);
      return res.status(502).json({
        message: "The AI's reply wasn't in the expected format, so I couldn't act on it. Try rephrasing.",
        actions: [],
      });
    }

    return res.status(200).json({
      message: parsed.message,
      actions: Array.isArray(parsed.actions) ? parsed.actions : [],
    });
  } catch (err) {
    console.error("[bridge] Gemini request failed:", err.message);
    const status = err.httpStatus === 429 ? 429 : 502;
    const friendly =
      err.httpStatus === 429
        ? "The AI is rate-limited right now. Try again in a bit."
        : err.code === "ETIMEDOUT" || err.name === "AbortError"
          ? "The AI took too long to respond (timeout)."
          : "The AI request failed. Check the bridge console for details.";
    return res.status(status).json({ message: friendly, actions: [] });
  }
});

/** Calls the Gemini API once, with a short timeout, one retry on 5xx/network errors. */
async function callGeminiWithRetry(userContent, attempt = 1) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: userContent }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.4,
        },
      }),
    });

    if (response.status === 429) {
      const err = new Error("Gemini API rate limit hit");
      err.httpStatus = 429;
      throw err;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      if (response.status >= 500 && attempt < 2) {
        console.warn(`[bridge] Gemini ${response.status}, retrying once...`);
        return callGeminiWithRetry(userContent, attempt + 1);
      }
      const err = new Error(`Gemini API error ${response.status}: ${body}`);
      err.httpStatus = response.status;
      throw err;
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

/** Gemini is asked for pure JSON via responseMimeType, but we still defensively strip fences. */
function extractJson(text) {
  if (!text) return null;
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "");
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("[bridge] Failed to parse Gemini JSON output:", cleaned);
    return null;
  }
}

app.listen(PORT, () => {
  console.log(`[bridge] gemini-mcpe bridge listening on http://localhost:${PORT}`);
  console.log(`[bridge] model: ${GEMINI_MODEL} | API key configured: ${Boolean(GEMINI_API_KEY)}`);
  if (!GEMINI_API_KEY) {
    console.warn("[bridge] WARNING: GEMINI_API_KEY is not set - /ask will fail until you configure .env");
  }
});
