# -*- coding: utf-8 -*-
"""
postiz_bulk.py - Schedule all 285 posts via the postiz CLI.

Usage:
    python postiz_bulk.py [--dry-run] [--resume] [--delay 125]

Auth: run `postiz auth:login` once before executing (or set POSTIZ_API_KEY).
Rate limit: 30 req/hr. Default delay = 125 s (~28.8/hr, safely under the cap).

State file: postiz_bulk_state.json  (resume-safe - tracks submitted slot_ids)
Log file:   postiz_bulk.log
"""
import json
import os
import subprocess
import sys
import tempfile
import time
import argparse
from datetime import datetime

if sys.version_info < (3, 9):
    sys.exit("Requires Python 3.9+")

# Force UTF-8 on Windows consoles (avoids cp1252 UnicodeEncodeError on emoji)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from zoneinfo import ZoneInfo

_DIR       = os.path.dirname(os.path.abspath(__file__))
POSTS_JSON = os.path.join(_DIR, "postiz-import.json")
STATE_FILE = os.path.join(_DIR, "postiz_bulk_state.json")
LOG_FILE   = os.path.join(_DIR, "postiz_bulk.log")

CHANNEL_ID    = "cmp1b2s2101fclj0yb8t0botq"
DEFAULT_DELAY = 130
MAX_RETRIES   = 3


def log(msg: str):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
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
    local_dt = datetime.fromisoformat(f"{date_str}T{time_str}:00").replace(
        tzinfo=ZoneInfo(tz_str)
    )
    utc_dt = local_dt.astimezone(ZoneInfo("UTC"))
    return utc_dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def build_payload(post: dict) -> dict:
    utc_date = to_utc_iso(post["date"], post["time"], post["timezone"])
    return {
        "type": "schedule",
        "date": utc_date,
        "shortLink": False,
        "tags": [],
        "posts": [
            {
                "integration": {"id": CHANNEL_ID},
                "value": [{"content": post["content"], "image": []}],
                "settings": {"__type": "linkedin-page"},
            }
        ],
    }


def run_postiz(payload: dict, dry_run: bool) -> tuple[bool, str]:
    """Write payload to a temp JSON file and call postiz posts:create --json."""
    if dry_run:
        return True, f"[DRY RUN] would schedule @ {payload['date']}"

    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".json", delete=False, encoding="utf-8"
    ) as tmp:
        json.dump(payload, tmp, ensure_ascii=False)
        tmp_path = tmp.name

    try:
        result = subprocess.run(
            ["postiz", "posts:create", "--json", tmp_path],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=30,
            shell=False,
        )
        output = ((result.stdout or "") + (result.stderr or "")).strip()
        if result.returncode == 0:
            return True, output
        else:
            return False, output
    finally:
        os.unlink(tmp_path)


def main():
    parser = argparse.ArgumentParser(description="Bulk-schedule posts via postiz CLI")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--resume", action="store_true",
                        help="Skip slot_ids already in state file")
    parser.add_argument("--delay", type=float, default=DEFAULT_DELAY,
                        help=f"Seconds between posts (default {DEFAULT_DELAY})")
    parser.add_argument("--start-slot", type=int, default=1)
    args = parser.parse_args()

    log("=" * 60)
    log(f"postiz_bulk.py  dry_run={args.dry_run}  resume={args.resume}  delay={args.delay}s")

    # Abort if state file exists without --resume (prevents duplicates)
    if not args.resume and not args.dry_run and os.path.exists(STATE_FILE):
        existing = load_state()
        if existing.get("submitted"):
            log(f"ERROR: state file has {len(existing['submitted'])} submitted entries.")
            log("  Use --resume to skip them, or delete postiz_bulk_state.json to start fresh.")
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

    eta_min = len(pending) * args.delay / 60
    log(f"Total: {len(posts)}  Already done: {len(submitted_ids)}  Pending: {len(pending)}")
    log(f"ETA: {eta_min:.0f} min ({eta_min/60:.1f} hr)")
    if args.dry_run:
        log("[DRY RUN - no CLI calls made]")
    log("-" * 60)

    for i, post in enumerate(pending, 1):
        slot_id  = post["metadata"]["slot_id"]
        filename = post["metadata"]["filename"]
        payload  = build_payload(post)

        success = False
        for attempt in range(1, MAX_RETRIES + 1):
            ok, output = run_postiz(payload, dry_run=args.dry_run)
            if ok:
                if not args.dry_run:
                    state["submitted"].append(slot_id)
                    state["failed"] = [
                        failure
                        for failure in state["failed"]
                        if failure.get("slot_id") != slot_id
                    ]
                    save_state(state)
                log(f"[{i:>3}/{len(pending)}] OK   slot={slot_id:>3}  {filename}")
                success = True
                break
            else:
                is_429 = "429" in output
                # 429: back off 5 min, 10 min, 20 min; other errors: 30s, 60s, 120s
                wait = (300 * (2 ** (attempt - 1))) if is_429 else (30 * attempt)
                log(f"[{i:>3}/{len(pending)}] FAIL attempt={attempt}/{MAX_RETRIES}  slot={slot_id}  {output[:200]}")
                if attempt < MAX_RETRIES:
                    log(f"  retrying in {wait}s...")
                    time.sleep(wait)

        if not success:
            log(f"[{i:>3}/{len(pending)}] GIVE UP  slot={slot_id}  {filename}")
            state["failed"].append({"slot_id": slot_id, "filename": filename})
            if not args.dry_run:
                save_state(state)

        if i < len(pending) and not args.dry_run:
            time.sleep(args.delay)

    log("=" * 60)
    log(f"DONE.  Submitted: {len(state['submitted'])}  Failed: {len(state['failed'])}")
    if state["failed"]:
        log("Failed: " + str([f["slot_id"] for f in state["failed"]]))
        log("Re-run with --resume to retry.")
    log("=" * 60)


if __name__ == "__main__":
    main()
