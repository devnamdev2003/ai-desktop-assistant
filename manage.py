#!/usr/bin/env python3
"""
Aivora Django-Style CLI Entry Point
Run directly from root:
  python manage.py makemigrations [message]
  python manage.py migrate
  python manage.py 1 (or clear)
  python manage.py 2 (or reset)
  python manage.py 3 (or status)
"""
import os
import sys

if __name__ == "__main__":
    backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")
    script = os.path.join(backend_dir, "manage_db.py")
    import subprocess
    sys.exit(subprocess.call([sys.executable, script] + sys.argv[1:]))
