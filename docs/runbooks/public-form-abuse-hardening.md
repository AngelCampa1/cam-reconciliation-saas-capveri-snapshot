# Public Form Abuse Hardening (CapVeri)

Last updated: 2026-05-20

## Purpose

Records how the unauthenticated public marketing forms in CapVeri were
hardened against being abused as an **email-bombing relay** or spam amplifier.
Every public form that triggers an email send (or any other side effect) is the
attack surface: a script can submit other people's real addresses and make our
backend mail them content they never requested, damaging sender reputation
(Resend) and risking transactional-email blocklisting.

The defense follows a five-layer playbook. This document is the
CapVeri-specific reference implementation; read it alongside the actual
endpoint code in `backend/app/api/v1/`.

---

## The five layers (and where each lives here)

### 1. Gate every side effect on a real "is-new" signal

Idempotent / dedupe-aware writes sit in front of the send so a repeat capture is
a no-op, not a re-send. A duplicate submission returns a success-shaped response
and performs no additional send.

### 2. Honeypot field (cheap, catches dumb bots)

A hidden `company_website` text input is present on every public form: off-screen,
`tabIndex={-1}`, `autoComplete="off"`, `aria-hidden="true"`. Real users never
see or fill it. The shared frontend component is
`marketing/src/components/HoneypotField.tsx` (it renders the `company_website`
input). Server-side, a non-empty `company_website` returns a **success-shaped**
response and does nothing — no error, no different status, no timing tell. The
check runs after body parse, before any DB write or send. Each request schema
declares `company_website: str | None = Field(default=None, max_length=200)`.

### 3. CAPTCHA — Cloudflare Turnstile (the strong control)

- **Backend verifier:** `backend/app/services/turnstile.py` — `verify_turnstile()`.
  Fails closed: network error, parse error, non-200, or `success != true` all
  return `False`. **Bypasses** (returns `True`) only when
  `TURNSTILE_SECRET_KEY` is unset; in production that bypass instead **rejects**
  all submissions and logs a loud one-time warning, so a misconfiguration cannot
  silently degrade us back to the vulnerable posture. Hostname is validated
  against `turnstile_allowed_hostnames`.
- **Frontend widget:** `marketing/src/components/TurnstileWidget.tsx` —
  `<TurnstileWidget>` (forwardRef, exposes `reset()`). When
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is unset it renders nothing and emits an empty
  token, so existing traffic and tests keep working until the keys are
  provisioned.
- On verification failure the endpoint rejects with **403 before any DB write or
  send**; the form calls the widget's `reset()` so the user can re-attempt.

### 4. Per-form (email) throttle (defeats IP rotation)

Each public endpoint enforces its own email-keyed throttle (typically **3
submissions per 24 hours**, keyed on the normalized email), raising **429** with
a clear message. Examples in the current code:

- `contact_requests.py` — in-memory `_check_rate_limit(email)`, 3 / 24h.
- `feedback.py` — moving-window limiter, 3 / hour (uses
  `build_ip_rate_limit_key` + `moving_window` from
  `backend/app/core/rate_limiting.py`).
- `leads.py` — `check_download_rate_limit(email, asset_slug, db)`, 3 / 24h.
- `audit_requests.py` — `check_rate_limit(email, db)`, 3 / 24h.

Because each endpoint scopes its own limiter, a legitimate user touching several
forms is not penalized across them. The throttle is applied after the email is
parsed, before the write.

> **Note:** there is no single shared per-identity throttle module today — each
> endpoint owns its limiter. If/when the number of public forms grows, consider
> consolidating into one `enforce_email_rate_limit(email, scope)` helper.

### 5. Trust forwarded client-IP headers only behind a real proxy

`get_client_ip(request)` in `backend/app/services/turnstile.py` resolves the
client IP from the incoming request. Only trust forwarded headers
(`cf-connecting-ip`, leftmost `x-forwarded-for`) when the backend actually sits
behind a trusted proxy; otherwise those headers are spoofable. CapVeri deploys
the marketing site on **Vercel** and the API behind its own ingress — confirm
which forwarded header your ingress sets before relying on it for rate-limit
keying.

---

## Handler order (every hardened endpoint)

```
parse body
  → honeypot (company_website) non-empty? → success-shaped no-op
  → verify_turnstile()                     → 403 on failure (before any write/send)
  → per-email throttle                     → 429 on failure
  → side effects (write + email)
```

---

## Endpoint coverage

| Endpoint | Honeypot | CAPTCHA | Per-email throttle | Notes |
| -------- | -------- | ------- | ------------------ | ----- |
| `POST /api/v1/contact-requests` | yes | yes | 3 / 24h (in-memory) | |
| `POST /api/v1/feedback` | yes | yes | 3 / hour (moving window) | throttle only when email present |
| `POST /api/v1/leads/...` (lead-magnet download) | yes | yes | 3 / 24h | keyed on email + asset slug |
| `POST /api/v1/audit-requests` | yes | yes | 3 / 24h | in-app post-scan funnel |

> Confirm exact route prefixes against `backend/app/api/v1/__init__.py` and each
> module's router — this table reflects the modules present at the time of
> writing.

---

## Frontend forms wired to the widget

Marketing forms live in `marketing/src/components/` (and its `lead-capture/`
subfolder). Each stores the Turnstile token in form state, sends it as
`turnstile_token` (plus the `company_website` honeypot) in the request body, and
calls the widget's `reset()` on a failed submit. Current forms include:

- `marketing/src/components/ContactForm.tsx`
- `marketing/src/components/lead-capture/LeadCaptureForm.tsx`
- `marketing/src/components/lead-capture/LeadMagnetExitIntentPopup.tsx`
- `marketing/src/components/lead-capture/CalculatorUnlockGate.tsx`

Shared primitives:

- `marketing/src/components/HoneypotField.tsx` — the `company_website` input.
- `marketing/src/components/TurnstileWidget.tsx` — the Turnstile widget.

---

## Secret provisioning (out-of-band, never committed)

The hardening ships **inert** until the keys are set; bypass-when-unset keeps
dev working unchanged, while production rejects-when-unset so it can never run
unprotected.

- **Backend secret:** set `TURNSTILE_SECRET_KEY` to the Turnstile secret key in
  the backend's environment.
- **Frontend public site key (Vercel):** set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` in
  the marketing project's Vercel environment variables (and any local build
  env). It is public and baked into the HTML at build time.
- Optionally set `TURNSTILE_ALLOWED_HOSTNAMES` to constrain which hostnames a
  token may be issued for (defaults include `capveri.com`, `www.capveri.com`,
  `app.capveri.com`, `localhost`, `127.0.0.1`).
- Use the **free** Turnstile tier (managed widget).

Set the secret and site key together so forms do not start requiring a token the
widget cannot produce.

---

## Verification checklist (run after the keys are provisioned)

1. Submit a form in a real browser → challenge solves → exactly one email.
2. `curl` with no `turnstile_token` → 403, no email.
3. `curl` with `company_website` populated → success-shaped response, no email.
4. Hammer one email past the form's limit → 429.
5. Confirm the prod reject-and-warn behavior fires if `TURNSTILE_SECRET_KEY` is
   somehow unset in production.
