# -*- coding: utf-8 -*-
"""
postiz_schedule.py - Schedule all 285 CapVeri LinkedIn posts via Postiz API.

Usage:
    set POSTIZ_API_KEY=YOUR_KEY
    python postiz_schedule.py [--dry-run] [--resume] [--delay 125]

Rate limit: Postiz allows 30 req/hour on the public API.
Default delay is 125 s between requests (28.8 req/hour, safe buffer below the cap).
On 429: exponential backoff starting at 5 min.

State file (postiz_schedule_state.json) tracks submitted slot_ids so the script
is safe to interrupt and re-run with --resume.
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime

if sys.version_info < (3, 9):
    sys.exit("postiz_schedule.py requires Python 3.9+ (needs stdlib zoneinfo)")

from zoneinfo import ZoneInfo

# ---------------------------------------------------------------------------
# Config - use abspath so paths are stable regardless of CWD
# ---------------------------------------------------------------------------
_DIR       = os.path.dirname(os.path.abspath(__file__))
POSTS_JSON = os.path.join(_DIR, "postiz-import.json")
STATE_FILE = os.path.join(_DIR, "postiz_schedule_state.json")
LOG_FILE   = os.path.join(_DIR, "postiz_schedule.log")

BASE_URL   = "https://api.postiz.com"
CHANNEL_ID = "cmp1b2s2101fclj0yb8t0botq"

DEFAULT_DELAY = 125        # seconds between requests (~28.8/hr, safely under 30/hr cap)
MAX_RETRIES   = 6          # retries per post before giving up


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def log(msg: str, also_print: bool = True):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    if also_print:
        print(line, flush=True)
    with open(LOG_FILE, "a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def load_state() -> dict:
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {"submitted": [], "failed": []}


def save_state(state: dict):
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)


def to_utc_iso(date_str: str, time_str: str, tz_str: str) -> str:
    """'2026-05-12', '06:00', 'America/Chicago'  ->  '2026-05-12T11:00:00.000Z'"""
    local_dt = datetime.fromisoformat(f"{date_str}T{time_str}:00").replace(
        tzinfo=ZoneInfo(tz_str)
    )
    utc_dt = local_dt.astimezone(ZoneInfo("UTC"))
    return utc_dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def build_payload(post: dict) -> dict:
    """Build the Postiz API payload for one post."""
    utc_date = to_utc_iso(post["date"], post["time"], post["timezone"])

    # Content already includes the hashtag line at the end (built by build_postiz_import.py).
    # tags[] is intentionally empty to prevent Postiz from appending a duplicate hashtag block.
    return {
        "type": "schedule",
        "date": utc_date,
        "shortLink": False,
        "tags": [],
        "posts": [
            {
                "integration": {"id": CHANNEL_ID},
                "value": [
                    {
                        "content": post["content"],
                        "image": [],
                    }
                ],
                "settings": {"__type": "linkedin-page"},
            }
        ],
    }


def post_to_postiz(api_key: str, payload: dict, dry_run: bool = False) -> dict:
    if dry_run:
        return {"dry_run": True, "date": payload["date"]}

    url = f"{BASE_URL}/public/v1/posts"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": api_key,   # Postiz: key directly, no "Bearer" prefix
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Schedule CapVeri LinkedIn posts via Postiz API"
    )
    parser.add_argument(
        "--api-key",
        default=os.environ.get("POSTIZ_API_KEY"),
        help="Postiz public API key. Prefer POSTIZ_API_KEY to avoid shell history leaks.",
    )
    parser.add_argument("--dry-run", action="store_true",
                        help="Print requests without sending (no API calls)")
    parser.add_argument("--resume", action="store_true",
                        help="Skip slot_ids already in the state file")
    parser.add_argument("--delay", type=float, default=DEFAULT_DELAY,
                        help=f"Seconds between successful requests (default {DEFAULT_DELAY})")
    parser.add_argument("--start-slot", type=int, default=1,
                        help="Start from this slot_id (inclusive), useful for manual re-runs")
    args = parser.parse_args()
    if not args.api_key:
        parser.error("Set POSTIZ_API_KEY or pass --api-key.")

    log("=" * 60)
    log(f"postiz_schedule.py starting  dry_run={args.dry_run}  resume={args.resume}  delay={args.delay}s")

    # Guard: state file exists but --resume not passed → abort to prevent duplicate posts.
    if not args.resume and not args.dry_run and os.path.exists(STATE_FILE):
        existing = load_state()
        if existing.get("submitted"):
            log(f"ERROR: {STATE_FILE} already has {len(existing['submitted'])} submitted entries.")
            log("  Use --resume to skip already-submitted posts, or delete the state file to start fresh.")
            sys.exit(1)

    with open(POSTS_JSON, encoding="utf-8") as f:
        posts = json.load(f)

    state = load_state() if args.resume else {"submitted": [], "failed": []}
    submitted_ids = set(state["submitted"])

    pending = [
        p for p in posts
        if p["metadata"]["slot_id"] >= args.start_slot
        and p["metadata"]["slot_id"] not in submitted_ids
    ]

    log(f"Total posts in JSON : {len(posts)}")
    log(f"Already submitted   : {len(submitted_ids)}")
    log(f"Pending this run    : {len(pending)}")
    eta_min = len(pending) * args.delay / 60
    log(f"ETA (approx)        : {eta_min:.0f} min  ({eta_min/60:.1f} hr)")
    if args.dry_run:
        log("[DRY RUN - no real API calls]")
    log("-" * 60)

    for i, post in enumerate(pending, 1):
        slot_id  = post["metadata"]["slot_id"]
        filename = post["metadata"]["filename"]
        payload  = build_payload(post)

        retries = 0
        while retries < MAX_RETRIES:
            try:
                result = post_to_postiz(args.api_key, payload, dry_run=args.dry_run)
                if not args.dry_run:
                    state["submitted"].append(slot_id)
                    state["failed"] = [
                        failure
                        for failure in state["failed"]
                        if failure.get("slot_id") != slot_id
                    ]
                    save_state(state)
                log(f"[{i:>3}/{len(pending)}] OK   slot={slot_id:>3}  {filename}  utc={payload['date']}")
                break

            except urllib.error.HTTPError as exc:
                body = exc.read().decode("utf-8", errors="replace")

                if exc.code == 429:
                    wait = min(300 * (2 ** retries), 3600)   # 5 min, 10 min, ... up to 1 hr
                    log(f"[{i:>3}/{len(pending)}] 429  slot={slot_id}  rate-limited, backing off {wait}s (retry {retries+1}/{MAX_RETRIES})")
                    time.sleep(wait)
                    retries += 1
                    continue

                elif exc.code in (500, 502, 503, 504):
                    wait = 30 * (2 ** retries)
                    log(f"[{i:>3}/{len(pending)}] {exc.code}  slot={slot_id}  server error, retry in {wait}s")
                    time.sleep(wait)
                    retries += 1
                    continue

                else:
                    log(f"[{i:>3}/{len(pending)}] ERR  slot={slot_id}  HTTP {exc.code}: {body[:300]}")
                    state["failed"].append({"slot_id": slot_id, "error": f"HTTP {exc.code}", "body": body[:300]})
                    save_state(state)
                    break

            except Exception as exc:
                log(f"[{i:>3}/{len(pending)}] ERR  slot={slot_id}  {exc}")
                state["failed"].append({"slot_id": slot_id, "error": str(exc)})
                save_state(state)
                break

        else:
            # while condition became false without a break - all retries exhausted
            log(f"[{i:>3}/{len(pending)}] FAIL slot={slot_id}  exhausted {MAX_RETRIES} retries, giving up")
            state["failed"].append({"slot_id": slot_id, "error": f"exhausted {MAX_RETRIES} retries"})
            save_state(state)

        # Rate-limit delay before the next request (skip after last post and in dry-run)
        if i < len(pending) and not args.dry_run:
            time.sleep(args.delay)

    log("=" * 60)
    log(f"DONE.  Submitted: {len(state['submitted'])}  Failed: {len(state['failed'])}")
    if state["failed"]:
        log("Failed slot_ids: " + str([f["slot_id"] for f in state["failed"]]))
        log("Re-run with --resume to retry failed posts.")
    log("=" * 60)


if __name__ == "__main__":
    main()
