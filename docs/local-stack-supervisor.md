> **Status note:** the `scripts/stack.py` supervisor described below is **not yet
> present in this repo**. This document is ported from a sibling repo as a
> reference design for a single local-services entrypoint. Treat the commands as
> the intended interface, not as something you can run today.

> **Recommended alternative:** For a more robust local setup, use Docker Compose
> instead. See [docs/docker-compose.md](docker-compose.md) for setup instructions.
> Docker Compose eliminates Redis auth conflicts, adds Celery Beat, and provides
> full process isolation without Windows/WSL boundary issues. (That tooling is
> also not yet committed here — see its own status note.)

---

# Local Stack Supervisor

Use the stack supervisor as the single entrypoint for local services.

## Why

This avoids:
- mixed runtime drift (Windows vs WSL process mix)
- duplicate backend/worker processes on the same ports
- silent startup failures that leave E2E flows stuck polling

## Commands

Run from repo root:

```bash
python scripts/stack.py up
python scripts/stack.py status
python scripts/stack.py logs backend --lines 120
python scripts/stack.py logs worker --lines 120
python scripts/stack.py down
```

## Behavior

- Tracks managed services in `.stack/state.json`
- Writes service logs under `.stack/logs/`
- Refuses to start if required ports are owned by unknown processes
- Enforces a single runtime boundary while stack is active
- Starts Redis via Docker when Redis is not already available on `127.0.0.1:6379`

## Scope in this repo

CapVeri is a multi-workspace repo: a Python/FastAPI `backend/`, a React+Vite
`frontend/` app, and a Next.js `marketing/` site. A supervisor here would
primarily manage the **backend** services (API, Celery worker, Redis). The
`frontend/` (Vite dev server) and `marketing/` (Next.js dev server) are normally
run on their own with `npm run dev` in each workspace, and Supabase is managed by
the Supabase CLI. Adapt any single-process assumptions from the sibling repo
accordingly — there is no single combined dev server here.

## E2E Integration (intended)

- An E2E service-setup script can delegate startup to `scripts/stack.py up`.
- An E2E teardown can delegate shutdown to `scripts/stack.py down` when an
  `E2E_STOP_SERVICES=true` flag is set.

This gives one consistent startup/shutdown path for manual and automated E2E runs.
