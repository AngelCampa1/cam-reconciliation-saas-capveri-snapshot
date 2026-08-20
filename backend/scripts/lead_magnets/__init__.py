"""Historical per-asset lead-magnet generators.

The canonical lead-magnet build, docs asset sync, manifest write, R2 upload,
and remote verification flow now lives in ``scripts/build_lead_magnets.py``.
Use that script for all current assets.

``build_all.py`` remains as a compatibility wrapper around the canonical
builder. The individual ``generate_<slug>.py`` modules are retained only as
historical references and should not be used for production refreshes.
"""
