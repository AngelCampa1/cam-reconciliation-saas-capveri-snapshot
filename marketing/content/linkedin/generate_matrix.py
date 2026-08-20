"""
Generate content-matrix.csv for CapVeri LinkedIn 285-post batch.
Schedule: Tue 2026-05-12 -> Mon 2026-06-01
Workdays: 15 posts/day  |  Weekends: 10 posts/day
"""
import csv
import datetime
from pathlib import Path

# ── Schedule ──────────────────────────────────────────────────────────────────
START = datetime.date(2026, 5, 12)   # Tuesday
END   = datetime.date(2026, 6, 1)    # Monday

WORKDAY_SLOTS = [
    "06:00","07:00","08:00","09:00","10:00","11:00","12:00",
    "13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00"
]
WEEKEND_SLOTS = [
    "07:00","08:30","10:00","11:30","13:00","14:30","16:00","17:30","19:00","20:30"
]

def is_workday(d):
    return d.weekday() < 5   # Mon-Fri

def day_abbr(d):
    return d.strftime("%a").lower()

# ── Pillar sequences (no consecutive same-pillar on same day) ─────────────────
# Workday 15-slot sequence
WORKDAY_PILLARS = [
    "cam-math",         # 06:00
    "erp-workarounds",  # 07:00
    "war-stories",      # 08:00
    "anti-integration", # 09:00
    "cam-math",         # 10:00
    "industry-news",    # 11:00
    "cam-math",         # 12:00
    "erp-workarounds",  # 13:00
    "war-stories",      # 14:00
    "cam-math",         # 15:00
    "anti-integration", # 16:00
    "founder",          # 17:00
    "cam-math",         # 18:00
    "product",          # 19:00
    "engagement",       # 20:00
]

# Weekend 10-slot sequence
WEEKEND_PILLARS = [
    "cam-math",         # 07:00
    "war-stories",      # 08:30
    "cam-math",         # 10:00
    "anti-integration", # 11:30
    "cam-math",         # 13:00
    "war-stories",      # 14:30
    "cam-math",         # 16:00
    "founder",          # 17:30
    "anti-integration", # 19:00
    "engagement",       # 20:30
]

# ── Format rotation by day variant (5 workday variants, 2 weekend variants) ───
FORMAT_WD = [
    # variant A
    ["text-short","text-long","text-short","carousel","text-short","image-quote",
     "text-long","text-short","video","text-short","text-long","carousel",
     "text-short","poll","text-long"],
    # variant B
    ["text-long","text-short","carousel","text-short","video","text-short",
     "text-long","image-quote","text-short","carousel","text-short","text-long",
     "poll","text-short","text-short"],
    # variant C
    ["text-short","carousel","text-short","text-long","text-short","video",
     "text-short","text-short","text-long","carousel","text-short","text-short",
     "text-long","image-quote","poll"],
    # variant D
    ["image-quote","text-short","text-long","text-short","text-short","carousel",
     "text-long","text-short","text-short","video","text-long","text-short",
     "carousel","text-short","poll"],
    # variant E
    ["text-short","text-long","image-quote","carousel","text-short","text-short",
     "text-long","video","text-short","text-short","carousel","text-long",
     "text-short","poll","text-short"],
]
FORMAT_WE = [
    # variant F (sat)
    ["text-short","carousel","text-long","text-short","image-quote",
     "text-short","text-long","text-short","carousel","text-short"],
    # variant G (sun)
    ["text-long","text-short","text-short","carousel","text-short",
     "text-long","text-short","video","text-short","image-quote"],
]

