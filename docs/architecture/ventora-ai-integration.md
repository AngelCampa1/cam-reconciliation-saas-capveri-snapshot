# CapVeri ↔ Ventora AI-SDR / AI-CS Integration

How CapVeri wires the two shared Ventora AI agents into its surfaces, how the
secrets and signing work, how to deploy and re-provision, and how to verify the
whole thing is live. This is the source of truth for this repo's AI wiring.

> Status: **LIVE and verified end-to-end on 2026-06-21** — AI-SDR on
> `www.capveri.com/pricing` (launcher → panel → grounded reply) and AI-CS on
> `app.capveri.com` (authed landlord session → grounded reply). No 401/403/502.

## What these are

CapVeri does not host its own chat models. It consumes two shared, central
Cloudflare Workers owned by the `ventora-platform` monorepo:

| Agent | Purpose | Central worker | CapVeri surface |
|-------|---------|----------------|-----------------|
| **AI-SDR** | Anonymous marketing / sales assistant | `ventora-ai-sdr-worker.<account>.workers.dev` | Marketing site (`www.capveri.com`), high-intent pages only |
| **AI-CS** | Authenticated in-app customer support | `ventora-ai-cs-worker.<account>.workers.dev` | App shell (`app.capveri.com`), after login |

CapVeri's `productId` / `appId` in both systems is **`capveri`**.

## Architecture (both agents share this shape)

```
Browser widget ──┐
                 │ 1. POST /…/sign  (mint short-lived HMAC assertion)
                 ▼
        CapVeri BFF (capveri-api / capveri-marketing)
                 │
Browser widget ──┘ 2. POST /v1/sessions, /v1/chat  (carry the assertion)
                 ▼
          Central Ventora worker
                 │ 3. GET <CapVeri context endpoint>  (worker signs, CapVeri verifies + signs reply)
                 ▼
        CapVeri context endpoint (capveri-api)
```

There are **two independent HMAC secrets per agent**:

1. **client-assertion secret** — the CapVeri BFF signs the browser's `/v1/*`
   calls; the central worker validates them. This is how the worker trusts that a
   request really came from CapVeri.
2. **context secret** — the central worker signs its `GET` to CapVeri's context
   endpoint, and CapVeri signs its response back. This is how each side trusts
   the grounding-context exchange.

### The HMAC scheme (byte-exact)

Shared by every product and both workers. Implemented in
`cloudflare-backend/src/domain/ai-context/signing.ts`.

```
payload   = `${timestamp}.${nonce}.${METHOD_UPPER}.${path}.${sha256Hex(stableJson(body))}`
signature = HMAC-SHA256(secret, payload)  // lowercase hex
```

Headers: `X-Ventora-Timestamp` (ISO 8601), `X-Ventora-Nonce`,
`X-Ventora-Signature`. Clock skew window is 5 minutes; nonces are
replay-protected via the `AI_CONTEXT_NONCES` Durable Object.
`stableJson` = keys sorted recursively, `undefined` values dropped.

- **client-assertion** signs `path` = pathname only.
- **context** signs `path` = pathname **+ search** (query string).

### ⚠️ The context-body contract (the bug that bit us twice)

The context request body is signed as a **minimal identity object only**:

- AI-SDR: `{ productId }`
- AI-CS: `{ appId, userId }`

`currentPath` rides in the **URL query string** (covered by the signed path),
**never** in the signed body. Folding `currentPath` into the signed body makes
every real chat's context fetch fail signature verification → `401` → chat
`502`. See the explicit comments in `ai-sdr-routes.ts` and `ai-cs-routes.ts`.

## Endpoints in this repo

### AI-SDR (marketing)
- Context endpoint: `GET https://api.capveri.com/api/v1/ai-sdr/product-context`
  — served by `capveri-api`, route in `cloudflare-backend/src/http/ai-sdr-routes.ts`,
  `productId = "capveri"`, **HMAC-only, no user auth**.
- BFF signer: `POST /api/ai-sdr/sign` on the marketing worker
  (`capveri-marketing`). Mounts the worker-hosted widget via
  `marketing/src/components/ai-sdr/AiSdrSalesWidget.tsx`.
- The marketing worker also exposes its own `/api/ai-sdr/product-context` route,
  but the central worker is registered against the **`api.capveri.com` backend**
  endpoint above.

### AI-CS (in-app support)
- Context endpoint: `GET https://api.capveri.com/api/v1/ai-cs/app-context`
  — served by `capveri-api`, route in `cloudflare-backend/src/http/ai-cs-routes.ts`,
  `appId = "capveri"`. **Behind `authMiddleware`** (see the caveat below).
- BFF signer: `POST /api/v1/ai-cs/sign` on `capveri-api` (also auth-gated). Only
  these worker paths are signable: `/v1/sessions`, `/v1/chat`, `/v1/escalations`.
- Widget: `frontend/src/components/AiCsHelpWidget/AiCsHelpWidget.tsx`, mounted in
  `frontend/src/App.tsx` (renders only when the app shell is shown). Consumes
  `@ventora/ai-cs` (currently `^1.0.3` — verified compatible with the central
  worker on 2026-06-21).

