"""
Split content-matrix.csv into 4 batch files by pillar cluster.
Batch A: cam-math
Batch B: erp-workarounds + anti-integration
Batch C: war-stories + industry-news
Batch D: founder + product + engagement
"""
import csv
import json
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
MATRIX = str(SCRIPT_DIR / "content-matrix.csv")

batches = {"A": [], "B": [], "C": [], "D": []}
PILLAR_TO_BATCH = {
    "cam-math":         "A",
    "erp-workarounds":  "B",
    "anti-integration": "B",
    "war-stories":      "C",
    "industry-news":    "C",
    "founder":          "D",
    "product":          "D",
    "engagement":       "D",
}

with open(MATRIX, newline="", encoding="utf-8") as f:
    for row in csv.DictReader(f):
        b = PILLAR_TO_BATCH[row["pillar"]]
        batches[b].append(row)

for letter, rows in batches.items():
    path = str(SCRIPT_DIR / f"batch_{letter}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(rows, f, indent=2)
    print(f"Batch {letter}: {len(rows)} posts -> {path}")