# ── Source pools by pillar ─────────────────────────────────────────────────────
# Format: (slug, type)  type = "blog" | "resource" | "product" | "original"
CAM_MATH_SOURCES = [
    ("what-is-cam-reconciliation","blog"),
    ("cam-true-up-vs-cam-reconciliation","blog"),
    ("cam-reconciliation-errors","blog"),
    ("cam-exclusion-list-complete-guide","blog"),
    ("capital-expenditure-cam-pool-rules","blog"),
    ("management-fee-cam-charges-rules","blog"),
    ("management-fee-calculation-errors","blog"),
    ("mixed-use-cam-allocation-retail-office","blog"),
    ("cam-reconciliation-best-practices-boma","blog"),
    ("boma-2024-changes","blog"),
    ("boma-outdoor-area-measurement","blog"),
    ("base-year-reset-lease-renewal","blog"),
    ("cap-carry-forward-tracking","blog"),
    ("mid-year-move-in-pro-rata-calculation","blog"),
    ("mid-year-tenant-move-out-reconciliation","blog"),
    ("cam-reconciliation-questions-property-managers-ask","blog"),
    ("how-long-should-cam-reconciliation-take","blog"),
    ("30-minute-gl-review","blog"),
    ("batch-cam-reconciliation-multiple-properties","blog"),
    ("documenting-lease-exclusions","blog"),
    ("reconciliation-cover-letter-template","blog"),
    ("year-end-operating-expense-true-up","blog"),
    ("cam-reconciliation-season-2026-guide","blog"),
    ("automating-estimate-letters","blog"),
    ("cam-gross-up-calculation-guide","resource"),
    ("cam-expense-caps","resource"),
    ("cam-cap-types","resource"),
    ("anchor-exclusion-cam","resource"),
    ("base-year-cam-lease","resource"),
    ("base-year-expense-stop","resource"),
    ("admin-fee-calculation-methods","resource"),
    ("cam-estimate-forecasting","resource"),
    ("cam-presend-checklist","resource"),
    ("boma-2024-implementation-guide","resource"),
    ("boma-2024-noi-impact","resource"),
    ("cam-billing-kpis","resource"),
    ("cam-reconciliation-cost","resource"),
    ("cam-cap-calculation-guide","resource"),
    ("cam-true-up","resource"),
    ("denominator-change-guide","resource"),
    ("denominator-drift","resource"),
    ("pro-rata-share-calculation","resource"),
    ("gl-analysis-explained","resource"),
    ("cam-variance-analysis","resource"),
    ("cam-reconciliation-for-property-managers","resource"),
    ("cam-reconciliation-timeline-guide","resource"),
    ("cam-reconciliation-checklist-2026","resource"),
]

ERP_SOURCES = [
    ("yardi-gl-export-not-balancing","blog"),
    ("fix-cam-calculation-yardi-voyager","blog"),
    ("yardi-cam-recovery-pool-setup","blog"),
    ("yardi-recovery-pool-not-calculating","blog"),
    ("cam-numbers-not-matching-yardi","blog"),
    ("mri-recovery-billing-gross-up-errors","blog"),
    ("mri-share-type-building-vs-floor","blog"),
    ("realpage-cam-pool-configuration-guide","blog"),
    ("cam-software-works-with-yardi","blog"),
    ("yardi-alternative-cam-reconciliation","blog"),
    ("yardi-cam-configuration-errors","resource"),
    ("export-cam-yardi-voyager","resource"),
    ("export-cam-mri","resource"),
    ("export-cam-realpage","resource"),
    ("mri-cam-recovery-errors","resource"),
]

WAR_SOURCES = [
    ("cost-single-cam-error-case-study","blog"),
    ("cam-overbilling-liability","blog"),
    ("what-tenant-auditors-look-for","blog"),
    ("cam-demand-letter","blog"),
    ("rise-of-tenant-audit-firms","blog"),
    ("cam-audit-defense-landlord-guide","blog"),
    ("tenant-disputing-cam-charges-step-by-step","blog"),
    ("how-cpas-verify-cam-charges","blog"),
    ("cpa-guide-cam-reconciliation-audit","blog"),
    ("pe-firms-evaluate-cam-at-acquisition","blog"),
    ("institutional-investors-recovery-ratios","blog"),
    ("cam-reconciliation-audit-trail","blog"),
    ("top-15-cam-billing-errors","resource"),
    ("tenant-auditor-guide","resource"),
    ("landlord-cam-audit-defense-playbook","resource"),
    ("cam-leakage-guide","resource"),
    ("cam-leakage-benchmarks-property-type","resource"),
    ("self-audit-cam-billing","resource"),
    ("tenant-cam-dispute","resource"),
]

