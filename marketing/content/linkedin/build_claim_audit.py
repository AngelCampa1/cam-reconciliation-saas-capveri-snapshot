"""Catalog checkable factual claims across LinkedIn post markdown files.

Walks marketing/content/linkedin/posts/, strips YAML frontmatter and IMAGE BRIEF /
hashtag blocks, splits the body into sentences, regex-flags candidate claims, and
streams classified rows into claim_audit.csv.
"""

from __future__ import annotations

import csv
import os
import re
from pathlib import Path

POSTS_DIR = Path(__file__).resolve().parent / "posts"
OUT_CSV = Path(__file__).resolve().parent / "claim_audit.csv"

# ---- entity patterns (compiled once) ---------------------------------------

# Legal/regulatory + accounting standards.
LEGAL_RE = re.compile(
    r"\b(SB\s?1103|ASC\s?842|IFRS\s?16|FASB|GAAP|GASB|SOX|FCPA|Sarbanes[- ]Oxley)\b",
    re.IGNORECASE,
)

# Industry / trade orgs / data shops likely to be cited.
INDUSTRY_ORG_RE = re.compile(
    r"\b(BOMA|IREM|NAIOP|ICSC|NAREIT|MSCI|JLL|CBRE|Cushman\s?(?:&|and)\s?Wakefield|"
    r"Colliers|Newmark|Marsh|Lockton|Aon|Gallagher|Robert\s?Half|PredictAP|"
    r"EuSpRIG|Panko|Deloitte|McKinsey|PwC|Gartner|Forrester|BLS|"
    r"Bureau\s+of\s+Labor\s+Statistics|Harris\s+County|Cook\s+County|"
    r"Maricopa\s+(?:County\s+)?Appraisal\s+District|Maricopa\s+Appraisal\s+District)\b",
    re.IGNORECASE,
)

# Vendor / product mentions that may carry product claims.
VENDOR_RE = re.compile(
    r"\b(Yardi|MRI|RealPage|Nakisa|AppFolio|Visual\s?Lease|LeaseQuery|CoStar|"
    r"Argus|Buildium|Entrata|Rent\s?Manager|Voyager|ProLease|Trimble)\b",
    re.IGNORECASE,
)

PERCENT_RE = re.compile(r"\b\d{1,3}(?:\.\d+)?\s?%")
RANGE_PERCENT_RE = re.compile(r"\b\d{1,3}\s?[-–]\s?\d{1,3}\s?%")
DOLLAR_RE = re.compile(
    r"\$\s?\d[\d,]*(?:\.\d+)?\s?(?:k|K|m|M|b|B|million|billion|thousand|/sf|/SF|per\s+sf)?"
)
YEAR_RE = re.compile(r"\b(?:in|by|since|during|fiscal|FY)\s?(?:19|20)\d{2}\b", re.IGNORECASE)
BARE_YEAR_RE = re.compile(r"\b(?:19|20)\d{2}\b")
DATE_DEADLINE_RE = re.compile(
    r"\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b",
    re.IGNORECASE,
)

_ATTRIB_LEADERS = r"(?:according to|cited by|reported by|source[:]?\s|via|per)"
ATTRIB_RE = re.compile(
    # Require attribution leader followed by a Proper-Noun phrase (1-5 capitalized
    # tokens). "per year", "per tenant" no longer match because year/tenant are
    # lowercase.
    rf"(?:^|[\s,;\(]){_ATTRIB_LEADERS}\s+"
    r"((?:[A-Z][\w&.\-]*\.?)(?:\s+(?:[A-Z][\w&.\-]*\.?|\d{4}|of|the|and|&|/|via))*"
    r"(?:\s+[A-Z][\w&.\-]*\.?)?)",
    re.IGNORECASE | re.UNICODE,
)
# Use case-sensitive match for the proper-noun capture itself.
ATTRIB_LEADER_RE = re.compile(
    rf"(?:^|[\s,;\(]){_ATTRIB_LEADERS}\s+", re.IGNORECASE
)
PROPER_NOUN_RE = re.compile(
    r"((?:[A-Z][\w&.\-]+)(?:\s+(?:[A-Z][\w&.\-]+|of|the|and|&|/|via|\d{4})){0,5})"
)

ILLUSTRATIVE_RE = re.compile(
    r"\b(illustrative|modeled\s+estimate|hypothetical|for\s+illustration|"
    r"example\s+only|illustration\s+only)\b",
    re.IGNORECASE,
)

# Sentences that are pure mechanical math (skip).
PURE_MATH_RE = re.compile(
    r"^[\s\d\$.,%×x*+\-/=()– - ]+$"
)

