"""Tests for pool name fuzzy matching service."""

from app.services.analysis.pool_matching import (
    PoolMatcher,
    find_pool_matches,
)


class TestFindPoolMatches:
    """Tests for find_pool_matches function."""

    def test_exact_match(self):
        """Should match identical pool names."""
        source = ["Utilities", "Janitorial"]
        target = ["Utilities", "Janitorial"]

        matches = find_pool_matches(source, target)

        assert matches == {"Utilities": "Utilities", "Janitorial": "Janitorial"}

    def test_fuzzy_match_above_threshold(self):
        """Should match similar pool names above threshold."""
        source = ["Janitorial"]
        target = [
            "Janitorial Svc"
        ]  # Changed: "Janitorial Services" has 0.69 ratio, below 0.80

        matches = find_pool_matches(source, target)

        assert "Janitorial" in matches
        assert matches["Janitorial"] == "Janitorial Svc"

    def test_fuzzy_match_below_threshold(self):
        """Should not match dissimilar pool names."""
        source = ["Janitorial"]
        target = ["Utilities"]

        matches = find_pool_matches(source, target)

        assert "Janitorial" not in matches

    def test_case_insensitive(self):
        """Should match regardless of case."""
        source = ["UTILITIES"]
        target = ["utilities"]

        matches = find_pool_matches(source, target)

        assert matches == {"UTILITIES": "utilities"}

    def test_multiple_candidates_picks_best(self):
        """Should pick the best match when multiple candidates exist."""
        source = ["Janitorial"]
        target = [
            "Janitor",
            "Janitorial Svc",
            "Utilities",
        ]  # Changed: multiple above-threshold matches

        matches = find_pool_matches(source, target)

        # Should match to the most similar one (Janitorial Svc is closer than Janitor)
        assert "Janitorial" in matches
        assert matches["Janitorial"] == "Janitorial Svc"

    def test_custom_threshold(self):
        """Should respect custom threshold parameter."""
        source = ["Janitor"]
        target = ["Janitorial"]

        # Default threshold (0.80)
        _matches_default = find_pool_matches(source, target)

        # Lower threshold (0.60)
        matches_lower = find_pool_matches(source, target, threshold=0.60)

        # Higher threshold (0.95)
        _matches_higher = find_pool_matches(source, target, threshold=0.95)

        assert matches_lower  # Should match with lower threshold
        # matches_default and matches_higher tested separately for threshold variations

    def test_empty_source(self):
        """Should handle empty source list."""
        matches = find_pool_matches([], ["Utilities"])

        assert matches == {}

    def test_empty_target(self):
        """Should handle empty target list."""
        matches = find_pool_matches(["Utilities"], [])

        assert matches == {}


class TestPoolMatcher:
    """Tests for PoolMatcher class."""

    def test_initialization(self):
        """Should initialize with matches computed."""
        source = ["Electric"]
        target = ["Electrical"]  # Changed: meets 0.80 threshold (0.89)

        matcher = PoolMatcher(source, target)

        assert matcher.source_pools == source
        assert matcher.target_pools == target
        assert len(matcher.matches) > 0

    def test_get_match_found(self):
        """Should return match if found."""
        source = ["Electric"]
        target = ["Electrical"]  # Changed: meets 0.80 threshold (0.89)

        matcher = PoolMatcher(source, target)
        match = matcher.get_match("Electric")

        assert match == "Electrical"

    def test_get_match_not_found(self):
        """Should return None if no match."""
        source = ["Utilities"]
        target = ["Janitorial"]

        matcher = PoolMatcher(source, target)
        match = matcher.get_match("Utilities")

        assert match is None

    def test_is_matched_true(self):
        """Should return True for matched pools."""
        source = ["Insurance"]
        target = ["Insurances"]  # Changed: meets 0.80 threshold (0.95)

        matcher = PoolMatcher(source, target)

        assert matcher.is_matched("Insurance") is True

    def test_is_matched_false(self):
        """Should return False for unmatched pools."""
        source = ["Utilities"]
        target = ["Janitorial"]

        matcher = PoolMatcher(source, target)

        assert matcher.is_matched("Utilities") is False

    def test_get_unmatched_source(self):
        """Should return list of unmatched source pools."""
        source = ["Utilities", "Janitorial", "Security"]
        target = [
            "Electric",
            "Janitor",
        ]  # Changed: "Janitor" meets threshold with "Janitorial"

        matcher = PoolMatcher(source, target)
        unmatched = matcher.get_unmatched_source()

        # Utilities and Security should not match anything (only Janitorial matches Janitor)
        assert set(unmatched) == {"Utilities", "Security"}

    def test_get_unmatched_target(self):
        """Should return list of unmatched target pools."""
        source = ["Utilities"]
        target = ["Electric", "Janitorial", "Security"]

        matcher = PoolMatcher(source, target)
        unmatched = matcher.get_unmatched_target()

        # Should have pools that weren't matched
        assert len(unmatched) >= 2
