# Third-Party Dependency Map

> Last verified from local checkouts on 2026-06-25.

This document maps CapVeri's cross-repo and external GTM dependencies so product,
marketing, and agent work can make architecture decisions without guessing which
system owns a workflow.

## Scope

This map covers the sibling systems named in the dependency audit request:

| System | Local checkout | Confirmed role | CapVeri dependency type |
| --- | --- | --- | --- |
| Postiz operations | `postiz-posting` | Central operations workspace for Postiz queue audits, repair manifests, scheduling experiments, and durable social-posting notes. Evidence is strongest for LinkedIn; current local scripts also support X and Threads. YouTube is not confirmed as a Postiz execution surface in the inspected instructions. | Operational dependency for scheduled social publishing, not a runtime product dependency. |
| Sequencer | `sequencer` | Centralized email sequence management hub for live Ventora products, including CapVeri and CAMAudit. Handles contacts, enrollments, events, unsubscribe, lead magnets, transactional messages, Resend sends, and Instantly stats sync. | Runtime/backend dependency for lead capture, signup, transactional result emails, nurture enrollment, and suppression forwarding. |
| Ventora Ads | `ventora-ads` | Bing Ads and landing-page experiment command center for `grantpipe.com` and `camaudit.io`. It owns ad/landing-page specs, ICP profiles, experiments, tracking notes, and knowledge logs for those campaigns. Landing pages live in product repos. | Planning and source-of-truth dependency for CAMAudit.io paid acquisition decisions. Do not treat it as CapVeri.com paid-acquisition ownership without fresh evidence. |
| Ventora CRM | `ventora-crm` | Internal customer hub, Wall of Fame, feedback kanban, review import, and embeddable widget API. | Runtime/frontend dependency for the authenticated feedback widget and future testimonial/customer surfaces. |
| Ventora Email Marketing | `ventora-email-marketing` | Command center for outbound Instantly campaigns across CapVeri, CAMAudit.io, and GrantPipe. Product repos remain canonical for product claims and offers; Instantly is canonical for live send/performance state. | Operational dependency for outbound email strategy, generated Instantly packages, canaries, launch blockers, and campaign results. |
| Ventora Platform | `ventora-platform` | Polyglot monorepo for shared Ventora packages and deployable workers, including AI-SDR, AI-CS, email renderer, private package registries, analytics, storage, auth, billing, and third-grade-copy skill packaging. | Runtime and package dependency for AI-SDR, AI-CS, private packages, shared contracts, and registry consumption. |

The original request listed `ventora-email-marketing` twice, once for
outbound email and once for shared libraries/widgets like AI-SDR and AI-CS.
Current repo evidence places AI-SDR, AI-CS, shared packages, and registries in
`ventora-platform`, not `ventora-email-marketing`.

## Dependency Graph

```text
CapVeri marketing (www.capveri.com)
  -> Ventora Platform AI-SDR worker
  -> Postiz operations for LinkedIn schedule artifacts

CapVeri app frontend (app.capveri.com)
  -> Ventora Platform AI-CS worker
  -> Ventora CRM widget loader

CapVeri API (api.capveri.com)
  -> Sequencer product API
  -> Ventora Platform AI context contracts and central workers
  -> Supabase, Stripe, Resend, PostHog, Sentry, OpenRouter

Outbound GTM operations
  -> Ventora Email Marketing
  -> Instantly live campaigns and analytics
  -> Product repos for claims, offers, lead magnets, and audience boundaries

Paid acquisition operations for CAMAudit.io / camaudit-v2
  -> Ventora Ads
  -> Microsoft Advertising / Bing Ads
  -> camaudit-v2 for landing-page implementation
```

## Runtime Dependencies

### Sequencer

CapVeri calls Sequencer from the Cloudflare backend for these flows:

| CapVeri surface | Current evidence | Sequencer endpoint family | Failure posture |
| --- | --- | --- | --- |
| Gated content downloads and public lead capture | `cloudflare-backend/src/http/leads-routes.ts` | Contacts, enrollments, events, unsubscribe | Best-effort side effect; CapVeri should not block the user response on slow email/nurture operations. |
| PLG signup lifecycle | `cloudflare-backend/src/http/auth-lifecycle-routes.ts` | Contacts and enrollments | Best-effort side effect after account mutation. |
| Finalized reconciliation result email | `cloudflare-backend/src/http/reconciliation-routes.ts` | Transactional email | Business-facing notification; failures must be logged and observable. |

Required CapVeri environment variables:

```text
SEQUENCER_BASE_URL
SEQUENCER_CF_ACCESS_CLIENT_ID
SEQUENCER_CF_ACCESS_CLIENT_SECRET
```

Architecture invariants:

- Product API calls use Cloudflare Access service-token headers.
- Sequencer maps verified Access client ids to product rows in `seq_api_tokens`.
- Cross-product calls are intentionally rejected.
- The CapVeri/CAMAudit firewall is enforced in Sequencer enrollment paths and must not be bypassed.
- Sequence definitions live in `sequencer/sequences/<product>/*.yaml`; the Worker reads synced definitions from D1, not directly from YAML.

Before changing a CapVeri flow that calls Sequencer:

1. Confirm the product slug, product id, and target sequence slug in `sequencer/docs/product-client-integration.md`.
2. Update CapVeri tests with a fake Sequencer client at the internal boundary.
3. If a sequence slug changes, update the Sequencer YAML and compile/sync path in the Sequencer repo.
4. Run the impacted CapVeri backend tests and the relevant Sequencer compile/test gate before deployment.

### Ventora Platform AI-SDR and AI-CS

CapVeri consumes central AI workers owned by `ventora-platform`:

| Agent | Central worker | CapVeri surface | CapVeri implementation |
| --- | --- | --- | --- |
| AI-SDR | `ventora-ai-sdr-worker` | Marketing site, high-intent pages | `marketing/src/components/ai-sdr/AiSdrSalesWidget.tsx`, marketing `/api/ai-sdr/sign`, backend `/api/v1/ai-sdr/product-context` |
| AI-CS | `ventora-ai-cs-worker` | Authenticated app shell | `frontend/src/components/AiCsHelpWidget/AiCsHelpWidget.tsx`, backend `/api/v1/ai-cs/sign`, backend `/api/v1/ai-cs/app-context` |

Canonical CapVeri runbook: [ventora-ai-integration.md](./ventora-ai-integration.md).

Architecture invariants:

- CapVeri does not host the shared AI chat runtime.
- CapVeri signs browser requests through BFF endpoints so the browser never holds HMAC secrets.
- Context endpoints are signed both ways with `X-Ventora-Timestamp`, `X-Ventora-Nonce`, and `X-Ventora-Signature`.
- AI-CS context is also auth-gated in CapVeri, so unauthenticated signed probes are not enough to prove live AI-CS health.
- The frontend AI-CS base URL is build-time config: `VITE_AI_CS_BASE_URL`.
- The marketing AI-SDR worker URL is build-time config: `NEXT_PUBLIC_AI_SDR_WORKER_URL`.

Before changing AI-SDR or AI-CS:

1. Read [ventora-ai-integration.md](./ventora-ai-integration.md).
2. If the central worker, shared contract, or hosted client changes, inspect `ventora-platform` and run its targeted package gates.
3. For CapVeri changes, run route tests for `ai-sdr-routes`, `ai-cs-routes`, widget tests, and the live/local E2E harness that covers signed context and chat flows.
4. For AI-SDR hosted-client rebuilds, recompute the SRI hash used by `AiSdrSalesWidget.tsx`.

### Ventora CRM Widget

CapVeri's authenticated frontend can inject the CRM widget loader:

```text
VITE_CRM_WIDGET_KEY
VITE_CRM_LOADER_URL=https://widgets.ventoralabs.com/w/v1.js
```

Current CapVeri implementation:

- `frontend/src/components/CrmFeedbackWidget/CrmFeedbackWidget.tsx`
- Mounted from `frontend/src/App.tsx`
- E2E coverage in `frontend/e2e/crm-feedback-widget.spec.ts`

Architecture invariants:

- CRM owns testimonials, feedback, widget public keys, widget origin allowlists, and customer hub data.
- CapVeri owns whether and where the loader is mounted.
- Do not seed or show fabricated testimonials.
- Changes to widget key/origin behavior require verification in `ventora-crm`.

## Operational Dependencies

### Postiz Operations

`postiz-posting` is the central command center for Postiz-driven social
posting and repair. CapVeri's repo may generate reviewed LinkedIn content and
Postiz import artifacts under `marketing/content`, but live scheduling should be
coordinated through the Postiz operations workspace unless the user explicitly
asks to execute inside CapVeri.

Current CapVeri evidence:

- `marketing/content/linkedin/README.md` documents Postiz CSV/JSON imports.
- `marketing/content/social/campaigns/*` contains Postiz integration metadata.
- Top-level CapVeri instructions require `node scripts/linkedin-post-review-gate.mjs marketing/content/linkedin` before creating, exporting, or scheduling LinkedIn posts.

Architecture invariants:

- Postiz is live operational state. Local manifests alone do not prove scheduling.
- Reconcile against live queued posts before reruns.
- Use manifest-backed, resumable scheduling with state files for live mutations.
- Public social copy must pass source, no-lies, humanizer, third-grade, duplicate, and schedule-readiness review.
- Evidence for YouTube as a Postiz posting path was not confirmed in the inspected Postiz instructions; do not assume it without a fresh source check.

### Ventora Ads

`ventora-ads` owns Microsoft Advertising / Bing Ads strategy and
landing-page experiments for `grantpipe.com` and `camaudit.io`. Its README
states that landing pages themselves live in the GrantPipe and CAMAudit.io
product repos, while the ads repo owns specs, experiments, and tracking. It is
not current evidence that the ads repo owns CapVeri.com paid acquisition; verify
that boundary before routing CapVeri.com campaign or landing-page work there.

Architecture invariants:

- Paid acquisition decisions should start from `ventora-ads/knowledge/README.md`.
- Durable Bing Ads facts belong in the ads repo knowledge base, not scattered in CapVeri docs.
- Landing-page implementation changes still happen in the product repo that serves the page.
- Copy and claims must still be checked against the relevant product source of truth before publishing, especially `camaudit-v2` for CAMAudit.io paid landing pages.

### Ventora Email Marketing

`ventora-email-marketing` owns outbound campaign planning and Instantly
operations. It is not the product source of truth.

Source-of-truth split:

| Concern | Owner |
| --- | --- |
| Product positioning, offers, lead magnets, video catalogs, claim boundaries | Product repos, including `camaudit` for CapVeri |
| Campaign briefs, experiments, launch plans, generated Instantly packages, canaries, interpretation | `ventora-email-marketing` |
| Live campaign performance, sender accounts, lead lists, campaign state, reply data | Instantly |
| Nurture and product-triggered lifecycle email | `sequencer` |

Before changing outbound campaigns:

1. Read the CapVeri product registry in `ventora-email-marketing/products/`.
2. Read `sources/source-map.yaml` and the referenced CapVeri source files.
3. Do not mutate Instantly campaigns, accounts, lists, or schedules without explicit approval.
4. Run the email-marketing repo's relevant structural and live-env checks before treating a launch as ready.

## Context Management Rules

Use this dependency map as the entrypoint, then load only the owning repo's
details needed for the current change. Do not paste large external docs into a
CapVeri task context when a file path and a small section are enough.

