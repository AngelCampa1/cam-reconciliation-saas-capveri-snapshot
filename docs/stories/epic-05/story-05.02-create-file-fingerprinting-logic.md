# Story 5.2: Create File Fingerprinting Logic

**Epic**: Epic 5 - Data Ingestion Engine
**Status**: `completed`
**Estimated Time**: 3 hours

---

## User Story

**As a** system
**I want** to automatically detect the source system from file content
**So that** I can route files to the correct parser

---

## Acceptance Criteria

- [ ] **AC1**: Reads first 4KB of file to detect patterns
- [ ] **AC2**: Recognizes Yardi Voyager GL export format
- [ ] **AC3**: Recognizes MRI rent roll format
- [ ] **AC4**: Returns confidence score for each parser
- [ ] **AC5**: Falls back to generic if no match

---

## Technical Specifications

### Files to Create

```
backend/app/services/ingestion/
└── fingerprint.py
```

### Implementation Details

**fingerprint.py**:
```python
"""
File fingerprinting for automatic source detection.

Reads file headers and content patterns to identify
the source ERP system.
"""
import re
from typing import BinaryIO, NamedTuple


class FingerprintResult(NamedTuple):
    """Result of fingerprinting a file."""
    source_system: str
    confidence: float
    indicators: list[str]


# Yardi Voyager patterns
YARDI_PATTERNS = [
    (r'Yardi\s+Voyager', 0.9),
    (r'Property\s+Management', 0.3),
    (r'GL\s+Detail', 0.4),
    (r'Account\s+Code', 0.2),
    (r'Building\s+Total', 0.3),
    (r'Report\s+Date:', 0.2),
]

# MRI patterns
MRI_PATTERNS = [
    (r'MRI\s+Software', 0.9),
    (r'PERIOD', 0.3),
    (r'REF\s+NUM', 0.4),
    (r'SOURCE', 0.3),
    (r'DEBIT|CREDIT', 0.2),
]


def fingerprint_file(file: BinaryIO, file_name: str) -> FingerprintResult:
    """
    Detect the source system for a file.

    Args:
        file: File-like object (will read first 4KB)
        file_name: Original filename for extension hints

    Returns:
        FingerprintResult with source system and confidence
    """
    # Read first 4KB
    header = file.read(4096)
    file.seek(0)  # Reset for actual parsing

    # Try to decode as text
    try:
        text = header.decode('utf-8', errors='ignore')
    except:
        text = header.decode('latin-1', errors='ignore')

    text_upper = text.upper()

    # Check each source system
    results = []

    # Yardi
    yardi_score, yardi_indicators = _check_patterns(text_upper, YARDI_PATTERNS)
    results.append(('yardi', yardi_score, yardi_indicators))

    # MRI
    mri_score, mri_indicators = _check_patterns(text_upper, MRI_PATTERNS)
    results.append(('mri', mri_score, mri_indicators))

    # Sort by confidence
    results.sort(key=lambda x: x[1], reverse=True)

    # Return best match, or generic if no good match
    best = results[0]
    if best[1] >= 0.5:
        return FingerprintResult(
            source_system=best[0],
            confidence=best[1],
            indicators=best[2],
        )

    return FingerprintResult(
        source_system='generic',
        confidence=1.0 - max(r[1] for r in results),
        indicators=['No strong match found'],
    )


def _check_patterns(
    text: str,
    patterns: list[tuple[str, float]],
) -> tuple[float, list[str]]:
    """
    Check text against patterns and return score.

    Returns (score, list of matched patterns)
    """
    score = 0.0
    matched = []

    for pattern, weight in patterns:
        if re.search(pattern, text, re.IGNORECASE):
            score += weight
            matched.append(pattern)

    # Cap at 1.0
    return min(score, 1.0), matched


def detect_encoding(file: BinaryIO) -> str:
    """Detect file encoding using chardet."""
    import chardet

    sample = file.read(10000)
    file.seek(0)

    result = chardet.detect(sample)
    return result.get('encoding', 'utf-8') or 'utf-8'


def detect_delimiter(file: BinaryIO, encoding: str = 'utf-8') -> str:
    """Detect CSV delimiter (comma, tab, semicolon, pipe)."""
    sample = file.read(2000)
    file.seek(0)

    text = sample.decode(encoding, errors='ignore')
    lines = text.split('\n')[:5]

    delimiters = [',', '\t', ';', '|']
    counts = {d: 0 for d in delimiters}

    for line in lines:
        for d in delimiters:
            counts[d] += line.count(d)

    # Return most common delimiter
    return max(counts.keys(), key=lambda d: counts[d])
```

---

## Definition of Done

- [ ] Fingerprinting works for Yardi
- [ ] Fingerprinting works for MRI
- [ ] Falls back to generic
- [ ] Confidence scores accurate

---

## Notes

The fingerprinting system is critical for automatic source detection. It allows users to just upload files without manually selecting the format. Pattern-based matching with confidence scores enables graceful fallback to the generic parser when no strong match is found.
