# CapVeri LinkedIn Campaign: 2026-06-07 to 2026-06-14

This package contains 120 LinkedIn company-page posts at 15 posts per day.

Live Postiz check on 2026-05-19 found CapVeri already has queued posts for all 15 June 7 slots. The schedule-ready import therefore excludes June 7 and starts on June 8.

Artifacts:

- `posts/`: source markdown for all 120 drafted posts.
- `postiz-import.full.json`: full ledger-style export for all 120 posts, including June 7 conflicts.
- `postiz-import.schedule-ready.json`: Postiz payloads for the 105 non-conflicting slots from June 8 through June 14.
- `postiz-import.schedule-ready.csv`: CSV view of the same 105 schedule-ready slots.
- `schedule-ledger.jsonl`: appendable scheduling ledger for all 120 slots, with content hashes and live-conflict metadata.

Use `postiz-import.schedule-ready.json` unless the June 7 live queue is intentionally replaced first.
