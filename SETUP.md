# Setup Guide

## 0. Why you need a Bedrock Dedicated Server (BDS)

Read the "Read this first" section of `README.md` if you haven't -
`@minecraft/server-net` (HTTP requests) only works inside a Bedrock
Dedicated Server, not the plain Android app playing a local world. You
have two realistic options for where that server actually runs:

| Option | Reliability | Effort |
|---|---|---|
| **A. BDS on a PC or cheap cloud VM**, phone joins over LAN/internet | High | Low |
| **B. BDS on the same Android phone via Termux** (emulated, since official BDS binaries are x86_64/ARM64 Linux or Windows) | Lower - performance/compatibility vary by device and BDS version | Higher |

If you just want this working reliably, do **Option A** first (even a
spare laptop works) and treat Termux as a later "fully on one device"
upgrade.

## 1. Get Bedrock Dedicated Server

Download the current BDS build for your platform from Mojang's official
page (search "Minecraft Bedrock Dedicated Server download" - the exact
URL changes with every version, so don't hardcode it). Extract it
somewhere, e.g. `bds/`.

### Option B: BDS via Termux on Android

Official BDS builds aren't published for Android/ARM. In Termux you'd
typically use `proot-distro` to install a Linux userland and either:
- run a community ARM64 build of BDS if one exists for your target
  version, or
- run the official x86_64 build under an emulation layer (e.g. `box64`).

Both routes are real but fragile - expect slower world ticking and to
troubleshoot missing shared libraries. Search current Termux + "Bedrock
Dedicated Server" guides for the steps that match today's BDS version,
since this shifts often. If it's too painful, fall back to Option A.

## 2. Enable `@minecraft/server-net` for this pack

BDS disables `@minecraft/server-net` by default. In your BDS install,
edit (create if missing) `config/default/permissions.json`:

```json
{
  "allowed_modules": [
    "@minecraft/server",
    "@minecraft/server-ui",
    "@minecraft/server-net"
  ]
}
```

Restart the server after saving this file.

## 3. Package the behavior pack

From the repo root:

```bash
cd behavior_pack
zip -r ../gemini-mcpe.mcpack . -x ".*"
cd ..
```

This produces `gemini-mcpe.mcpack` (a `.mcpack` is just a zip of the pack
folder's contents at the zip root, not the folder itself).

Copy it into your BDS install:

```bash
cp gemini-mcpe.mcpack /path/to/bds/behavior_packs/gemini-mcpe/
# (unzip it there, or use Minecraft's own "double-click to import"
#  behavior on a desktop client, then copy the resulting folder to BDS)
```

Then enable it for your world. In `worlds/<your world>/world_behavior_packs.json`:

```json
[
  {
    "pack_id": "7fb093c1-cbfb-4b75-8b59-cce3e1ccc22b",
    "version": [1, 0, 0]
  }
]
```

(The UUID must match `header.uuid` in `behavior_pack/manifest.json`.)

## 4. Run the bridge

```bash
cd bridge
npm install
cp .env.example .env
# edit .env: paste your Gemini API key from https://aistudio.google.com/apikey
npm start
```

Leave this running. It can live on the same machine as BDS, or anywhere
reachable from it (adjust `config.js`'s default bridge URL, or set it
live in-game - see below).

## 5. Point the Android app at your server

In Minecraft on Android: **Play -> Servers -> Add Server**, enter the
BDS's IP address and port (default `19132`). If BDS and the bridge are
both on the same phone via Termux, the Minecraft app can usually reach
`127.0.0.1`; if BDS is on a PC/cloud VM, use that machine's LAN or public
IP.

If the bridge isn't running on the same machine as BDS, tell the addon
where it is (as an operator, in-game chat):

```
/scriptevent gemini:config {"bridgeUrl":"http://192.168.1.20:3000"}
```

## 6. Minimal first test

1. Join the world.
2. Type `!ai-status`. You should see a yellow `[gemini-mcpe] Bridge OK at ...` message.
   - If you see red text instead, work through the Troubleshooting
     section in `README.md` before continuing.
3. Type `!ai hello, what can you do?` and confirm you get a blue
   `[Gemini]` reply.
4. Try something that should trigger a tool, e.g. `!ai what mobs are near me?`
   and confirm the reply reflects real nearby entities (or honestly says
   there are none), not invented ones.

Once that works, extend `validator.js`'s allowlists deliberately as you
want the AI to be able to place/give more things.

## Packaging both packs as a single `.mcaddon` (optional)

If you later add a resource pack alongside this behavior pack, a
`.mcaddon` is just a zip containing both pack folders (not their
contents unpacked at the zip root, unlike `.mcpack`):

```bash
mkdir -p dist/gemini-mcpe-addon
cp -r behavior_pack dist/gemini-mcpe-addon/
# cp -r resource_pack dist/gemini-mcpe-addon/   # if you add one later
cd dist/gemini-mcpe-addon
zip -r ../gemini-mcpe.mcaddon .
```
