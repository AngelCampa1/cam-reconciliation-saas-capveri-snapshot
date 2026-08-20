# Shared Audit Brief (read before auditing)

You are auditing the CapVeri React frontend (`frontend/src`) for bugs, missing features, and broken/incorrect frontend↔backend wiring. **Read-only audit — DO NOT change code.**

Context: CapVeri is a CRE FinOps SaaS that automates CAM (Common Area Maintenance) reconciliation for landlords. Frontend = React 19 + Vite + Shadcn/UI + TanStack Query + Zod. Backend = FastAPI under `backend/app/api/v1`. Frontend API layer: `frontend/src/api/` (`hooks.ts`, `client.ts`, `authFetch.ts`, `generated/`). DB = Supabase Postgres w/ RLS.

The app was built piecemeal by AI, component-at-a-time, without verifying flows work together. **Expect:** dead/no-op buttons, unwired forms (fields that don't submit or don't bind), API contract mismatches (frontend calls an endpoint/shape the backend doesn't provide), missing loading/error/empty states, broken navigation/links, pagination/sorting/filtering that doesn't work, polling that never resolves, calculations that don't display, and half-finished features.

Wiring rules to enforce:
- Import batches: `/api/v1/ingestion/batches` (NOT `/api/v1/import-batches`).
- Property imports: `/api/v1/properties/{property_id}/imports`.
- There is NO `/api/v1/properties/{id}/gl-entries` endpoint; GL data comes via `/api/v1/ingestion/batches/{batch_id}`.
- Money must be Decimal/string from backend — flag JS doing financial math that risks float precision loss.

Method: for EACH issue, verify by reading the actual code AND the backend route it should call (under `backend/app/api/v1/`, services under `backend/app/services/`) to confirm contract mismatches (request field names, response shape, method, path).

Severity scale:
- **P0** = broken flow / crash / data loss
- **P1** = feature non-functional or wrong wiring
- **P2** = UX gap / missing affordance / missing state handling
- **P3** = cosmetic

Output:
1. Write a detailed report to `docs/goal-frontend-audit/audit/<your-domain-file>.md` (use the Write tool). One section per finding: what's wrong, `file:line` evidence, expected behavior, severity, suggested fix.
2. RETURN a concise bulleted findings list — one line each: `severity + file:line + one-sentence summary`. Cap at ~40 findings, most severe first.

Only report real, evidenced issues. No vague "could be improved." Be concrete with file paths and line numbers.
