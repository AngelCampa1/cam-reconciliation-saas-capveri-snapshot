# Cloudflare Runtime Feasibility

## Heavy Dependency Inventory

| Current dependency | Current use | Worker-compatible replacement or design | Proof required |
|---|---|---|---|
| pandas | CSV, Excel, rent roll, GL, and billing import parsing. Current ingestion services use DataFrames and Series for column normalization, date parsing, currency cleanup, and parser output. | Replace with streaming CSV parsing, focused XLSX parsing, typed row normalizers, and R2-backed chunked workflows. Keep parser contracts explicit instead of recreating a generic DataFrame layer. | Representative import fixtures pass under Worker CPU and memory limits; golden row-level parity against current parser output. |
| numpy | Ingestion cleaners and analysis helpers use numeric coercion, null handling, and vectorized operations. | Port only required numeric behavior with explicit TypeScript functions and decimal/integer money handling. Avoid broad numerical dependency replacement until a route proves it needs it. | Golden output parity for cleaners and analysis fixtures, including blank, null, negative, currency, and date edge cases. |
| statsmodels | Not present in `backend/pyproject.toml` today, but anomaly/trend analysis may depend on statistical routines later. | Keep advisory analytics separate from critical reconciliation math. If needed, port only the exact formulas or run batch analysis through Workflows with measured CPU. | Golden analysis outputs and p95 CPU measurements for typical and large properties. |
| reportlab | Not present in `backend/pyproject.toml` today, but export/report code produces PDF-style artifacts and lead magnets are stored as PDFs. | Prefer HTML-to-PDF only if a Worker-compatible library proves small and fast. Otherwise generate export packets asynchronously with R2-staged artifacts and keep PDFs outside request/response paths. | Representative PDF export packet completes inside configured CPU budget or is chunked through Workflow steps with R2 checkpoints. |
| openpyxl | Excel import/export support through current Python dependencies and rent roll/GL workflows. | Use a Worker-compatible XLSX parser with bounded sheet/range reads. For large files, upload to R2 first and process in chunks through Queues/Workflows. | Small, typical, and largest expected XLSX fixtures parse with bounded memory and row parity. |
| boto3/botocore | S3-compatible access for Cloudflare R2 document storage from the Python backend. | Use native R2 Worker bindings, not S3-compatible credentials, for Worker runtime storage. | Storage adapter tests prove scoped object keys, metadata writes, signed upload/download behavior, and tenant authorization. |
| celery/redis | Background extraction queue, retry behavior, task timeouts, and worker process separation. | Replace with Cloudflare Queues for dispatch and Workflows for long-running orchestration. Use Durable Objects only for coordination, rate limits, locks, or idempotency state that needs a single authority. | Queue and Workflow integration tests cover enqueue, success, retry, idempotency, poison/dead-letter handling, and no duplicate financial side effects. |
| Python Decimal | Financial calculations depend on exact decimal rounding, caps, pro-rata shares, gross-up, and calculation traces. | Use a decimal library or integer minor units with explicit rounding mode. Do not use JavaScript `number` for money or percentages that affect money. | Golden reconciliation and calculation-trace parity for current backend fixtures, including negative credits and cap edge cases. |
| Native PDF lease extraction flow | Extraction services send PDF bytes through OpenRouter dual-extract, judge, validation, gap-filler, and validation reprompt steps. | Keep PDFs in R2, stream or range-read when possible, and pass bounded payloads to OpenRouter. Use Workflows for orchestration and checkpoint model responses/results. | Small, typical, and largest allowed lease PDFs complete with matching state transitions, retry behavior, and human-review outputs. |

## Representative Workloads

- Small lease PDF, typical lease PDF, largest allowed lease PDF.
- Small GL CSV, typical GL CSV, largest expected GL CSV.
- Small XLSX rent roll, typical XLSX rent roll, largest expected XLSX rent roll.
- Typical reconciliation property/year.
- Large reconciliation property/year.
- PDF export packet.
- ZIP export packet.

## Feasibility Gates

- No route that performs user-visible API work may depend on a full-file in-memory parse unless the accepted file-size limit is documented and enforced before upload.
- Large imports, extraction, reconciliation, and export generation must checkpoint through R2, Queues, or Workflows rather than holding long-lived state in a Worker request.
- Any Python dependency replacement must have a named TypeScript adapter, fixture coverage, and golden parity where behavior affects money, auth, storage access, or customer-visible exports.
- Worker request handlers should stay small: parse/validate input, authorize, enqueue or dispatch, and return a durable job reference for long work.
- The migration cannot cut over a route until its representative fixture has measured Worker CPU, wall-clock behavior, memory behavior by proxy, queue operations, Workflow instances, and R2 operations.

## Source Evidence

- `backend/pyproject.toml` currently includes `pandas`, `boto3`, `openpyxl`, `numpy`, `celery[redis]`, and `redis`.
- `backend/app/services/ingestion/` uses pandas-style parser and cleaner flows.
- `backend/app/services/extraction/` contains the OpenRouter lease extraction pipeline.
- `backend/app/services/calculation/` uses Python `Decimal` for financial math.
- Official Cloudflare docs checked on 2026-06-12: Workers pricing and limits, Hyperdrive pricing, Queues pricing, R2 pricing, and Workflows pricing.