ANTI_SOURCES = [
    ("automate-cam-without-replacing-yardi","blog"),
    ("replace-excel-cam-reconciliation","blog"),
    ("cam-build-vs-buy","blog"),
    ("death-of-spreadsheet-cam","blog"),
    ("cam-highest-roi-process-to-automate","blog"),
    ("business-case-cam-software","blog"),
    ("speed-up-cam-reconciliation","blog"),
    ("cam-reconciliation-too-slow","blog"),
    ("hidden-cost-late-reconciliation","blog"),
    ("mid-market-pmc-cam-automation-guide","blog"),
    ("controller-career-path-cre-finops","blog"),
    ("cam-build-vs-buy","resource"),
    ("data-migration-off-excel","resource"),
    ("deterministic-vs-ai-cam","resource"),
    ("ai-cam-reconciliation-limits","resource"),
]

INDUSTRY_SOURCES = [
    ("2026-property-tax-increases","blog"),
    ("sb-1103-one-year-later","blog"),
    ("fasb-asc-842-cam-impact","blog"),
    ("q1-2026-vacancy-rates-cam","blog"),
    ("sun-belt-migration-cam","blog"),
    ("dfw-industrial-cam","blog"),
    ("houston-office-cam-high-vacancy","blog"),
    ("property-tax-appeal-cam-impact","blog"),
    ("cam-reconciliation-deadlines","blog"),
    ("irem-operating-expense-benchmarks","blog"),
    ("cam-benchmarks-portfolio-comparison","blog"),
    ("building-cam-quality-program","blog"),
    ("reconciliation-season-staffing-plan","blog"),
    ("benchmarking-operating-expenses","resource"),
    ("cam-season-2026","resource"),
    ("florida-cam-compliance","resource"),
    ("texas-cam-compliance","resource"),
    ("sb-1103-compliance","resource"),
]

PRODUCT_SOURCES = [
    ("pricing","product"),
    ("sample-report","product"),
    ("product-tour","product"),
    ("cam-audit-software","product"),
    ("roi","product"),
]

PILLAR_SOURCES = {
    "cam-math":         CAM_MATH_SOURCES,
    "erp-workarounds":  ERP_SOURCES,
    "war-stories":      WAR_SOURCES,
    "anti-integration": ANTI_SOURCES,
    "industry-news":    INDUSTRY_SOURCES,
    "founder":          [("original","original")],
    "product":          PRODUCT_SOURCES,
    "engagement":       [("original","original")],
}

# Angle pool per format
ANGLE_BY_FORMAT = {
    "text-short":   ["hook","contrarian","stat-callout","definition","war-story-extract"],
    "text-long":    ["framework","war-story-extract","stat-callout","contrarian"],
    "carousel":     ["carousel-outline"],
    "image-quote":  ["stat-callout","hook"],
    "poll":         ["poll-question"],
    "video":        ["video-script"],
}

# ── Limited offer days (11 posts, ~every 2 days, never same day twice) ──────────────
ALL_DATES = []
d = START
while d <= END:
    ALL_DATES.append(d)
    d += datetime.timedelta(days=1)

# Pick every other day starting from day 0
LIMITED_OFFER_DATES = set(ALL_DATES[i] for i in range(0, len(ALL_DATES), 2))   # days 0,2,4,...18 → 11 dates

# ── Build schedule ─────────────────────────────────────────────────────────────
rows = []
slot_id = 1
source_counters = {p: 0 for p in PILLAR_SOURCES}
angle_counters   = {}   # (pillar, src_slug) -> index into angle list
wd_variant_idx = 0
we_variant_idx = 0