> **Auth-gate caveat for AI-CS context.** Unlike the canonical HMAC-only context
> pattern, CapVeri's `/api/v1/ai-cs/app-context` sits behind `authMiddleware`
> (the central worker forwards the user's bearer). So the drift doctor's
> *unauthenticated* signed probe gets a `401` from auth **before** the signature
> is checked, and the doctor reports a **false GREEN**. The only true test of the
> AI-CS context secret is an authed E2E (browser login on `app.capveri.com`) or a
> signed probe carrying a real CapVeri user JWT.

## Secrets

Live values are Cloudflare Worker secrets (write-only). The durable restore
record is the **gitignored** `.ai-secrets.local` at the repo root — never commit
it. Canonical values are shared fleet-wide and also live in the operator's
provisioning vault.

| Secret | Where it lives | Notes |
|--------|----------------|-------|
| `AI_SDR_CLIENT_ASSERTION_SECRET` | `capveri-api` (and marketing BFF) | |
| `AI_SDR_PRODUCT_CONTEXT_SECRET` | `capveri-api` | CapVeri's context var name (falls back to `AI_SDR_CONTEXT_SECRET`) |
| `AI_SDR_CONTEXT_SECRET` | `capveri-api` | Set to the same value as the line above |
| `AI_CS_CLIENT_ASSERTION_SECRET` | `capveri-api` | |
| `AI_CS_CONTEXT_SECRET` | `capveri-api` | |
| `OPENROUTER_API_KEY` | central workers only | Reference copy in `.ai-secrets.local`; not consumed by `capveri-api` |

The frontend AI-CS widget also needs `VITE_AI_CS_BASE_URL` baked in at build
time. It is set in `frontend/wrangler.jsonc` (`vars`) and bridged into the Vite
build by `frontend/scripts/cloudflare-env-runner.mjs`, so a `deploy:cf` build
inlines it. The app CSP (`frontend/src/worker.ts`) already allows the AI-CS
worker origin in `connect-src`.

## Deploy

```bash
# Backend (capveri-api) — note the named production env
cd cloudflare-backend && npx wrangler deploy --env production

# Marketing (capveri-marketing) — hosts the AI-SDR widget + its sign BFF
cd marketing && npm run deploy:cf

# Frontend app (capveri-app) — hosts the AI-CS widget
cd frontend && npm run deploy:cf
```

### Re-provision a drifted/unset secret

`capveri-api` uses a **named production environment**, so secrets MUST be set
with `--env production`:

```bash
cd cloudflare-backend
printf '%s' "<value>" | npx wrangler secret put AI_CS_CONTEXT_SECRET --env production
# repeat for each NAME; restore values from .ai-secrets.local
```

Registration in the central workers (the `AI_SDR_CONTEXT_ENDPOINTS` /
`AI_CS_CONTEXT_ENDPOINTS` maps and the origin allow-lists) is owned by
`ventora-platform`; CapVeri's entries point at the `api.capveri.com` endpoints
above and are already live.

## Marketing widget gotcha: Subresource Integrity (SRI)

`AiSdrSalesWidget.tsx` pins the worker client script with an `integrity` hash
(`CLIENT_INTEGRITY`) — CapVeri is the only fleet product that does this. The
worker serves the **same client bytes under every `/client/<version>/` path**
(versioning is nominal — one embedded build, not a frozen per-version asset).
So the pinned hash tracks the worker's **current** client build, not a version
string. **If the central worker's bundled client is rebuilt, the hash changes
and the browser will silently refuse to run the script** (the load error is
caught and swallowed, so the widget just never appears).

Recompute and bump `CLIENT_INTEGRITY` whenever the worker client changes:

```bash
curl -s "https://ventora-ai-sdr-worker.<account>.workers.dev/client/v0.3.7/ai-sdr.global.js" \
  | openssl dgst -sha384 -binary | openssl base64 -A
# prefix the result with "sha384-"
```

## Verify it's live

Fleet drift check (from `ventora-platform`): `pnpm ai-secrets:doctor`
(remember the AI-CS false-GREEN caveat above).

True end-to-end checks:

- **AI-SDR**: open `https://www.capveri.com/pricing` (a high-intent page — the
  widget does NOT mount on the homepage). The "Need help?" launcher should
  appear; opening it and asking a question should produce
  `POST /api/ai-sdr/sign` (200) → `POST /v1/sessions` (201) →
  `POST /v1/chat` (200, SSE) → a grounded reply, with no SRI/console errors.
- **AI-CS**: log in to `https://app.capveri.com` (landlord account; creds in
  `.ai-secrets.local`). The "Questions?" launcher should appear in the app
  shell; asking a question should produce `POST /api/v1/ai-cs/sign` (200) →
  `POST /v1/sessions` (201) → `POST /v1/chat` (200, SSE) → a grounded reply,
  with no 401/403/502.

High-intent AI-SDR page prefixes: `/pricing`, `/sample-report`, `/contact`,
`/roi`, `/product-tour`, `/tools` (see `HIGH_INTENT_PREFIXES` in
`AiSdrSalesWidget.tsx`).
