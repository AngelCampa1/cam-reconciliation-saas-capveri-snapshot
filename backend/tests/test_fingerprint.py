"""Tests for file fingerprinting functionality.

Tests verify:
- AC1: Reads first 4KB of file to detect patterns
- AC2: Recognizes Yardi Voyager GL export format
- AC3: Recognizes MRI rent roll format
- AC4: Returns confidence score for each parser
- AC5: Falls back to generic if no match
"""

from io import BytesIO

from app.services.ingestion import (
    FingerprintResult,
    detect_delimiter,
    detect_encoding,
    fingerprint_file,
)


class TestFingerprintFile:
    """Test the fingerprint_file function."""

    def test_detects_yardi_by_content(self):
        """AC2: Recognizes Yardi Voyager GL export format."""
        yardi_content = b"""
        Yardi Voyager Property Management System
        GL Detail Report
        Run Date: 12/15/2024
        Account Code,Description,Amount
        1000,Cash,1500.00
        """
        file = BytesIO(yardi_content)

        result = fingerprint_file(file, "export.csv")

        assert result.source_system == "yardi"
        assert result.confidence >= 0.5
        assert len(result.indicators) > 0

    def test_detects_yardi_by_filename_with_weak_content(self):
        """AC2: Yardi detected with filename hint + weak content patterns."""
        # Content has some generic patterns that boost score with filename
        content = b"Account Code,Description,Amount\n1000,Cash,500.00"
        file = BytesIO(content)

        result = fingerprint_file(file, "yardi_gl_export_2024.csv")

        assert result.source_system == "yardi"
        assert "filename:yardi" in result.indicators

    def test_filename_alone_returns_erp_with_low_confidence(self):
        """Filename hint returns ERP match with low confidence indicator."""
        # Very generic content with no ERP patterns in content
        generic_content = b"col1,col2\nval1,val2"
        file = BytesIO(generic_content)

        result = fingerprint_file(file, "yardi_export.csv")

        # Filename "yardi" gives 0.3 score - below 0.5 threshold but still
        # returns yardi (not generic) since some pattern was detected.
        # This prevents false positive generic detection for low-pattern ERP files.
        assert result.source_system == "yardi"
        assert result.confidence < 0.5  # Below threshold
        assert "below_threshold:low_confidence_match" in result.indicators

    def test_detects_mri_by_content(self):
        """AC3: Recognizes MRI rent roll format."""
        mri_content = b"""
        MRI Software Commercial Property Management
        PERIOD,REF NUM,SOURCE,ACCOUNT #,DEBIT,CREDIT
        202401,12345,AP,4000,1000.00,0.00
        """
        file = BytesIO(mri_content)

        result = fingerprint_file(file, "export.csv")

        assert result.source_system == "mri"
        assert result.confidence >= 0.5
        assert len(result.indicators) > 0

    def test_detects_mri_by_filename_with_weak_content(self):
        """AC3: MRI detected with filename hint + weak content patterns."""
        # Content has PERIOD which is an MRI pattern
        content = b"PERIOD,ACCOUNT,DEBIT,CREDIT\n202401,1000,500.00,0.00"
        file = BytesIO(content)

        result = fingerprint_file(file, "mri_rent_roll.csv")

        assert result.source_system == "mri"
        assert "filename:mri" in result.indicators

    def test_falls_back_to_generic(self):
        """AC5: Falls back to generic if no ERP patterns detected."""
        unknown_content = b"""
        Random spreadsheet data
        Column1,Column2,Column3
        value1,value2,value3
        """
        file = BytesIO(unknown_content)

        result = fingerprint_file(file, "data.csv")

        assert result.source_system == "generic"
        assert "No ERP patterns detected" in result.indicators

    def test_returns_confidence_score(self):
        """AC4: Returns confidence score for each parser."""
        content = b"Yardi Voyager GL Detail Report Run Date: 01/01/2024"
        file = BytesIO(content)

        result = fingerprint_file(file, "export.csv")

        assert isinstance(result, FingerprintResult)
        assert 0.0 <= result.confidence <= 1.0

    def test_resets_file_position(self):
        """AC1: File position is reset after reading header."""
        content = b"Some test content that should be readable after fingerprinting"
        file = BytesIO(content)

        fingerprint_file(file, "test.csv")

        # File position should be back at start
        assert file.tell() == 0
        assert file.read() == content

    def test_reads_only_first_4kb(self):
        """AC1: Only reads first 4KB for pattern matching."""
        # Create file larger than 4KB with pattern at end
        padding = b"x" * 5000
        content = padding + b"Yardi Voyager"  # Pattern after 4KB
        file = BytesIO(content)

        result = fingerprint_file(file, "test.csv")

        # Should not detect Yardi since pattern is after 4KB
        assert result.source_system == "generic"


