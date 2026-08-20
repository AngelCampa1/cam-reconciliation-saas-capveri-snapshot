import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]  # scripts/oneoff -> repo root

# One-off content stager: expects a scratch payload file named
# "test_billing_webhooks_content.txt" next to this script (not checked
# into the repo).
source_path = Path(__file__).resolve().parent / "test_billing_webhooks_content.txt"
dest_path = REPO_ROOT / "backend" / "tests" / "integration" / "test_billing_webhooks.py"

content = open(source_path).read()

with open(dest_path, "w") as f:
    f.write(content)
print(f"Written {len(content)} chars to test_billing_webhooks.py")
