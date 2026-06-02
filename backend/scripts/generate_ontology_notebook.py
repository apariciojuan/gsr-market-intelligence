#!/usr/bin/env python3
"""Print manifest statistics for the ontology research dataset.

Usage (from backend/):
    python scripts/generate_ontology_notebook.py
    python scripts/generate_ontology_notebook.py --dataset-dir data/datasets/ontology
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DATA_DIR = BACKEND_ROOT / 'data' / 'datasets' / 'ontology'


def main() -> None:
    parser = argparse.ArgumentParser(
        description='Print dataset manifest summary (does not regenerate the notebook)'
    )
    parser.add_argument(
        '--dataset-dir',
        type=Path,
        default=DEFAULT_DATA_DIR,
        help='Path to dataset directory containing manifest.json',
    )
    args = parser.parse_args()

    manifest_path = args.dataset_dir / 'manifest.json'
    if not manifest_path.exists():
        print(f'Missing {manifest_path}. Run extract_market_datasets.py first.', file=sys.stderr)
        sys.exit(1)

    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    print(json.dumps(manifest, indent=2))


if __name__ == '__main__':
    main()
