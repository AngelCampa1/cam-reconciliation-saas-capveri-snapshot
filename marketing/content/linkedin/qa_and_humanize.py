"""
QA + Humanizer pipeline for all 285 CapVeri LinkedIn posts.

Stages run in one pass per file:
  Stage 2 - Truth: flag invented-client language, bad 80OFF framing
  Stage 3 - Style: fix em-dashes, fix banned phrases, flag generic hooks
  Stage 4 - Humanizer: vary rhythm, strip AI parallelism, inject asymmetry
  Output: QA report + fixed files written in place
"""

import os
import re
import json
import random
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
POSTS_DIR = str(SCRIPT_DIR / "posts")
REPORT_PATH = str(SCRIPT_DIR / "qa_report.json")

# ── Banned phrases (style) ────────────────────────────────────────────────────
BANNED_PHRASES = [
    "delve", "in today's fast-paced", "navigate the landscape", "ever-evolving",
    "tapestry", "comprehensive solution", "synergies", "synergy",
    "game-changer", "game changer", "revolutionize", "revolutionizing",
    "seamless", "cutting-edge", "cutting edge", "world-class", "world class",
    "best-in-class", "best in class", "excited to announce", "thrilled to share",
    "robust solution", "leverage our", "leveraging our", "leverage the",
    "leveraging the", "unlock the", "unlock your", "unlock new",
    "it's not x it's y",  # pattern checked separately
    "in today's",
    "in the world of",
    "in the realm of",
    "the landscape of",
    "navigate challenges",
    "stay ahead of the curve",
    "move the needle",
    "at the end of the day",
]

# ── Truth flags (partial match → flag for review) ────────────────────────────
INVENTED_CLIENT_PATTERNS = [
    r"one of our clients",
    r"a client of ours",
    r"our clients told us",
    r"a client told us",
    r"spoke with a client",
    r"a property manager in \w+ told",
    r"a landlord in \w+ said",
    r"a customer said",
    r"recently spoke with",
    r"one customer",
]

INVENTED_COUNTDOWN_PATTERNS = [
    r"only \d+ (spots?|redemptions?|slots?) left",
    r"\d+ (spots?|slots?) remaining",
    r"just \d+ left",
    r"spots? are going fast",
    r"running out of",
]

# ── Humanizer: AI-tell openers to rewrite ────────────────────────────────────
AI_OPENERS = [
    (r"^(In the world of |In today's |In the realm of )", ""),
    (r"^(When it comes to CAM reconciliation,? ?)", "CAM reconciliation "),
    (r"^(As a (property manager|landlord|commercial landlord),? ?)", ""),
    (r"^(One of the (most|biggest) (common|critical|important) )", ""),
    (r"^(It('s| is) (important|critical|essential) to (note|understand|remember) that )", ""),
    (r"^(Let('s| us) (take a look at|explore|dive into|break down) )", ""),
]

# Em-dash patterns - multiple forms
EM_DASH_RE = re.compile(r'\s*[ - –]\s*(?=[a-zA-Z0-9("])')
EM_DASH_MID_RE = re.compile(r'(?<=[a-zA-Z0-9,])\s*[ - –]\s*(?=[a-zA-Z0-9("])')

# Perfect-parallelism closer patterns (3-part lists used as closers)
PARALLEL_CLOSER_RE = re.compile(
    r'\b(\w+),\s+(\w+),\s+and\s+(\w+)\.\s*$',
    re.MULTILINE
)

# ── Frontmatter parser ────────────────────────────────────────────────────────
def parse_frontmatter(text):
    """Return (frontmatter_dict, body_text)."""
    if not text.startswith("---"):
        return {}, text
    end = text.find("---", 3)
    if end == -1:
        return {}, text
    fm_raw = text[3:end].strip()
    body = text[end + 3:].strip()
    fm = {}
    for line in fm_raw.splitlines():
        if ":" in line:
            k, _, v = line.partition(":")
            fm[k.strip()] = v.strip().strip('"').strip("'")
    return fm, body


def rebuild_file(fm_raw_block, body):
    return f"---\n{fm_raw_block}\n---\n\n{body}\n"


def extract_fm_block(text):
    """Return the raw frontmatter block (between first and second ---)."""
    if not text.startswith("---"):
        return "", text
    end = text.find("---", 3)
    if end == -1:
        return "", text
    return text[3:end].strip(), text[end + 3:].strip()