# Sentence-level signals that a percentage or dollar figure is a *market-fact*
# claim (vs. an internal worked example). These nudge raw number sentences into
# the audit; without one of these signals, a bare $/% sentence is treated as a
# mechanical example and skipped.
MARKET_CONTEXT_RE = re.compile(
    r"\b(industry|market|average\s+(?:building|portfolio|landlord|tenant|"
    r"property|recovery|error|rate)|"
    r"typical(?:ly)?|nationwide|portfolio[- ]wide|"
    r"survey|surveys|study|studies|research|report|reports?|whitepaper|"
    r"benchmark|benchmarks?|analysts?|analyst\s+estimates?|"
    r"forecast|projected|projection|expected\s+to|"
    r"insurance\s+premiums?|property\s+tax(?:es)?|reassessments?|"
    r"reassessed|assessment\s+rolls?|rate\s+hikes?|wage\s+inflation|"
    r"opex\s+inflation|cap\s+rates?|cost\s+of\s+capital|"
    r"vacanc(?:y|ies)|absorption|occupancy\s+rates?|"
    r"of\s+(?:leases?|tenants?|landlords?|buildings?|properties|portfolios?|"
    r"reconciliations?|invoices?|reviews?|audits?|deals|firms|companies|"
    r"operators?|managers?)|"
    r"share\s+of|percent\s+of|"
    r"BLS|Bureau\s+of\s+Labor\s+Statistics|"
    r"in\s+(?:19|20)\d{2}|by\s+(?:19|20)\d{2}|"
    r"this\s+year|last\s+year|next\s+year|year[- ]over[- ]year|YoY|"
    r"increased\s+\d|rose\s+\d|grew\s+\d|fell\s+\d|dropped\s+\d|"
    r"up\s+\d|down\s+\d|up\s+by|down\s+by)\b",
    re.IGNORECASE,
)

# Drop noisy lines.
HASHTAG_RE = re.compile(r"^\s*#\w")
IMAGE_BRIEF_HEADER_RE = re.compile(r"^\s*(?:#+\s*)?IMAGE\s*BRIEF", re.IGNORECASE)
HEADING_RE = re.compile(r"^\s*#+\s")
LIST_BULLET_RE = re.compile(r"^\s*[-*+]\s+")
NUMBERED_RE = re.compile(r"^\s*\d+[\.)]\s+")
HORIZ_RULE_RE = re.compile(r"^\s*-{3,}\s*$")

# CapVeri product/pricing/CTA filter - we should EXCLUDE these.
CAPVERI_RE = re.compile(
    r"\b(CapVeri|capveri\.com|app\.capveri\.com|\$99\b|\$990\b|Growth\s+tier|"
    r"book\s+a\s+demo|free\s+trial|sign\s+up|landing\s+page|/onboard|"
    r"50\s+units\s+included|\$2/unit)\b",
    re.IGNORECASE,
)

# ---- helpers ---------------------------------------------------------------


def strip_frontmatter(text: str) -> str:
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end != -1:
            return text[end + 4 :]
    return text


def clean_body(text: str) -> str:
    """Remove IMAGE BRIEF blocks and trailing hashtag clusters."""
    out_lines: list[str] = []
    in_image_brief = False
    for line in text.splitlines():
        if IMAGE_BRIEF_HEADER_RE.match(line):
            in_image_brief = True
            continue
        if in_image_brief:
            # Image brief is usually a single block followed by a blank line +
            # next heading. Exit when we hit a markdown heading or horizontal rule.
            if HEADING_RE.match(line) or HORIZ_RULE_RE.match(line) or line.strip() == "":
                # blank line ends the brief; subsequent content resumes
                if line.strip() == "":
                    in_image_brief = False
                continue
            else:
                continue
        if HASHTAG_RE.match(line):
            continue
        if HORIZ_RULE_RE.match(line):
            continue
        out_lines.append(line)
    return "\n".join(out_lines)


SENT_SPLIT_RE = re.compile(r"(?<=[\.!?])\s+(?=[A-Z0-9\"\(\$])")


def split_sentences(text: str) -> list[str]:
    # Flatten markdown-ish formatting that interferes.
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"\*(.+?)\*", r"\1", text)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    sentences: list[str] = []
    for chunk in text.split("\n"):
        chunk = chunk.strip()
        if not chunk:
            continue
        if HEADING_RE.match(chunk):
            chunk = re.sub(r"^#+\s+", "", chunk)
        if LIST_BULLET_RE.match(chunk):
            chunk = LIST_BULLET_RE.sub("", chunk)
        if NUMBERED_RE.match(chunk):
            chunk = NUMBERED_RE.sub("", chunk)
        if not chunk:
            continue
        for s in SENT_SPLIT_RE.split(chunk):
            s = s.strip()
            if s:
                sentences.append(s)
    return sentences


