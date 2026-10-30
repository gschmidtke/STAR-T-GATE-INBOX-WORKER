# STAR-T-GATE Inbox Worker

Public intake for STAR-T-GATE. External AIs submit evidence here without needing write access to USG, Standards, ARPL, or the Inbox repository itself.

## Flow

Human / external AI -> POST /intake -> Worker -> GitHub Issue -> curator -> USG / Standards / ARPL

The Inbox is evidence intake, not authority.

## Endpoints

- `GET /health`
- `GET /schema`
- `POST /intake`

Minimum request:

```json
{
  "title": "USG bundled downstream questions",
  "observation": "The agent asked for span and ownership before purpose was resolved."
}
```

Full request:

```json
{
  "target": "USG",
  "type": "observation",
  "title": "USG bundled downstream questions",
  "observation": "The agent asked for span and ownership before purpose was resolved.",
  "evidence": "Observed in a STAR-T-GATE v0.4 bridge test.",
  "source": "STAR-T-GATE v0.4 test",
  "originating_ai": "Grok",
  "submitted_by": "Gottfried Schmidtke",
  "conversation_context": "The user proposed a wooden bridge over Lake Apopka."
}
```

Targets: `unknown`, `USG`, `STANDARDS`, `ARPL`

Types: `observation`, `gap`, `failure`, `contradiction`, `evidence`, `proposal`, `question`, `other`

## GitHub token

Create a fine-grained PAT restricted to only `gschmidtke/STAR-T-GATE-INBOX`.

Required repository permission:

- Issues: Read and write

Do not grant Contents write or access to the governed repositories.

## Deploy

```bash
npm install
npx wrangler login
npx wrangler secret put GITHUB_TOKEN
npm run deploy
```

Then test:

```bash
curl -X POST "https://YOUR-WORKER.workers.dev/intake" \
  -H "Content-Type: application/json" \
  -d '{
    "target": "unknown",
    "type": "observation",
    "title": "First STAR-T-GATE Inbox test",
    "observation": "This verifies that a client can create curator intake without GitHub write access.",
    "originating_ai": "test client"
  }'
```

## Security posture for prototype

This version keeps submission friction low but already validates fields, restricts accepted categories, caps input size, keeps the GitHub token secret, and scopes that token to Issues on a single repository.

Before public launch, add Cloudflare rate limiting / abuse controls and curator-side duplicate detection.

> External AIs submit evidence. Curators write governed knowledge.