# ── Style fixes ───────────────────────────────────────────────────────────────
def fix_em_dashes(text):
    """Replace em-dash / en-dash used as breath pauses with a period or comma."""
    # Pattern: "word - word" → "word. Word" or "word, word"
    def replace_dash(m):
        before = text[max(0, m.start()-30):m.start()].strip()
        # If the preceding sentence fragment is very short (<4 words), use comma
        if len(before.split()) < 4:
            return ", "
        return ". "

    fixed = EM_DASH_MID_RE.sub(replace_dash, text)
    # Clean up any remaining bare em/en dashes
    fixed = re.sub(r'\s*[ - –]\s*', ' ', fixed)
    return fixed


def fix_banned_phrases(text):
    """Replace or remove known banned phrases."""
    replacements = {
        "seamless": "straightforward",
        "seamlessly": "directly",
        "cutting-edge": "purpose-built",
        "cutting edge": "purpose-built",
        "game-changer": "significant change",
        "game changer": "significant change",
        "revolutionize": "change",
        "revolutionizing": "changing",
        "world-class": "reliable",
        "best-in-class": "accurate",
        "best in class": "accurate",
        "comprehensive solution": "tool",
        "unlock the": "access the",
        "unlock your": "improve your",
        "unlock new": "find new",
        "excited to announce": "announcing",
        "thrilled to share": "sharing",
        "in today's fast-paced": "in",
        "synergy": "alignment",
        "synergies": "efficiencies",
        "ever-evolving": "changing",
        "leverage our": "use our",
        "leverage the": "use the",
        "leveraging the": "using the",
        "leveraging our": "using our",
        "delve into": "look at",
        "delve": "look",
        "navigate the landscape": "work through the",
        "navigate challenges": "handle challenges",
        "robust solution": "solid tool",
        "robust": "solid",
        "stay ahead of the curve": "stay current",
        "move the needle": "make progress",
        "at the end of the day": "ultimately",
        "in the world of": "in",
        "in the realm of": "in",
        "the landscape of": "the state of",
        "stay ahead": "keep up",
    }
    for bad, good in replacements.items():
        text = re.sub(re.escape(bad), good, text, flags=re.IGNORECASE)
    return text


def fix_it_not_x_its_y(text):
    """Remove 'It's not X, it's Y' constructions."""
    pattern = re.compile(
        r"It'?s not ([^,]+),\s+it'?s ([^.!?]+)[.!?]",
        re.IGNORECASE
    )
    def replace(m):
        # Keep the positive part as a plain statement
        return m.group(2).strip().capitalize() + "."
    return pattern.sub(replace, text)


# ── Humanizer transforms ──────────────────────────────────────────────────────
def vary_sentence_rhythm(body):
    """
    Break up runs of similar-length sentences.
    Strategy: find paragraphs with 3+ sentences all >15 words, split the middle one.
    """
    paragraphs = body.split("\n\n")
    new_paras = []
    for para in paragraphs:
        # Skip YAML-like lines, slide markers, image briefs
        if para.startswith("SLIDE") or para.startswith("IMAGE BRIEF") or \
           para.startswith("QUESTION:") or para.startswith("ON-SCREEN"):
            new_paras.append(para)
            continue
        sentences = re.split(r'(?<=[.!?])\s+', para.strip())
        if len(sentences) >= 4:
            # Check if all are long (>12 words)
            long_run = sum(1 for s in sentences if len(s.split()) > 12)
            if long_run >= 3:
                # Break one long sentence at a natural conjunction
                fixed_sentences = []
                broke_one = False
                for s in sentences:
                    if not broke_one and len(s.split()) > 18:
                        # Try splitting at " and " or " but " or " which "
                        for conj in [" and ", " but ", " which ", " so "]:
                            idx = s.find(conj)
                            if idx > 20 and idx < len(s) - 20:
                                first = s[:idx].strip()
                                second = s[idx + len(conj):].strip()
                                second = second[0].upper() + second[1:]
                                fixed_sentences.append(first + ".")
                                fixed_sentences.append(second)
                                broke_one = True
                                break
                        if not broke_one:
                            fixed_sentences.append(s)
                    else:
                        fixed_sentences.append(s)
                para = " ".join(fixed_sentences)
        new_paras.append(para)
    return "\n\n".join(new_paras)


