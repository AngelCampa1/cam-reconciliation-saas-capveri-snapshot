# CapVeri Sunset Teardown - 2026-07-03

## Scope

Retire the CapVeri product footprint for:

- `www.capveri.com`
- `capveri.com`
- `app.capveri.com`
- `api.capveri.com`
- Cloudflare Workers, Queues, R2, D1, and Hyperdrive resources named `capveri-*`
- Supabase project `Capveri` (`REDACTED_SUPABASE_PROJECT_REF`)
- Vercel domain ownership for `capveri.com`
- Queued CapVeri social posts in Postiz

Shared Ventora resources were not deleted.

## Removed

### Cloudflare Workers

Deleted:

- `capveri-marketing`
- `capveri-app`
- `capveri-api`

Pre-delete evidence showed all three Workers existed and served `100%` traffic on 2026-07-03.
Post-delete verification with `npx wrangler deployments list --name <worker>` returned
`This Worker does not exist on your account. [code: 10007]` for all three.

### Cloudflare Queues

Detached `capveri-api` as consumer from:

- `capveri-extraction`
- `capveri-reconciliation`

Deleted:

- `capveri-analytics`
- `capveri-email`
- `capveri-export`
- `capveri-extraction`
- `capveri-extraction-dlq`
- `capveri-reconciliation`
- `capveri-reconciliation-dlq`

Post-delete verification: `npx wrangler queues list | Select-String -Pattern "capveri"` returned no matches.

### Cloudflare R2

Deleted all objects, then deleted buckets:

- `capveri-documents`: 636 objects, 9,900,454 bytes
- `capveri-lead-magnets`: 116 objects, 914,998 bytes
- `capveri-reports`: 8 objects, 31,352 bytes

Post-delete verification: `npx wrangler r2 bucket list | Select-String -Pattern "capveri"` returned no matches.

### Cloudflare D1

Deleted `capveri-ai-sdr-nonces` (`5a1c0659-181f-4c42-a265-f46510dba770`).

Pre-delete evidence: one nonce row and one migration row.
Post-delete verification: `npx wrangler d1 list | Select-String -Pattern "capveri"` returned no matches.

### Cloudflare Hyperdrive

Deleted `capveri-hyperdrive` (`71d8cbb5185f45b6b4df406b969b05bd`), which pointed at Supabase project `REDACTED_SUPABASE_PROJECT_REF`.

Post-delete verification: `npx wrangler hyperdrive list | Select-String -Pattern "capveri"` returned no matches.

### Supabase

Deleted Supabase project `Capveri` (`REDACTED_SUPABASE_PROJECT_REF`) with:

```powershell
supabase projects delete "REDACTED_SUPABASE_PROJECT_REF" --yes
```

Post-delete verification: `supabase projects list` no longer showed `REDACTED_SUPABASE_PROJECT_REF` or `Capveri`.

### Vercel

Removed account-level Vercel domain ownership for `capveri.com` with:

```powershell
npx vercel domains rm "capveri.com" --yes
```

Post-delete verification: `npx vercel domains inspect "capveri.com"` returned `Domain not found`.

### Postiz

Deleted 295 queued CapVeri posts from Postiz, filtering by queued state plus CapVeri integration/name/content/tag matches.

Post-delete verification: the same filter returned `CAPVERI_QUEUE_MATCHES_AFTER_DELETE=0`.

### DNS and Interim Fallback Neutralization

Because DNS edit access was not available, a temporary Cloudflare Worker named `capveri-sunset-gone` was deployed to intercept:

- `capveri.com/*`
- `www.capveri.com/*`
- `app.capveri.com/*`
- `api.capveri.com/*`

The Worker returns `410 Gone` with no response body, `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`, and `X-CapVeri-Sunset: true`.

Deployment verification:

- `npx wrangler deployments status --name "capveri-sunset-gone"` reported version `1b492b94-8b0a-4e4e-82fe-7b1b57dd1900` at `100%`.
- Cloudflare route API showed the four CapVeri route patterns mapped to `capveri-sunset-gone`:
  - `api.capveri.com/*` route `846bb5b45fa24650b1472f9f159f471d`
  - `app.capveri.com/*` route `dfdc46b14dcb4f188a0612158d1060c3`
  - `www.capveri.com/*` route `2b7bd8b29fc94e2dabb5659b8acd351c`
  - `capveri.com/*` route `cff2cb887a694cefa74da1b46d727911`