class TestFingerprintResultNamedTuple:
    """Test FingerprintResult structure."""

    def test_namedtuple_fields(self):
        """FingerprintResult has correct fields."""
        result = FingerprintResult(
            source_system="yardi",
            confidence=0.85,
            indicators=["Yardi Voyager", "GL Detail"],
        )

        assert result.source_system == "yardi"
        assert result.confidence == 0.85
        assert result.indicators == ["Yardi Voyager", "GL Detail"]

    def test_namedtuple_unpacking(self):
        """FingerprintResult can be unpacked."""
        result = FingerprintResult("mri", 0.7, ["MRI Software"])

        source, confidence, indicators = result

        assert source == "mri"
        assert confidence == 0.7
        assert indicators == ["MRI Software"]

    def test_fingerprint_handles_invalid_utf8(self):
        """Fingerprint handles files with invalid UTF-8 sequences."""
        # Invalid UTF-8 bytes mixed with ASCII text
        content = b"Account,Description\n\x80\x81\x82,Some text\n"
        file = BytesIO(content)

        # Should not crash, should fall back to latin-1 decoding
        result = fingerprint_file(file, "test.csv")

        assert result.source_system == "generic"
        # File was successfully fingerprinted despite invalid UTF-8


class TestDetectDelimiter:
    """Test delimiter detection functionality."""

    def test_detects_comma(self):
        """Detects comma as delimiter."""
        content = b"col1,col2,col3\nval1,val2,val3\n"
        file = BytesIO(content)

        assert detect_delimiter(file) == ","

    def test_detects_tab(self):
        """Detects tab as delimiter."""
        content = b"col1\tcol2\tcol3\nval1\tval2\tval3\n"
        file = BytesIO(content)

        assert detect_delimiter(file) == "\t"

    def test_detects_semicolon(self):
        """Detects semicolon as delimiter (European CSV)."""
        content = b"col1;col2;col3\nval1;val2;val3\n"
        file = BytesIO(content)

        assert detect_delimiter(file) == ";"

    def test_detects_pipe(self):
        """Detects pipe as delimiter."""
        content = b"col1|col2|col3\nval1|val2|val3\n"
        file = BytesIO(content)

        assert detect_delimiter(file) == "|"

    def test_resets_file_position(self):
        """File position is reset after detection."""
        content = b"col1,col2\nval1,val2\n"
        file = BytesIO(content)

        detect_delimiter(file)

        assert file.tell() == 0


class TestDetectEncoding:
    """Test encoding detection functionality."""

    def test_detects_utf8(self):
        """Detects UTF-8 encoding."""
        content = b"Hello, World!"
        file = BytesIO(content)

        encoding = detect_encoding(file)

        # Should return utf-8 or compatible encoding
        assert encoding.lower() in ["utf-8", "ascii", "utf-8-sig"]

    def test_detects_utf8_with_bom(self):
        """Detects UTF-8 with BOM marker."""
        content = b"\xef\xbb\xbfHello, World!"
        file = BytesIO(content)

        encoding = detect_encoding(file)

        assert encoding.lower() in ["utf-8", "utf-8-sig"]

    def test_detects_non_utf8(self):
        """Falls back to latin-1 for non-UTF-8 content."""
        # Invalid UTF-8 sequence
        content = b"\x80\x81\x82 invalid utf8"
        file = BytesIO(content)

        encoding = detect_encoding(file)

        # Should fall back to latin-1 or be detected by chardet
        assert encoding is not None
        assert isinstance(encoding, str)

    def test_resets_file_position(self):
        """File position is reset after detection."""
        content = b"Test content"
        file = BytesIO(content)

        detect_encoding(file)

        assert file.tell() == 0

    def test_returns_string_encoding(self):
        """Always returns a string encoding."""
        file = BytesIO(b"simple ascii content")

        encoding = detect_encoding(file)

        assert encoding is not None
        assert isinstance(encoding, str)
        assert len(encoding) > 0

    def test_detects_utf16_le_with_bom(self):
        """Detects UTF-16 LE encoding with BOM marker."""
        # UTF-16 LE BOM: FF FE
        content = b"\xff\xfeH\x00e\x00l\x00l\x00o\x00"
        file = BytesIO(content)

        encoding = detect_encoding(file)

        assert "utf-16" in encoding.lower() or encoding.lower() == "utf-16-le"

    def test_detects_utf16_be_with_bom(self):
        """Detects UTF-16 BE encoding with BOM marker."""
        # UTF-16 BE BOM: FE FF
        content = b"\xfe\xff\x00H\x00e\x00l\x00l\x00o"
        file = BytesIO(content)

        encoding = detect_encoding(file)

        assert "utf-16" in encoding.lower() or encoding.lower() == "utf-16-be"