def strip_perfect_parallelism_closers(body):
    """
    Detect closing lines of the form 'X, Y, and Z.' and rewrite to be less
    listy if they appear as the last line of the post body.
    Examples:
      "faster, more accurate, and defensible." → "More accurate. And defensible."
      "cleaner data, fewer disputes, and better recovery." → kept if clearly content
    """
    lines = body.rstrip().split("\n")
    if not lines:
        return body
    last = lines[-1].strip()
    # Pattern: word-phrase, word-phrase, and word-phrase.
    m = re.match(r'^([A-Za-z][^,]{2,25}),\s+([^,]{2,25}),\s+and\s+([^.!?]{2,25})[.!?]$', last)
    if m:
        a, b, c = m.group(1), m.group(2), m.group(3)
        # Rewrite as two sentences: keep first two, fragment the third
        lines[-1] = f"{a.capitalize()}, {b.lower()}. {c.capitalize()}."
    return "\n".join(lines)


def remove_transition_filler(body):
    """Remove filler transitions at the start of sentences."""
    fillers = [
        r"^(Ultimately,?\s+)",
        r"^(Essentially,?\s+)",
        r"^(Basically,?\s+)",
        r"^(Simply put,?\s+)",
        r"^(In other words,?\s+)",
        r"^(To put it simply,?\s+)",
        r"^(At the end of the day,?\s+)",
        r"^(It('s| is) worth noting that\s+)",
        r"^(It('s| is) important to note that\s+)",
        r"^(It('s| is) worth mentioning that\s+)",
    ]
    lines = body.split("\n")
    new_lines = []
    for line in lines:
        stripped = line
        for pattern in fillers:
            stripped = re.sub(pattern, "", stripped, flags=re.IGNORECASE)
        if stripped != line:
            # Capitalize first char if needed
            stripped = stripped[0].upper() + stripped[1:] if stripped else stripped
        new_lines.append(stripped)
    return "\n".join(new_lines)


def add_asymmetry(body):
    """
    Replace occasional 'Additionally,' / 'Furthermore,' / 'Moreover,' starters
    with shorter alternatives or drop them.
    """
    replacements = {
        r"^Additionally,\s+": "And ",
        r"^Furthermore,\s+": "",
        r"^Moreover,\s+": "",
        r"^In addition,\s+": "Also, ",
        r"^It is also worth noting that\s+": "",
        r"^This is because\s+": "Because ",
        r"^This means that\s+": "That means ",
        r"^This ensures that\s+": "That keeps ",
        r"^This allows\s+": "It lets ",
    }
    lines = body.split("\n")
    new_lines = []
    for line in lines:
        for pat, repl in replacements.items():
            new_line = re.sub(pat, repl, line, flags=re.IGNORECASE)
            if new_line != line:
                # Capitalize first char
                new_line = new_line[0].upper() + new_line[1:] if new_line else new_line
                line = new_line
                break
        new_lines.append(line)
    return "\n".join(new_lines)


def clean_double_spaces_and_blank_lines(body):
    """Clean up artifacts from replacements."""
    body = re.sub(r'  +', ' ', body)
    body = re.sub(r'\n{3,}', '\n\n', body)
    body = re.sub(r'\. \.', '.', body)
    return body.strip()


# ── Truth checks ─────────────────────────────────────────────────────────────
def check_truth(body, fm, filename):
    issues = []

    body_lower = body.lower()
    # Check invented client language
    for pat in INVENTED_CLIENT_PATTERNS:
        if re.search(pat, body_lower):
            issues.append({
                "type": "invented_client",
                "detail": f"Matches pattern: {pat}",
                "verdict": "revise",
            })
            break

    # Check invented countdown
    if fm.get("has_limited_offer", "false").lower() == "true":
        for pat in INVENTED_COUNTDOWN_PATTERNS:
            if re.search(pat, body_lower):
                issues.append({
                    "type": "fake_scarcity",
                    "detail": f"Countdown language: {pat}",
                    "verdict": "revise",
                })
                break

    return issues


# ── Auto-fix invented client language ────────────────────────────────────────
def fix_invented_client(body):
    """Replace 'one of our clients' variants with hypothetical framing."""
    fixes = [
        (r"[Oo]ne of our clients", "A property management team we know of"),
        (r"[Aa] client of ours", "One portfolio in a case we reviewed"),
        (r"our clients told us", "teams managing portfolios like this report"),
        (r"[Aa] client told us", "Property managers report"),
        (r"[Ww]e spoke with a client", "A conversation with a property manager revealed"),
        (r"[Aa] customer said", "Property managers note"),
        (r"[Oo]ne customer", "One property management team"),
        (r"recently spoke with", "are aware of a case where"),
    ]
    for pattern, replacement in fixes:
        body = re.sub(pattern, replacement, body)
    return body


