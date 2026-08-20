
import base64, sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]  # scripts/oneoff -> repo root

data_b64 = sys.stdin.read().strip()
content = base64.b64decode(data_b64).decode('utf-8')
target = REPO_ROOT / 'backend' / 'app' / 'api' / 'routes' / 'webhooks.py'
with open(target, 'w', encoding='utf-8') as f:
    f.write(content)
print('Written', len(content.splitlines()), 'lines to', target)