- Live probes for `https://www.capveri.com/`, `https://capveri.com/pricing`, `https://app.capveri.com/`, and `https://api.capveri.com/health` returned `410 Gone` with `X-CapVeri-Sunset: true` and no stale Vercel or Railway fallback headers while the interim Worker was active.

After Cloudflare dashboard access was available, the public traffic DNS records were deleted from the `capveri.com` zone:

- `capveri.com` `A` -> `216.198.79.1`
- `api.capveri.com` `CNAME` -> `2vngvsdk.up.railway.app`
- `app.capveri.com` `CNAME` -> `8dbfec115dddae75.vercel-dns-017.com`
- `www.capveri.com` `CNAME` -> `ed3d074f565b065b.vercel-dns-017.com`

Provider-side verification in the Cloudflare dashboard showed `10 records` remaining and no rows for `capveri.com A`, `api.capveri.com CNAME`, `app.capveri.com CNAME`, or `www.capveri.com CNAME`.
The remaining records were mail, TXT verification, DKIM/DMARC, SES, and tracking DNS records; they were left untouched.

After DNS deletion, the interim Worker was deleted:

```powershell
npx wrangler delete "capveri-sunset-gone" --force
```

Post-delete Worker verification:

```text
This Worker does not exist on your account. [code: 10007]
```

Post-delete DNS verification:

- `Resolve-DnsName -Type A capveri.com` returned only SOA fallback and no A record.
- `Resolve-DnsName -Type CNAME capveri.com` returned only SOA fallback and no CNAME record.
- `Resolve-DnsName -Type A/CNAME www.capveri.com` returned `DNS name does not exist`.
- `Resolve-DnsName -Type A/CNAME app.capveri.com` returned `DNS name does not exist`.
- `Resolve-DnsName -Type A/CNAME api.capveri.com` returned `DNS name does not exist`.

Post-delete HTTP probes for `https://capveri.com/`, `https://www.capveri.com/`, `https://app.capveri.com/`, and `https://api.capveri.com/health` failed with `curl: (6) Could not resolve host`.

## Historical Limitation

Cloudflare DNS records for the CapVeri hosts previously resolved through Cloudflare. Before the interim sink Worker was deployed, they routed to old fallback infrastructure:

- `https://www.capveri.com/` returned `404 Not Found` with `X-Vercel-Error: DEPLOYMENT_NOT_FOUND`
- `https://app.capveri.com/` returned `404 Not Found` with `X-Vercel-Error: DEPLOYMENT_NOT_FOUND`
- `https://api.capveri.com/health` returned `404 Not Found` with `X-Railway-Fallback: true`

The Wrangler OAuth token can delete Workers, Queues, R2, D1, and Hyperdrive, but direct Cloudflare DNS API calls against zone `1756d16d2604a8b6810292f069097299` returned Cloudflare API authentication error `10000`. Wrangler 4.77.0 does not expose DNS record management commands. Railway CLI is authenticated but `railway list --json` returned an empty project list, so no CapVeri Railway project was visible to delete from this shell.

Follow-up verification later on 2026-07-03, before Cloudflare dashboard DNS access, found the same public state:

- `https://www.capveri.com/` still returned `404 Not Found` with `X-Vercel-Error: DEPLOYMENT_NOT_FOUND`
- `https://app.capveri.com/` still returned `404 Not Found` with `X-Vercel-Error: DEPLOYMENT_NOT_FOUND`
- `https://api.capveri.com/health` still returned `404 Not Found` with `X-Railway-Fallback: true`

Additional access checks:

- No `CLOUDFLARE`, `CF_`, DNS, or zone environment variables were available in the shell.
- `npx wrangler whoami` showed the active OAuth token still has `zone (read)` but no DNS edit scope.
- No Cloudflare DNS MCP/tool connector was exposed in the active Codex session.
- Opening the Cloudflare dashboard DNS URL for zone `1756d16d2604a8b6810292f069097299` redirected to the Cloudflare login page, so there was no reusable authenticated browser session for DNS edits.

This limitation was resolved later on 2026-07-03 using the authenticated Cloudflare dashboard session. The scripted finalizer remains at `scripts/operations/finalize-capveri-dns-teardown.ps1` for repeatability; it now targets only A, AAAA, and CNAME records for the four public CapVeri hostnames and defaults to dry-run unless `-Apply` is passed.
