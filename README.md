# gemini-mcpe

A Minecraft **Bedrock Edition** add-on that lets players chat with a
Gemini-powered AI assistant in-game (`!ai <message>`), with a small,
validated set of tools the AI can request (never execute directly).

```
Minecraft Bedrock (behavior pack, Script API)
        |  HTTP (local network / localhost)
        v
   bridge/server.js  (Node.js)
        |  HTTPS
        v
    Gemini API
```

## Read this first: a real platform limitation

I checked the current official Bedrock Script API docs before building
this (per your instructions not to invent APIs), and there's an important
constraint you should know about:

> **`@minecraft/server-net` (the module that does HTTP requests) only
> works on a Bedrock Dedicated Server (BDS). It does not function in the
> plain Minecraft client app - including local/offline worlds played
> directly in the Android app - or in Realms.**

That means the AI chat feature in this addon **requires your world to be
hosted by a Bedrock Dedicated Server**, with the Android Minecraft app
joining it as a client (even if that server runs on the same phone, via
`127.0.0.1`, or on a PC on the same Wi-Fi). There is currently no
supported way for a script running in a plain client-side world to make an
HTTP request at all - so a "no BDS" version of this feature isn't
possible to build honestly with today's stable APIs. See `SETUP.md` for
your options, including running BDS via Termux.

Everything else in the spec (tool layer, validator, JSON contract, error
handling, API key security) works the same regardless of where BDS runs.

## What's included

```
gemini-mcpe/
├── behavior_pack/          # The add-on itself (.mcpack once zipped)
│   ├── manifest.json
│   └── scripts/
│       ├── main.js         # entry point: chat interception + action loop
│       ├── ai.js           # talks to the bridge over HTTP
│       ├── tools.js        # the only code allowed to touch the world
│       ├── validator.js    # allowlist + argument checks for every tool call
│       ├── ui.js           # chat formatting helpers
│       └── config.js       # non-secret runtime config (bridge URL, etc.)
├── bridge/                 # Node.js server: holds the Gemini API key
│   ├── server.js
│   ├── package.json
│   ├── .env.example
│   └── README.md
├── SETUP.md                # step-by-step: BDS, Termux, packaging, install
└── README.md                # this file
```

## How a request flows

1. Player types `!ai help me build a house`.
2. `main.js` intercepts the chat message (it never reaches normal chat).
3. `ai.js` sends the player's message plus a snapshot of their state
   (`tools.js -> get_player_state`) to the bridge.
4. `bridge/server.js` asks Gemini for a strict JSON reply: `{ message, actions }`.
5. Back in Minecraft, every requested action is checked by `validator.js`
   against an allowlist (block/item ids, coordinate ranges, string lengths)
   **before** `tools.js` is allowed to run it. Anything invalid is skipped
   and logged, not executed.
6. The AI's `message` is shown to the player either way.

## Quick start

See `SETUP.md` for full details. Short version:

1. Get a Bedrock Dedicated Server running (PC/cloud is the reliable path;
   Termux-on-Android is possible but finicky - both covered in `SETUP.md`).
2. Enable `@minecraft/server-net` for this pack in the server's
   `config/<pack_id>/permissions.json`.
3. Zip `behavior_pack/` into `gemini-mcpe.mcpack`, drop it in the server's
   `behavior_packs/` folder, and enable it in the world's `world_behavior_packs.json`.
4. `cd bridge && npm install && cp .env.example .env` (add your Gemini key) `&& npm start`.
5. Point the Android Minecraft app at the server (Servers tab -> add
   server -> the BDS's IP and port, or `127.0.0.1` if it's the same device).
6. In-game: `!ai-status` to confirm the bridge is reachable, then
   `!ai hello, what can you do?`

## Troubleshooting

- **"I can't reach the AI bridge"** - the bridge isn't running, or the
  BDS's `permissions.json` doesn't list `@minecraft/server-net`, or the
  bridge URL doesn't match (`/scriptevent gemini:config {"bridgeUrl":"..."}`).
- **"The bridge is missing its Gemini API key"** - fill in `bridge/.env`.
- **Nothing happens when a block/item action is requested** - check the
  bridge and Minecraft content log; the validator likely rejected an
  id that isn't on the allowlist in `validator.js` (extend it deliberately).
- **`/locate` didn't seem to do anything** - see the comment in
  `tools.js -> find_structure`: Script API can't read `/locate`'s printed
  coordinates back into script today, so results appear directly in the
  player's chat, not in the AI's data.
