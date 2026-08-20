"""Upload generated lead magnets to the ``capveri-lead-magnets`` R2 bucket.

By default uploads only assets that are ``enabled=True`` in
``app.services.leads.asset_registry`` AND have a local file in
``docs/assets/`` matching the storage filename. Pass ``--include-disabled``
to also upload locally-present ``enabled=False`` assets — useful for staging
files in R2 ahead of flipping the registry flag.

Halts on the first wrangler failure. After all uploads succeed, performs one
round-trip ``wrangler r2 object get`` for one PDF and one XLSX to confirm the
objects are readable.
"""

from __future__ import annotations

import argparse
import pathlib
import shutil
import subprocess
import sys
import tempfile

R2_BUCKET = "capveri-lead-magnets"


def _ensure_repo_root_on_path() -> None:
    repo_root = pathlib.Path(__file__).resolve().parent.parent.parent.parent
    if str(repo_root) not in sys.path:
        sys.path.insert(0, str(repo_root))
    backend_root = repo_root / "backend"
    if str(backend_root) not in sys.path:
        sys.path.insert(0, str(backend_root))


def _docs_assets_dir() -> pathlib.Path:
    return (
        pathlib.Path(__file__).resolve().parent.parent.parent.parent / "docs" / "assets"
    )


def _wrangler_bin() -> list[str]:
    """Return the command prefix to invoke wrangler.

    Prefer a directly-installed ``wrangler`` (or ``wrangler.cmd`` on Windows);
    fall back to ``npx wrangler`` if not found.
    """
    direct = shutil.which("wrangler") or shutil.which("wrangler.cmd")
    if direct:
        return [direct]
    npx = shutil.which("npx") or shutil.which("npx.cmd")
    if npx:
        return [npx, "wrangler"]
    raise RuntimeError("Neither wrangler nor npx is on PATH; cannot upload to R2.")


def _run_wrangler(args: list[str]) -> None:
    cmd = _wrangler_bin() + args
    print(f"$ {' '.join(cmd)}")
    result = subprocess.run(
        cmd,
        text=True,
        capture_output=True,
        check=False,
        encoding="utf-8",
        errors="replace",
    )
    if result.stdout:
        print(result.stdout.rstrip())
    if result.stderr:
        print(result.stderr.rstrip(), file=sys.stderr)
    if result.returncode != 0:
        raise RuntimeError(f"wrangler exited {result.returncode}: {' '.join(cmd)}")


def upload(storage_path: str, local_file: pathlib.Path) -> None:
    _run_wrangler(
        [
            "r2",
            "object",
            "put",
            f"{R2_BUCKET}/{storage_path}",
            f"--file={local_file}",
            "--remote",
        ]
    )


def round_trip_get(storage_path: str, dest: pathlib.Path) -> None:
    _run_wrangler(
        [
            "r2",
            "object",
            "get",
            f"{R2_BUCKET}/{storage_path}",
            f"--file={dest}",
            "--remote",
        ]
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--include-disabled",
        action="store_true",
        help="Also upload assets whose registry entry is enabled=False, "
        "if a local file exists in docs/assets/.",
    )
    args = parser.parse_args()

    _ensure_repo_root_on_path()
    from app.services.leads.asset_registry import ASSETS  # noqa: E402

    docs_dir = _docs_assets_dir()
    if not docs_dir.exists():
        print(f"docs/assets/ not found at {docs_dir}", file=sys.stderr)
        return 2

    candidates: list[tuple[str, pathlib.Path]] = []
    skipped_disabled: list[str] = []
    skipped_missing: list[str] = []

    for slug, asset in ASSETS.items():
        if asset.format not in ("pdf", "xlsx"):
            continue
        local = docs_dir / pathlib.Path(asset.storage_path).name
        if not local.exists():
            skipped_missing.append(slug)
            continue
        if not asset.enabled and not args.include_disabled:
            skipped_disabled.append(slug)
            continue
        candidates.append((asset.storage_path, local))

    if not candidates:
        print("No assets to upload.", file=sys.stderr)
        return 1

    print(f"Uploading {len(candidates)} asset(s) to r2://{R2_BUCKET}/")
    if skipped_disabled:
        print(
            f"  (skipping {len(skipped_disabled)} disabled, "
            "pass --include-disabled to upload anyway)"
        )
    if skipped_missing:
        print(f"  (skipping {len(skipped_missing)} with no local file)")

    pdf_storage: str | None = None
    xlsx_storage: str | None = None
    for storage_path, local in candidates:
        upload(storage_path, local)
        if storage_path.endswith(".pdf") and pdf_storage is None:
            pdf_storage = storage_path
        elif storage_path.endswith(".xlsx") and xlsx_storage is None:
            xlsx_storage = storage_path

    print("\nVerifying with one round-trip GET per format...")
    with tempfile.TemporaryDirectory(prefix="capveri-r2-") as tmp:
        tmp_path = pathlib.Path(tmp)
        if pdf_storage:
            round_trip_get(pdf_storage, tmp_path / "check.pdf")
        if xlsx_storage:
            round_trip_get(xlsx_storage, tmp_path / "check.xlsx")
    print("Round-trip verification OK.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
