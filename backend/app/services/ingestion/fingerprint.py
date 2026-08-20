"""File fingerprinting for automatic source detection.

Reads file headers and content patterns to identify the source ERP system.
This enables automatic routing to the correct parser without user intervention.
"""

import logging
import re
from typing import BinaryIO, NamedTuple

logger = logging.getLogger(__name__)


class FingerprintResult(NamedTuple):
    """Result of fingerprinting a file.

    Attributes:
        source_system: Identified source system ('yardi', 'mri', 'generic')
        confidence: Confidence score from 0.0 to 1.0
        indicators: List of patterns that matched
    """

    source_system: str
    confidence: float
    indicators: list[str]


# FIX ING-14: Document pattern weight methodology
#
# Weight Scale (0.0 to 1.0):
#   0.9  = Definitive indicator (vendor name/trademark)
#   0.7-0.8 = Strong indicator (product-specific term)
#   0.3-0.4 = Moderate indicator (common in this ERP but not unique)
#   0.2  = Weak indicator (very common terms, many false positives)
#
# Scoring: Weights are summed, clamped to max 1.0
# Threshold: CONFIDENCE_THRESHOLD (0.5) required for positive match
# Rationale: Definitive indicators alone should exceed threshold

# Yardi Voyager patterns with weights
YARDI_PATTERNS: list[tuple[str, float]] = [
    # Definitive: Vendor branding (unique to Yardi)
    (r"Yardi\s+Voyager", 0.9),
    (r"Yardi\s+Systems", 0.9),
    # Strong: Product-specific report format
    (r"Run\s+Date:\s*\d{2}/\d{2}/\d{4}", 0.4),  # Yardi date format
    (r"GL\s+Detail", 0.4),  # Yardi GL report name
    # Moderate: Common in Yardi but not unique
    (r"Property\s+Management", 0.3),
    (r"Building\s+Total", 0.3),
    # Weak: Very generic terms
    (r"Account\s+Code", 0.2),
    (r"Report\s+Date:", 0.2),
]

# MRI patterns with weights
MRI_PATTERNS: list[tuple[str, float]] = [
    # Definitive: Vendor branding (unique to MRI)
    (r"MRI\s+Software", 0.9),
    (r"MRI\s+Commercial", 0.8),
    # Strong: MRI-specific column naming
    (r"REF\s+NUM", 0.4),  # MRI reference number format
    # Moderate: Common in MRI exports
    (r"PERIOD", 0.3),  # Period column typical of MRI
    (r"SOURCE", 0.3),
    (r"ACCOUNT\s+#", 0.3),
    # Weak: Very generic (debit/credit in many formats)
    (r"DEBIT|CREDIT", 0.2),
]

# Minimum confidence threshold for positive identification
CONFIDENCE_THRESHOLD = 0.5


def fingerprint_file(file: BinaryIO, file_name: str) -> FingerprintResult:
    """Detect the source system for a file.

    Reads the first 4KB of the file to identify patterns specific to
    each ERP system. Returns the best match with a confidence score.

    Args:
        file: File-like object (will read first 4KB, then seek back to start)
        file_name: Original filename for extension hints

    Returns:
        FingerprintResult with source system, confidence, and matched indicators
    """
    # Read first 4KB for pattern matching
    header = file.read(4096)
    file.seek(0)  # Reset for actual parsing

    # Decode to text for pattern matching
    text = _decode_bytes(header)
    text_upper = text.upper()

    # Also check filename for hints
    file_name_upper = file_name.upper()

    # Check each source system
    results: list[tuple[str, float, list[str]]] = []

    # Yardi
    yardi_score, yardi_indicators = _check_patterns(text_upper, YARDI_PATTERNS)
    # Bonus for filename hints
    if "YARDI" in file_name_upper:
        yardi_score = min(yardi_score + 0.3, 1.0)
        yardi_indicators.append("filename:yardi")
    results.append(("yardi", yardi_score, yardi_indicators))

    # MRI
    mri_score, mri_indicators = _check_patterns(text_upper, MRI_PATTERNS)
    if "MRI" in file_name_upper:
        mri_score = min(mri_score + 0.3, 1.0)
        mri_indicators.append("filename:mri")
    results.append(("mri", mri_score, mri_indicators))

    # Sort by confidence (highest first)
    results.sort(key=lambda x: x[1], reverse=True)

    best = results[0]

    # Return best match if confidence is high enough (strong match)
    if best[1] >= CONFIDENCE_THRESHOLD:
        return FingerprintResult(
            source_system=best[0],
            confidence=best[1],
            indicators=best[2],
        )

    # If any patterns were detected (score > 0), return the best ERP match
    # even if below threshold - it's still better than generic fallback
    # This prevents false positive generic detection for low-pattern ERP files
    if best[1] > 0 and len(best[2]) > 0:
        return FingerprintResult(
            source_system=best[0],
            confidence=best[1],
            indicators=best[2] + ["below_threshold:low_confidence_match"],
        )

    # Fall back to generic only when NO patterns were detected at all
    # Generic confidence is inverse of best match (more uncertain = more generic)
    generic_confidence = 1.0 - max(r[1] for r in results)
    return FingerprintResult(
        source_system="generic",
        confidence=generic_confidence,
        indicators=["No ERP patterns detected"],
    )


