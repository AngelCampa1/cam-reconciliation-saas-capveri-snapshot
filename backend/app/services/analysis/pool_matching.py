"""Pool name fuzzy matching using Levenshtein distance.

Handles renamed expense pools across years by finding best matches
based on string similarity.
"""

from Levenshtein import ratio as levenshtein_ratio

# Minimum similarity score required for a match (80%)
# Per CLAUDE.md specification: Use Levenshtein distance with 80% threshold
# This ensures only high-confidence matches (e.g., "Janitorial" → "Janitorial Services")
FUZZY_MATCH_THRESHOLD = 0.80


def find_pool_matches(
    source_pools: list[str],
    target_pools: list[str],
    threshold: float = FUZZY_MATCH_THRESHOLD,
) -> dict[str, str]:
    """Match pool names using Levenshtein distance.

    FIX AS-10: Prevents duplicate target assignments. When multiple source pools
    could match the same target, only the highest-scoring source gets the match.
    This prevents duplicate amounts in reconciliation.

    Args:
        source_pools: Pool names from source year
        target_pools: Pool names from target year
        threshold: Minimum similarity score (0.0-1.0), default 0.80

    Returns:
        Dictionary mapping source pool names to best matching target pool names.
        Only includes matches that meet or exceed the threshold.
        Each target pool can only be matched to one source pool (highest score wins).

    Example:
        >>> source = ["Janitorial", "Utilities"]
        >>> target = ["Janitorial Services", "Electric"]
        >>> find_pool_matches(source, target)
        {"Janitorial": "Janitorial Services"}
    """
    # FIX AS-10: Compute all match scores first, then assign greedily
    # This prevents two sources from matching the same target
    all_matches: list[tuple[str, str, float]] = []

    for source in source_pools:
        for target in target_pools:
            score = levenshtein_ratio(source.lower(), target.lower())
            if score >= threshold:
                all_matches.append((source, target, score))

    # Sort by score descending - highest scores get assigned first
    all_matches.sort(key=lambda x: x[2], reverse=True)

    # Greedily assign, tracking used sources and targets
    matches: dict[str, str] = {}
    used_targets: set[str] = set()

    for source, target, score in all_matches:
        # Skip if source already matched or target already used
        if source in matches or target in used_targets:
            continue
        matches[source] = target
        used_targets.add(target)

    return matches


class PoolMatcher:
    """Stateful pool matcher for year-over-year analysis.

    Maintains a mapping of matched pools and provides methods to
    retrieve matched values.
    """

    def __init__(
        self,
        source_pools: list[str],
        target_pools: list[str],
        threshold: float = FUZZY_MATCH_THRESHOLD,
    ):
        """Initialize the pool matcher.

        Args:
            source_pools: Pool names from source year
            target_pools: Pool names from target year
            threshold: Minimum similarity score (0.0-1.0)
        """
        self.source_pools = source_pools
        self.target_pools = target_pools
        self.threshold = threshold
        self._matches = find_pool_matches(source_pools, target_pools, threshold)

    @property
    def matches(self) -> dict[str, str]:
        """Get the computed matches."""
        return self._matches

    def get_match(self, source_pool: str) -> str | None:
        """Get the best match for a source pool name.

        Args:
            source_pool: Pool name from source year

        Returns:
            Matching pool name from target year, or None if no match found
        """
        return self._matches.get(source_pool)

    def is_matched(self, source_pool: str) -> bool:
        """Check if a source pool has a match.

        Args:
            source_pool: Pool name from source year

        Returns:
            True if a match was found
        """
        return source_pool in self._matches

    def get_unmatched_source(self) -> list[str]:
        """Get list of source pools with no matches.

        Returns:
            List of unmatched source pool names
        """
        return [pool for pool in self.source_pools if pool not in self._matches]

    def get_unmatched_target(self) -> list[str]:
        """Get list of target pools with no matches.

        Returns:
            List of unmatched target pool names (new pools in target year)
        """
        matched_targets = set(self._matches.values())
        return [pool for pool in self.target_pools if pool not in matched_targets]
