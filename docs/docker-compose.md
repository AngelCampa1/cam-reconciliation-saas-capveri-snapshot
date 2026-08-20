# Docker Compose — Local Development

> **Status note:** the `docker-compose.yml` (and `backend/Dockerfile.dev`)
> described below are **not yet present in this repo**. This document is ported
> from a sibling repo as the intended design for a containerized local backend.
> Until those files are committed, run the backend, Celery worker, and Redis with
> your existing local tooling (Python venv + a local/Docker Redis).

Docker Compose is the recommended way to run **backend** services locally once it
is added. It gives a single consistent runtime that eliminates Redis auth
conflicts and Windows/WSL process boundary issues.

## What runs where

| Component | How it runs |
|-----------|-------------|
| Redis | Docker Compose (`redis:7-alpine`) |
| Backend API | Docker Compose (hot-reload via `--reload`) |
| Celery Worker | Docker Compose |
| Celery Beat | Docker Compose |
| Frontend app (`frontend/`, Vite) | Native `npm run dev` (Docker hot-reload is too slow on Windows) |
| Marketing site (`marketing/`, Next.js) | Native `npm run dev` |
| Supabase | Supabase CLI — already containerized, leave it alone |

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- Supabase CLI installed (`npm install -g supabase`)
- A backend `.env` present (copy `backend/.env.example` and fill in keys)

## Start/Stop

```bash
# 1. Start Supabase (if not already running)
supabase start

# 2. Start all backend services (foreground — see all logs)
docker compose up

# Or detached (background)
docker compose up -d

# Stop everything
docker compose down

# Stop and wipe Redis data
docker compose down -v
```

## Frontend / marketing (separate terminals)

```bash
cd frontend && npm run dev    # React + Vite app
cd marketing && npm run dev   # Next.js marketing site
```

The frontend app hits the backend on `http://localhost:8000` via the backend port mapping — no changes needed.

## Viewing Logs

```bash
docker compose logs -f              # all services
docker compose logs -f backend      # backend only
docker compose logs -f worker       # celery worker
docker compose logs -f beat         # celery beat
```

## Hot Reload

`backend/app/` is bind-mounted into the backend, worker, and beat containers. Uvicorn watches `/app/app` and reloads within ~2 seconds when any `.py` file changes.

Worker and beat do **not** auto-reload — Celery has no built-in reload mechanism, so a restart is the only option after task code changes:

```bash
docker compose restart worker
docker compose restart beat
```

## Running Tests and Linting Inside Containers

```bash
# Run full test suite
docker compose exec backend pytest tests/ -x

# Run a single test file
docker compose exec backend pytest tests/services/test_extraction.py

# Lint
docker compose exec backend ruff check app/

# Type check
docker compose exec backend mypy app/
```

## Rebuilding After Dependency Changes

When you add or remove packages in `pyproject.toml`:

```bash
docker compose build
docker compose up
```

## Env Var Strategy

```
backend/.env  (loaded via env_file:)  →  all API keys, Supabase keys, etc.
docker-compose environment:           →  overrides REDIS_URL, SUPABASE_URL only
```

Docker Compose injects a `REDIS_URL` pointing at the `redis` service and a
`SUPABASE_URL` pointing at the host Supabase stack (e.g.
`http://host.docker.internal:54321`) so the containers reach the right hosts.
Everything else comes from `.env` unchanged. Confirm the exact Supabase port
against this repo's `supabase/config.toml` (API is `54321`).

## Known Limitations

**Containers run as root.** `Dockerfile.dev` does not create a non-root user. This avoids Windows bind-mount ownership issues (files written by the container appear as the host user) but means uvicorn, the Celery worker, and Celery beat all run as root inside their containers. This is acceptable for local development only — a production `Dockerfile` should use a dedicated `app` user. On Linux hosts, bind-mounted files written by the container will be owned by root; `sudo chown -R $USER backend/` corrects this if needed.

## Comparison with a native supervisor

| | Docker Compose | Native (`scripts/stack.py`, also not yet present) |
|---|---|---|
| Redis | Container (no auth conflicts) | Host or separate Docker container |
| Celery Beat | Included | Not included |
| Process isolation | Full container isolation | Windows/WSL native processes |
| Hot reload | Yes (uvicorn `--reload`) | Yes |
| Setup | Docker Desktop required | Python only |
| Recommendation | **Preferred** | Fallback for Docker-free environments |