def classify(sentence: str) -> tuple[str | None, bool, str]:
    """Return (claim_type, needs_verification, attributed_source) or (None, ...)."""
    s = sentence
    sl = s.lower()

    # Skip pure mechanical math.
    if PURE_MATH_RE.match(s):
        return None, False, ""

    # CapVeri product/pricing/CTA - exclude.
    if CAPVERI_RE.search(s):
        return None, False, ""

    has_legal = bool(LEGAL_RE.search(s))
    has_org = bool(INDUSTRY_ORG_RE.search(s))
    has_vendor = bool(VENDOR_RE.search(s))
    has_percent = bool(PERCENT_RE.search(s) or RANGE_PERCENT_RE.search(s))
    has_dollar = bool(DOLLAR_RE.search(s))
    has_year = bool(YEAR_RE.search(s) or BARE_YEAR_RE.search(s))
    has_date = bool(DATE_DEADLINE_RE.search(s))

    # Extract attributed source if present (case-sensitive proper-noun search
    # right after a leader like "per " or "according to ").
    attributed = ""
    for lm in ATTRIB_LEADER_RE.finditer(s):
        tail = s[lm.end() :]
        pm = PROPER_NOUN_RE.match(tail)
        if pm:
            attributed = pm.group(1).strip().rstrip(".,;:")
            break

    # Decide claim type (priority order).
    claim_type: str | None = None
    if has_legal:
        claim_type = "legal-regulatory"
    elif has_vendor:
        # Vendor claim only if it has an attached claim verb or number/percent/dollar,
        # not just a passing mention.
        if (
            has_percent
            or has_dollar
            or has_year
            or re.search(
                r"\b(can(?:not)?|fails|breaks|requires|forces|lacks|crashes|hangs|"
                r"exports?|imports?|charges?|costs?|sells?|owns?|acquired|"
                r"deprecated|unsupported|missing)\b",
                sl,
            )
        ):
            claim_type = "vendor-product"
    elif has_org:
        # Industry stat if number/percent attached, else still industry-stat
        # because we're naming a third-party source.
        claim_type = "industry-stat"
    elif has_date and (has_percent or has_dollar):
        claim_type = "date-deadline"
    elif has_percent and (MARKET_CONTEXT_RE.search(s) or attributed):
        claim_type = "percentage"
    elif has_dollar and (MARKET_CONTEXT_RE.search(s) or attributed):
        claim_type = "dollar-figure"

    # Bare year + percent/dollar - dated industry claim
    if claim_type in {"percentage", "dollar-figure"} and has_year:
        # keep type but note dating; spec lists date-deadline separately so we
        # only flag as date-deadline when an explicit date appears.
        pass

    if claim_type is None:
        return None, False, attributed

    # needs_verification: external stat / source / statute / vendor named.
    needs_verification = (
        has_legal
        or has_org
        or has_vendor
        or bool(attributed)
        # market-fact percentage/dollar (has a year reference or is dated)
        or (claim_type in {"percentage", "dollar-figure", "date-deadline"} and has_year)
    )

    return claim_type, needs_verification, attributed


def trim_claim(s: str, limit: int = 300) -> str:
    s = re.sub(r"\s+", " ", s).strip()
    if len(s) <= limit:
        return s
    return s[: limit - 1].rstrip() + "…"


# ---- main ------------------------------------------------------------------


def main() -> int:
    files = sorted(POSTS_DIR.glob("*.md"))
    rows: list[dict[str, str]] = []
    claim_id = 0

    for fp in files:
        raw = fp.read_text(encoding="utf-8", errors="replace")
        body = strip_frontmatter(raw)
        body = clean_body(body)
        for sent in split_sentences(body):
            claim_type, needs_v, attributed = classify(sent)
            if claim_type is None:
                continue
            is_illustrative = bool(ILLUSTRATIVE_RE.search(sent))
            claim_id += 1
            rows.append(
                {
                    "claim_id": f"{claim_id:04d}",
                    "post_file": fp.name,
                    "claim_text": trim_claim(sent),
                    "claim_type": claim_type,
                    "attributed_source": attributed,
                    "needs_verification": "yes" if needs_v else "no",
                    "is_illustrative": "yes" if is_illustrative else "no",
                }
            )

    with OUT_CSV.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "claim_id",
                "post_file",
                "claim_text",
                "claim_type",
                "attributed_source",
                "needs_verification",
                "is_illustrative",
            ],
            quoting=csv.QUOTE_MINIMAL,
        )
        writer.writeheader()
        writer.writerows(rows)

    # Summary printed to stdout for the caller.
    from collections import Counter

    by_type = Counter(r["claim_type"] for r in rows)
    by_source = Counter(r["attributed_source"] for r in rows if r["attributed_source"])
    needs_yes = sum(1 for r in rows if r["needs_verification"] == "yes")
    illust_yes = sum(1 for r in rows if r["is_illustrative"] == "yes")

    print(f"FILES_SCANNED={len(files)}")
    print(f"TOTAL_ROWS={len(rows)}")
    print(f"NEEDS_VERIFICATION_YES={needs_yes}")
    print(f"IS_ILLUSTRATIVE_YES={illust_yes}")
    print("BY_TYPE:")
    for k, v in sorted(by_type.items(), key=lambda x: -x[1]):
        print(f"  {k}: {v}")
    print("TOP_SOURCES:")
    for k, v in by_source.most_common(20):
        print(f"  {v}\t{k}")
    # Print 5 example rows from different types.
    seen_types: set[str] = set()
    print("EXAMPLES:")
    for r in rows:
        if r["claim_type"] in seen_types:
            continue
        seen_types.add(r["claim_type"])
        print(
            f"  [{r['claim_type']}] {r['post_file']} | {r['claim_text'][:140]}"
        )
        if len(seen_types) >= 5:
            break
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
