"""Property-based invariants for the email/app video lookup helpers.

``services/email/videos.py`` is the canonical (generated) registry of @capveri
videos and the accessors that resolve a slug or a placement key into a video,
watch URL, or thumbnail. These back the YouTube embeds across transactional
emails, the app, and the marketing site, so a defect resolves to the wrong
video, a broken URL, or a silently missing embed.

This drives the real accessors (no mocks) against the live ``VIDEOS`` list as
its own oracle, over both real and arbitrary-unknown keys.

Invariants pinned here:

  * **Slug round-trip** — ``get_video`` returns the exact registered dict for
    every real slug and ``None`` for any non-registered string.
  * **URL builders** — ``get_watch_url`` / ``get_thumbnail_url`` return ``None``
    for unknown slugs and, for known ones, a watch URL ending in that video's
    youtube_id and the video's stored thumbnail respectively.
  * **Placement set** — ``get_videos_for_placement`` returns exactly the videos
    whose ``placements`` contain the key, in registry order, with no duplicates.
  * **First-placement agreement** — ``get_video_for_placement`` equals the first
    element of ``get_videos_for_placement`` (or ``None`` when that list is empty).

Run standalone:
    pytest tests/stress/test_email_videos_lookup_stress.py -q
"""

from __future__ import annotations

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.services.email.videos import (
    VIDEOS,
    get_thumbnail_url,
    get_video,
    get_video_for_placement,
    get_videos_for_placement,
    get_watch_url,
)

STRESS = settings(max_examples=200, deadline=None)

_REAL_SLUGS = [v["slug"] for v in VIDEOS]
_REAL_PLACEMENTS = sorted({p for v in VIDEOS for p in v["placements"]})

# A key that is guaranteed not to be a real slug or placement.
_unknown = st.text(max_size=20).filter(
    lambda s: s not in _REAL_SLUGS and s not in _REAL_PLACEMENTS
)


@STRESS
@given(slug=st.sampled_from(_REAL_SLUGS))
def test_known_slug_resolves_consistently(slug):
    video = get_video(slug)
    assert video is not None and video["slug"] == slug

    # Watch URL ends with this video's youtube id; thumbnail matches exactly.
    assert (
        get_watch_url(slug) == f"https://www.youtube.com/watch?v={video['youtube_id']}"
    )
    assert get_watch_url(slug).endswith(video["youtube_id"])
    assert get_thumbnail_url(slug) == video["thumbnail_url"]


@STRESS
@given(slug=_unknown)
def test_unknown_slug_is_none_everywhere(slug):
    assert get_video(slug) is None
    assert get_watch_url(slug) is None
    assert get_thumbnail_url(slug) is None


@STRESS
@given(placement=st.sampled_from(_REAL_PLACEMENTS))
def test_placement_set_matches_oracle(placement):
    got = get_videos_for_placement(placement)

    # Oracle: exactly the registry videos declaring this placement, in order.
    expected = [v for v in VIDEOS if placement in v["placements"]]
    assert got == expected
    # No duplicate slugs in the result.
    slugs = [v["slug"] for v in got]
    assert len(slugs) == len(set(slugs))

    # First-placement accessor agrees with the head of the list.
    first = get_video_for_placement(placement)
    assert first == (expected[0] if expected else None)


@STRESS
@given(placement=_unknown)
def test_unknown_placement_is_empty(placement):
    assert get_videos_for_placement(placement) == []
    assert get_video_for_placement(placement) is None


def test_every_registry_video_is_reachable_by_slug():
    """Anchor: the by-slug index is complete and 1:1 with the registry."""
    assert {v["slug"] for v in VIDEOS} == {s for s in _REAL_SLUGS}
    for v in VIDEOS:
        assert get_video(v["slug"]) is v


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
