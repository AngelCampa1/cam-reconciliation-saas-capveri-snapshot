"""CSV formula-injection neutralization for tenant-facing CSV exports.

A spreadsheet (Excel, Google Sheets, LibreOffice) interprets a cell whose text
begins with ``=``, ``+``, ``-``, ``@``, TAB, or CR as a formula. A user-derived
value such as a property or pool name like ``=cmd|' /C calc'!A1`` written
verbatim into an exported CSV becomes executable when the recipient opens the
file (CWE-1236, "CSV injection"). The de-facto mitigation (defusedcsv) is to
prefix the offending value with a single quote so the spreadsheet treats the
cell as literal text.

Apply ONLY to free-text fields (names, descriptions). NEVER apply to a
numeric/currency cell — a legitimate negative amount like ``-1234.56`` must
remain a parseable number, and our currency strings are produced from Decimal,
not from user input, so they carry no injection risk.
"""

import re

# Leading characters a spreadsheet treats as the start of a formula.
_FORMULA_TRIGGERS = ("=", "+", "-", "@", "\t", "\r")

# C0 control characters plus DEL. In a hand-rolled fixed-width record any of
# these — especially the line breaks ``\n``/``\r`` and the tab ``\t`` — destroy
# column alignment, and a newline splits one logical record across multiple
# physical lines (record injection from an untrusted CSV-imported name).
_CONTROL_CHARS_RE = re.compile(r"[\x00-\x1f\x7f]")


def neutralize_formula(value: object) -> str:
    """Return ``value`` as text, prefixed with ``'`` if it could be read as a
    spreadsheet formula. Safe text is returned unchanged."""
    text = "" if value is None else str(value)
    if text and text[0] in _FORMULA_TRIGGERS:
        return "'" + text
    return text


def strip_control_chars(value: object) -> str:
    """Return ``value`` as text with all C0 control characters (including
    newlines, carriage returns, and tabs) removed.

    Use for user-derived text written into a hand-rolled fixed-width record,
    where a stray line break would split or misalign the record. CSV exports do
    NOT need this — the ``csv`` module already quotes embedded line breaks."""
    text = "" if value is None else str(value)
    return _CONTROL_CHARS_RE.sub("", text)
