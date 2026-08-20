# -*- coding: utf-8 -*-
"""
Targeted cleanup for all 285 LinkedIn posts:
1. Fix encoding artifacts
2. Strip markdown bold/italic (LinkedIn ignores them)
3. Fix broken sentence joins from humanizer
4. Fix misc punctuation artifacts
"""
import os
import re
from pathlib import Path

POSTS_DIR = str(Path(__file__).resolve().parent / "posts")

EM_DASH   = u" - "   # ---
EN_DASH   = u"–"   # --
MULT_SIGN = u"×"   # x


def fix_encoding(text):
    """Fix common UTF-8 double-encoding artifacts by replacing known sequences."""
    pairs = [
        ("Ã×", "x"),
        ("Ã©", "e"),
        ("Ã¨", "e"),
        ("a€TM", "'"),
        ("a€oe", '"'),
        ("a€¦", "..."),
        ("a€"  , " - "),
        ("A·", "x"),
    ]
    for bad, good in pairs:
        text = text.replace(bad, good)
    # Catch remaining em/en dashes as simple hyphen-space
    text = text.replace(EM_DASH, " - ")
    text = text.replace(EN_DASH, " - ")
    return text


def strip_bold_italic(text):
    """Remove ** bold and *italic* from post body only (not frontmatter)."""
    if not text.startswith("---"):
        return text
    end = text.find("---", 3)
    if end == -1:
        return text
    fm = text[:end+3]
    body = text[end+3:]
    # Bold
    body = re.sub(r'\*\*(.+?)\*\*', r'\1', body, flags=re.DOTALL)
    # Italic (not bullet asterisks)
    body = re.sub(r'(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)', r'\1', body)
    return fm + body


def fix_sentence_breaks(text):
    """Fix common break artifacts."""
    # ". and lowercase" -> ". And Uppercase"
    text = re.sub(r'\. and ([a-z])', lambda m: '. And ' + m.group(1).upper(), text)
    text = re.sub(r'\. but ([a-z])', lambda m: '. But ' + m.group(1).upper(), text)
    # mid-sentence ". or " -> ", or "
    text = re.sub(r'([a-z])\. or ([a-z])', r'\1, or \2', text)
    # Orphaned comma/period artifacts
    text = re.sub(r',\s*,', ',', text)
    text = re.sub(r'\.\s*\.', '.', text)
    return text


def fix_misc(text):
    text = re.sub(r'[ \t]+$', '', text, flags=re.MULTILINE)
    text = re.sub(r'\n{3,}', '\n\n', text)
    # Remove backticks used as code markers (don't render well on LinkedIn)
    text = re.sub(r'`([^`]+)`', r'\1', text)
    return text.strip()


def process(path):
    with open(path, encoding="utf-8") as f:
        original = f.read()
    text = original
    text = fix_encoding(text)
    text = strip_bold_italic(text)
    text = fix_sentence_breaks(text)
    text = fix_misc(text)
    text = text.rstrip() + "\n"
    if text != original:
        with open(path, "w", encoding="utf-8") as f:
            f.write(text)
        return True
    return False


def main():
    files = sorted(f for f in os.listdir(POSTS_DIR) if f.endswith(".md"))
    changed = sum(1 for f in files if process(os.path.join(POSTS_DIR, f)))
    print(f"Cleanup: {changed}/{len(files)} files updated")

    # Verification sweep
    all_text = ""
    for f in files:
        with open(os.path.join(POSTS_DIR, f), encoding="utf-8") as fh:
            all_text += fh.read()

    issues = []
    if EM_DASH in all_text:
        issues.append(f"em-dashes: {all_text.count(EM_DASH)}")
    if EN_DASH in all_text:
        issues.append(f"en-dashes: {all_text.count(EN_DASH)}")

    # Bold in body (after frontmatter)
    bodies = re.sub(r'---.*?---', '', all_text, flags=re.DOTALL)
    if '**' in bodies:
        issues.append(f"bold markers: {bodies.count('**')}")

    if issues:
        print("WARNING:", "; ".join(issues))
    else:
        print("OK: em-dashes=0, en-dashes=0, bold-markers=0")

if __name__ == "__main__":
    main()
