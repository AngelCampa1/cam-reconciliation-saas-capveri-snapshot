# -*- coding: utf-8 -*-
"""
Build postiz-import.csv and postiz-import.json from the 285 post .md files.
Re-run any time you edit individual posts.

Postiz CSV columns: slot_id,scheduled_date,scheduled_time,timezone,platform,
                    account,content,hashtags,has_limited_offer,pillar,format
"""
import os
import re
import csv
import json
from pathlib import Path

LINKEDIN_DIR = Path(__file__).resolve().parent
POSTS_DIR = LINKEDIN_DIR / "posts"
CSV_OUT = LINKEDIN_DIR / "postiz-import.csv"
JSON_OUT = LINKEDIN_DIR / "postiz-import.json"


def parse_file(path):
    """Return (frontmatter_dict, body_str)."""
    with open(path, encoding="utf-8") as f:
        raw = f.read()

    if not raw.startswith("---"):
        return {}, raw.strip()

    end = raw.find("---", 3)
    if end == -1:
        return {}, raw.strip()

    fm_raw = raw[3:end].strip()
    body = raw[end + 3 :].strip()

    fm = {}
    for line in fm_raw.splitlines():
        if ":" in line:
            k, _, v = line.partition(":")
            fm[k.strip()] = v.strip().strip('"').strip("'")
    return fm, body


def extract_hashtags(body, fm_hashtags_str):
    """Extract hashtags from frontmatter string like '[cre, camreconciliation]'."""
    raw = fm_hashtags_str.strip("[]").replace("'", "").replace('"', "")
    tags = [t.strip() for t in raw.split(",") if t.strip()]
    return " ".join(f"#{t}" if not t.startswith("#") else t for t in tags)


def clean_body_for_import(body):
    """Remove production-only image briefs and trailing hashtag lines."""
    body = re.sub(r"(?im)^\s*IMAGE BRIEF:\s.*(?:\n|$)", "", body).strip()
    return re.sub(r"(?m)(?:\n\s*)?(?:#[A-Za-z0-9_]+\s*)+$", "", body).strip()


def build_records():
    files = sorted(f.name for f in POSTS_DIR.iterdir() if f.suffix == ".md")
    records = []

    for i, fname in enumerate(files, 1):
        path = POSTS_DIR / fname
        fm, body = parse_file(path)

        hashtags_str = fm.get("hashtags", "")
        hashtag_line = extract_hashtags(body, hashtags_str)

        body_clean = clean_body_for_import(body)

        records.append(
            {
                "slot_id": i,
                "filename": fname,
                "scheduled_date": fm.get("scheduled_date", ""),
                "scheduled_time": fm.get("scheduled_time", "").strip('"'),
                "timezone": fm.get("timezone", "America/Chicago"),
                "platform": "linkedin",
                "account": "capveri",
                "content": body_clean,
                "hashtags": hashtag_line,
                "has_limited_offer": fm.get("has_limited_offer", "false"),
                "pillar": fm.get("pillar", ""),
                "format": fm.get("format", ""),
                "source_url": fm.get("source_url", ""),
            }
        )
    return records


def write_csv(records):
    fields = [
        "slot_id",
        "filename",
        "scheduled_date",
        "scheduled_time",
        "timezone",
        "platform",
        "account",
        "content",
        "hashtags",
        "has_limited_offer",
        "pillar",
        "format",
        "source_url",
    ]
    with open(CSV_OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(records)
    print(f"CSV: {len(records)} rows -> {CSV_OUT}")


def write_json(records):
    """
    Postiz API shape (array of post objects).
    Postiz /posts bulk create expects: date, time, content, tags, settings.
    """
    posts = []
    for r in records:
        posts.append(
            {
                "date": r["scheduled_date"],
                "time": r["scheduled_time"],
                "timezone": r["timezone"],
                "platform": r["platform"],
                "account": r["account"],
                "content": r["content"],
                "tags": [
                    t.lstrip("#") for t in r["hashtags"].split() if t.startswith("#")
                ],
                "metadata": {
                    "slot_id": r["slot_id"],
                    "filename": r["filename"],
                    "pillar": r["pillar"],
                    "format": r["format"],
                    "source_url": r["source_url"],
                    "has_limited_offer": r["has_limited_offer"] == "true",
                },
            }
        )
    with open(JSON_OUT, "w", encoding="utf-8") as f:
        json.dump(posts, f, indent=2, ensure_ascii=False)
    print(f"JSON: {len(posts)} posts -> {JSON_OUT}")


def final_audit(records):
    print("\n=== FINAL AUDIT ===")
    print(f"Total posts:       {len(records)}")

    # Date range
    dates = sorted(set(r["scheduled_date"] for r in records))
    print(f"Date range:        {dates[0]} to {dates[-1]}")
    print(f"Unique dates:      {len(dates)}")

    # 80OFF count
    limitedOffer = sum(1 for r in records if r["has_limited_offer"] == "true")
    print(f"80OFF posts:    {limitedOffer}")

    # Pillar distribution
    from collections import Counter

    pillars = Counter(r["pillar"] for r in records)
    print("\nPillar counts:")
    for k, v in sorted(pillars.items(), key=lambda x: -x[1]):
        print(f"  {k:<22} {v:>3}")

    formats = Counter(r["format"] for r in records)
    print("\nFormat counts:")
    for k, v in sorted(formats.items(), key=lambda x: -x[1]):
        print(f"  {k:<15} {v:>3}")

    # Posts per day
    per_day = Counter(r["scheduled_date"] for r in records)
    bad_days = [(d, c) for d, c in per_day.items() if c not in (10, 15)]
    if bad_days:
        print(f"\nWARN: unusual daily counts: {bad_days}")
    else:
        print(f"\nOK: all days have 10 or 15 posts")

    # Duplicate (date, time) check
    slots = [(r["scheduled_date"], r["scheduled_time"]) for r in records]
    if len(slots) != len(set(slots)):
        dups = [s for s in slots if slots.count(s) > 1]
        print(f"WARN: duplicate slots: {set(dups)}")
    else:
        print("OK: no duplicate date+time slots")

    # Content length sanity
    empty = [r["filename"] for r in records if len(r["content"].strip()) < 50]
    if empty:
        print(f"WARN: {len(empty)} posts have very short content: {empty[:5]}")
    else:
        print("OK: all posts have substantial content")

    print("\n=== AUDIT COMPLETE ===")


if __name__ == "__main__":
    records = build_records()
    write_csv(records)
    write_json(records)
    final_audit(records)
