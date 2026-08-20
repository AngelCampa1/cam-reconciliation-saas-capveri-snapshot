from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parents[1]  # scripts/oneoff -> repo root

# One-off content stager: expects a scratch payload file named
# "wh_content.txt" next to this script (not checked into the repo).
source_path = SCRIPT_DIR / "wh_content.txt"
dest_path = REPO_ROOT / "backend" / "app" / "api" / "routes" / "webhooks.py"

with open(source_path, "r", encoding="utf-8") as f:
    content = f.read()
with open(dest_path, "w", encoding="utf-8") as f:
    f.write(content)
lines = content.splitlines()
print(f"Written {len(lines)} lines")