def _decode_bytes(data: bytes) -> str:
    """Decode bytes to string, trying UTF-8 first then Latin-1.

    Args:
        data: Raw bytes to decode

    Returns:
        Decoded string
    """
    try:
        return data.decode("utf-8", errors="ignore")
    except UnicodeDecodeError:
        return data.decode("latin-1", errors="ignore")


def _check_patterns(
    text: str,
    patterns: list[tuple[str, float]],
) -> tuple[float, list[str]]:
    """Check text against patterns and return cumulative score.

    Args:
        text: Text to search (should be uppercase for case-insensitive matching)
        patterns: List of (pattern, weight) tuples

    Returns:
        Tuple of (score capped at 1.0, list of matched pattern strings)
    """
    score = 0.0
    matched: list[str] = []

    for pattern, weight in patterns:
        if re.search(pattern, text, re.IGNORECASE):
            score += weight
            matched.append(pattern)

    # Cap at 1.0
    return min(score, 1.0), matched


def detect_encoding(file: BinaryIO) -> str:
    """Detect file encoding using chardet if available.

    Args:
        file: File-like object (reads first 10KB, then seeks back)

    Returns:
        Detected encoding string (defaults to 'utf-8' if detection fails
        or chardet is not installed)
    """
    sample = file.read(10000)
    file.seek(0)

    try:
        import chardet

        result = chardet.detect(sample)
        encoding = result.get("encoding")
        return encoding if encoding else "utf-8"
    except ImportError:
        # chardet not installed, use simple heuristic
        # Check for BOM markers
        if sample.startswith(b"\xef\xbb\xbf"):
            return "utf-8-sig"
        if sample.startswith(b"\xff\xfe"):
            return "utf-16-le"
        if sample.startswith(b"\xfe\xff"):
            return "utf-16-be"
        # Try UTF-8 decoding
        try:
            sample.decode("utf-8")
            return "utf-8"
        except UnicodeDecodeError:
            return "latin-1"


def detect_delimiter(file: BinaryIO, encoding: str = "utf-8") -> str:
    """Detect CSV delimiter from file content.

    Samples the first few lines and counts occurrences of common delimiters.

    Args:
        file: File-like object (reads first 2KB, then seeks back)
        encoding: Character encoding to use for decoding

    Returns:
        Most likely delimiter character (comma, tab, semicolon, or pipe)
    """
    sample = file.read(2000)
    file.seek(0)

    text = sample.decode(encoding, errors="ignore")
    lines = text.split("\n")[:5]  # Check first 5 lines

    delimiters = [",", "\t", ";", "|"]
    counts: dict[str, int] = {d: 0 for d in delimiters}

    for line in lines:
        for d in delimiters:
            counts[d] += line.count(d)

    # Return most common delimiter
    return max(counts.keys(), key=lambda d: counts[d])
