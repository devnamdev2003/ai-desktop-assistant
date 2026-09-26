#!/usr/bin/env python3
"""
Root-level shortcut for backend/manage_db.py
Allows running:
  python manage_db.py 1  (Clear all data)
  python manage_db.py 2  (Drop & recreate all tables)
"""
import os
import sys

backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")
manage_script = os.path.join(backend_dir, "manage_db.py")

if __name__ == "__main__":
    import subprocess
    sys.exit(subprocess.call([sys.executable, manage_script] + sys.argv[1:]))