for d in ALL_DATES:
    wd = is_workday(d)
    slots   = WORKDAY_SLOTS   if wd else WEEKEND_SLOTS
    pillars = WORKDAY_PILLARS if wd else WEEKEND_PILLARS

    if wd:
        formats = FORMAT_WD[wd_variant_idx % 5]
        wd_variant_idx += 1
    else:
        formats = FORMAT_WE[we_variant_idx % 2]
        we_variant_idx += 1

    limited_offer_used_today = False

    for pos, (t, pillar, fmt) in enumerate(zip(slots, pillars, formats)):
        src_pool = PILLAR_SOURCES[pillar]
        src_idx  = source_counters[pillar] % len(src_pool)
        slug, src_type = src_pool[src_idx]
        source_counters[pillar] += 1

        # Angle selection
        angle_options = ANGLE_BY_FORMAT.get(fmt, ["hook"])
        ak = (pillar, slug)
        ai = angle_counters.get(ak, 0)
        angle = angle_options[ai % len(angle_options)]
        angle_counters[ak] = ai + 1

        # Source URL and file path
        if src_type == "blog":
            source_url  = f"https://www.capveri.com/blog/{slug}"
            source_file = f"marketing/content/blog/{slug}.mdx"
        elif src_type == "resource":
            source_url  = f"https://www.capveri.com/resources/{slug}"
            source_file = f"marketing/content/resources/{slug}.mdx"
        elif src_type == "product":
            source_url  = f"https://www.capveri.com/{slug}"
            source_file = f"original"
        else:
            source_url  = "original"
            source_file = "original"

        # Limited offer assignment: product slot or war-stories/anti on weekends.
        has_limited_offer = False
        if d in LIMITED_OFFER_DATES and not limited_offer_used_today:
            # On workdays put it on product slot (pos 13, 19:00)
            # On weekends put it on any war-stories or anti-integration slot
            if wd and pillar == "product":
                has_limited_offer = True
                limited_offer_used_today = True
            elif not wd and pillar in ("war-stories","anti-integration"):
                has_limited_offer = True
                limited_offer_used_today = True

        # Filename: YYYY-MM-DD-HHMM-pillar-NNN.md
        time_str = t.replace(":","")
        filename = f"{d.strftime('%Y-%m-%d')}-{time_str}-{pillar}-{slot_id:03d}.md"

        rows.append({
            "slot_id":       slot_id,
            "filename":      filename,
            "scheduled_date": d.isoformat(),
            "scheduled_time": t,
            "day_of_week":   day_abbr(d),
            "is_workday":    "yes" if wd else "no",
            "pillar":        pillar,
            "format":        fmt,
            "source_url":    source_url,
            "source_file":   source_file,
            "slug":          slug,
            "src_type":      src_type,
            "angle":         angle,
            "has_limited_offer":  "yes" if has_limited_offer else "no",
            "status":        "planned",
        })
        slot_id += 1

# ── Write CSV ──────────────────────────────────────────────────────────────────
out_path = str(Path(__file__).resolve().parent / "content-matrix.csv")
fields = ["slot_id","filename","scheduled_date","scheduled_time","day_of_week",
          "is_workday","pillar","format","source_url","source_file","slug",
          "src_type","angle","has_limited_offer","status"]

with open(out_path, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=fields)
    w.writeheader()
    w.writerows(rows)

print(f"Written {len(rows)} rows to {out_path}")

# ── Quick verification ─────────────────────────────────────────────────────────
from collections import Counter
pillar_counts  = Counter(r["pillar"] for r in rows)
format_counts  = Counter(r["format"] for r in rows)
limited_offer_count = sum(1 for r in rows if r["has_limited_offer"] == "yes")
date_counts    = Counter(r["scheduled_date"] for r in rows)
dates_with_limited_offer = [r["scheduled_date"] for r in rows if r["has_limited_offer"] == "yes"]

print("\nPillar distribution:")
for k,v in sorted(pillar_counts.items(), key=lambda x:-x[1]):
    print(f"  {k:<22} {v:>3}  ({v/len(rows)*100:.1f}%)")

print("\nFormat distribution:")
for k,v in sorted(format_counts.items(), key=lambda x:-x[1]):
    print(f"  {k:<15} {v:>3}  ({v/len(rows)*100:.1f}%)")

print(f"\n80OFF posts: {limited_offer_count}")
print("80OFF dates:", dates_with_limited_offer)

print(f"\nDate slot counts (should be 15 or 10):")
for dt, cnt in sorted(date_counts.items()):
    print(f"  {dt}  {cnt}")
