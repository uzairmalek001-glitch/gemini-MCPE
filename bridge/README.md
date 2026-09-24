# gemini-mcpe bridge

A tiny local Express server that sits between your Minecraft Bedrock world
and the Gemini API. It's the only place your Gemini API key ever lives.

## Setup

```bash
cd bridge
npm install
cp .env.example .env
# edit .env and paste your Gemini API key
npm start
```

You should see:

```
[bridge] gemini-mcpe bridge listening on http://localhost:3000
[bridge] model: gemini-2.0-flash | API key configured: true
```

Check it's alive:

```bash
curl http://localhost:3000/health
```

## Endpoints

- `GET /health` - returns `{ ok, model, hasApiKey }`. Used by the addon's `!ai-status` command.
- `POST /ask` - body `{ "query": "...", "playerState": { ... } }`, returns `{ "message": "...", "actions": [...] }`.

## Notes

- Requires Node.js 18+ (uses the built-in `fetch`).
- `GEMINI_MODEL` in `.env` may go stale as Google renames/retires models -
  check https://ai.google.dev/gemini-api/docs/models if you get model-not-found errors.
- `ALLOWED_PLAYERS` lets you restrict who can use the assistant on a shared server.
- This server has no auth of its own beyond `ALLOWED_PLAYERS` - only expose
  it on localhost or a trusted LAN, never on the open internet as-is.
