#!/usr/bin/env python3
"""Validate ontology dataset manifest quality gates."""

from __future__ import annotations

import json
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_MANIFEST = BACKEND_ROOT / 'data' / 'datasets' / 'ontology' / 'manifest.json'


def main() -> None:
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_MANIFEST
    if not path.exists():
        print(f'Manifest not found: {path}', file=sys.stderr)
        sys.exit(1)

    manifest = json.loads(path.read_text(encoding='utf-8'))
    if manifest.get('quality_passed'):
        print(f'OK: {path}')
        sys.exit(0)

    print(f'FAILED: {path}', file=sys.stderr)
    for item in manifest.get('quality_failures') or []:
        print(f'  - {item}', file=sys.stderr)
    sys.exit(1)


if __name__ == '__main__':
    main()
