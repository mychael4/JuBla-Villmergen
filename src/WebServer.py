#!/usr/bin/env python3
"""Compatibility wrapper that forwards to the project root server."""

import sys
from pathlib import Path

project_root = Path(__file__).resolve().parent.parent
server_file = project_root / 'server.py'

if not server_file.exists():
    raise SystemExit(f'Main server not found at {server_file}')

sys.path.insert(0, str(project_root))

from server import main

if __name__ == '__main__':
    main()