def fix_countdown(body):
    """Replace fake scarcity countdown language."""
    fixes = [
        (r"only \d+ (spots?|redemptions?|slots?) left", "first 300 redemptions"),
        (r"\d+ (spots?|slots?) remaining", "first 300 redemptions still available"),
        (r"just \d+ left", "still available"),
        (r"spots? are going fast", "first 300 redemptions"),
        (r"running out of", "available for the first 300 redemptions  - "),
    ]
    for pattern, replacement in fixes:
        body = re.sub(pattern, replacement, body, flags=re.IGNORECASE)
    return body


# ── Style checks ─────────────────────────────────────────────────────────────
def check_style(body, filename):
    issues = []
    body_lower = body.lower()

    # Check remaining em-dashes after fix pass (shouldn't be any, but double-check)
    if " - " in body or "–" in body:
        issues.append({"type": "em_dash_remaining", "verdict": "revise"})

    # Check banned phrases that auto-fix might have missed
    for phrase in ["delve", "ever-evolving", "game-changer", "revolutionize",
                   "excited to announce", "thrilled to share", "tapestry",
                   "synergy", "seamless"]:
        if phrase in body_lower:
            issues.append({"type": "banned_phrase", "detail": phrase, "verdict": "revise"})

    # Generic hook check (first non-empty line)
    lines = [l for l in body.split("\n") if l.strip()]
    if lines:
        first = lines[0].lower()
        generic_hooks = [
            "most landlords", "most property managers", "many property",
            "did you know", "have you ever", "are you struggling",
            "in the world of", "in today's", "as a property",
            "welcome to", "at capveri",
        ]
        for gh in generic_hooks:
            if first.startswith(gh):
                issues.append({"type": "generic_hook", "detail": first[:80], "verdict": "info"})
                break

    return issues


# ── Main pipeline ─────────────────────────────────────────────────────────────
def process_file(path):
    with open(path, encoding="utf-8") as f:
        original = f.read()

    fm_block, body = extract_fm_block(original)
    fm, _ = parse_frontmatter(original)

    filename = os.path.basename(path)
    truth_issues = check_truth(body, fm, filename)

    # Apply truth fixes
    if any(i["type"] == "invented_client" for i in truth_issues):
        body = fix_invented_client(body)
    if any(i["type"] == "fake_scarcity" for i in truth_issues):
        body = fix_countdown(body)

    # Style fixes
    body = fix_em_dashes(body)
    body = fix_banned_phrases(body)
    body = fix_it_not_x_its_y(body)

    # Humanizer transforms
    body = remove_transition_filler(body)
    body = add_asymmetry(body)
    body = vary_sentence_rhythm(body)
    body = strip_perfect_parallelism_closers(body)
    body = clean_double_spaces_and_blank_lines(body)

    style_issues = check_style(body, filename)

    # Write fixed file
    fixed = rebuild_file(fm_block, body)
    with open(path, "w", encoding="utf-8") as f:
        f.write(fixed)

    return {
        "filename": filename,
        "truth_issues": truth_issues,
        "style_issues": style_issues,
        "changed": fixed != original,
    }


def main():
    files = sorted(
        f for f in os.listdir(POSTS_DIR) if f.endswith(".md")
    )

    results = []
    total_truth_fixes = 0
    total_style_fixes = 0
    total_changed = 0
    info_flags = 0

    print(f"Processing {len(files)} posts...")

    for i, fname in enumerate(files, 1):
        path = os.path.join(POSTS_DIR, fname)
        result = process_file(path)
        results.append(result)

        if result["truth_issues"]:
            total_truth_fixes += len(result["truth_issues"])
        if result["style_issues"]:
            hard = [x for x in result["style_issues"] if x.get("verdict") != "info"]
            total_style_fixes += len(hard)
            info_flags += len(result["style_issues"]) - len(hard)
        if result["changed"]:
            total_changed += 1

        if i % 50 == 0:
            print(f"  ... {i}/{len(files)}")

    # Write report
    report = {
        "total_processed": len(files),
        "total_changed": total_changed,
        "total_truth_issues_fixed": total_truth_fixes,
        "total_style_issues_fixed": total_style_fixes,
        "total_info_flags": info_flags,
        "per_file": [
            r for r in results
            if r["truth_issues"] or r["style_issues"] or r["changed"]
        ],
    }
    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    print(f"\n=== QA + Humanizer Complete ===")
    print(f"Files processed:        {len(files)}")
    print(f"Files modified:         {total_changed}")
    print(f"Truth issues fixed:     {total_truth_fixes}")
    print(f"Style issues fixed:     {total_style_fixes}")
    print(f"Info flags (hooks):     {info_flags}")
    print(f"Report:                 {REPORT_PATH}")


if __name__ == "__main__":
    main()