Recommended retrieval order:

1. Read this file to identify the owning system.
2. Read the owning repo's `AGENTS.md` or `CLAUDE.md`.
3. Read the specific source-of-truth doc named in this map.
4. Inspect the implementation file or manifest that will change.
5. Run the smallest gate that proves the affected contract, then broaden only when the blast radius requires it.

High-risk regression patterns:

- Changing a product slug, sequence slug, HMAC path, origin allowlist, Postiz integration id, Instantly campaign id, widget key, or public claim without updating the owning repo.
- Treating generated artifacts as live truth when the external system is canonical.
- Copying product claims from CAMAudit.io, GrantPipe, or another Ventora product into CapVeri without source support.
- Making CapVeri's user response path wait on slow best-effort side effects such as email sends, nurture enrollment, or provider callbacks.
- Calling a shared worker or package directly from the browser with secrets instead of using a BFF signer.

## Change-Control Matrix

| Change type | Must inspect | Must verify |
| --- | --- | --- |
| Add or change CapVeri lead nurture | CapVeri route, `sequencer/docs/product-client-integration.md`, target sequence YAML | CapVeri route tests, Sequencer compile/test gate, local or live lead flow as appropriate |
| Change AI-SDR marketing widget | [ventora-ai-integration.md](./ventora-ai-integration.md), `ventora-platform` AI-SDR package/worker docs, `AiSdrSalesWidget.tsx` | Marketing widget tests, signing route tests, AI-SDR context/chat E2E, SRI hash if hosted client changed |
| Change AI-CS app widget | [ventora-ai-integration.md](./ventora-ai-integration.md), `ventora-platform` AI-CS package/worker docs, `AiCsHelpWidget.tsx` | Frontend widget tests, backend AI-CS route tests, authenticated AI-CS E2E |
| Change CRM feedback/testimonial widget | `ventora-crm` widget docs and origin/key rules, CapVeri frontend mount | Frontend widget tests, CRM smoke if origin/key behavior changes |
| Create or schedule LinkedIn posts | CapVeri `marketing/content`, Postiz operations instructions, live Postiz queue | `scripts/linkedin-post-review-gate.mjs`, source/no-lies/copy review, live queue reconciliation |
| Change CAMAudit.io paid landing-page flow | `ventora-ads/knowledge`, `camaudit-v2` landing-page implementation | Marketing tests/typecheck, ad tracking smoke, ads knowledge session log if facts changed |
| Change outbound email campaign | `ventora-email-marketing` product registry, source map, launch plan, Instantly state | Email-marketing checks, generated package checks, Instantly dry-run/canary evidence |
| Consume a new shared package | `ventora-platform` package docs and publishing notes | Product package install/build/test, shared package gate if changed, update dependency notes |

## Evidence Files

Use these files to refresh this map:

- `postiz-posting/AGENTS.md`
- `sequencer/AGENTS.md`
- `sequencer/docs/product-client-integration.md`
- `ventora-ads/README.md`
- `ventora-ads/AGENTS.md`
- `ventora-crm/README.md`
- `ventora-crm/AGENTS.md`
- `ventora-email-marketing/README.md`
- `ventora-email-marketing/AGENTS.md`
- `ventora-email-marketing/sources/source-map.yaml`
- `ventora-platform/README.md`
- `ventora-platform/AGENTS.md`
- [ventora-ai-integration.md](./ventora-ai-integration.md)
- `cloudflare-backend/src/http/leads-routes.ts`
- `cloudflare-backend/src/http/auth-lifecycle-routes.ts`
- `cloudflare-backend/src/http/reconciliation-routes.ts`
- `frontend/src/components/CrmFeedbackWidget/CrmFeedbackWidget.tsx`
- `frontend/src/components/AiCsHelpWidget/AiCsHelpWidget.tsx`
- `marketing/src/components/ai-sdr/AiSdrSalesWidget.tsx`
