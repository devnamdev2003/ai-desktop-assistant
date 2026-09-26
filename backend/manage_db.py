#!/usr/bin/env python3
"""
Aivora Django-Style Database Management CLI
Reads DATABASE_URL from .env and inspects app.models dynamically.
Zero hardcoded SQL or table names.

Supported Commands:
  python manage.py makemigrations [name] -> Autogenerates migration from model changes (Alembic)
  python manage.py migrate               -> Applies all migrations to database (Alembic upgrade head)
  python manage.py 1 (or clear)          -> Truncates/resets all data in all model tables
  python manage.py 2 (or reset)          -> Drops and recreates all tables from current models
  python manage.py 3 (or status)         -> Shows current database status and model row counts
"""

import os
import sys
import argparse
from urllib.parse import urlparse

# Ensure backend directory is in Python path
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)


def load_env_database_url():
    """Reads DATABASE_URL from backend/.env or root .env, or system env."""
    if os.environ.get("DATABASE_URL"):
        return os.environ.get("DATABASE_URL")

    env_paths = [
        os.path.join(BACKEND_DIR, ".env"),
        os.path.join(os.path.dirname(BACKEND_DIR), ".env"),
    ]

    for env_path in env_paths:
        if os.path.exists(env_path):
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue
                    if line.startswith("DATABASE_URL="):
                        val = line.split("=", 1)[1].strip().strip("'\"")
                        if val:
                            return val

    return ""


def mask_db_url(raw_url: str) -> str:
    """Masks database password for safe terminal output."""
    if not raw_url:
        return "[Not Configured in .env]"
    try:
        parsed = urlparse(raw_url)
        if parsed.password:
            return raw_url.replace(f":{parsed.password}@", ":******@")
        return raw_url
    except Exception:
        return raw_url[:15] + "..."


def get_engine():
    """Initializes SQLAlchemy engine and ensures models are imported."""
    try:
        from app.core.database import engine, Base
        import app.models  # noqa: F401
        return engine, Base
    except ImportError as e:
        print(f"\n❌ Error initializing database models: {e}")
        print("Ensure virtualenv dependencies are installed:")
        print("   pip install -r backend/requirements.txt\n")
        sys.exit(1)


def cmd_makemigrations(message: str = "auto_migration"):
    """Autogenerates a migration script based on changes in app.models (like Django makemigrations)."""
    print("\n" + "=" * 56)
    print("▶ Running 'makemigrations' via Alembic autogenerate...")
    print("=" * 56)
    import subprocess
    alembic_ini = os.path.join(BACKEND_DIR, "alembic.ini")
    cmd = [
        sys.executable,
        "-m",
        "alembic",
        "-c",
        alembic_ini,
        "revision",
        "--autogenerate",
        "-m",
        message,
    ]
    res = subprocess.run(cmd, cwd=BACKEND_DIR)
    if res.returncode == 0:
        print("\n✔ Migration file generated successfully in backend/alembic/versions/")
    else:
        print("\n❌ makemigrations failed. Check the error output above.")
        sys.exit(res.returncode)


def cmd_migrate():
    """Applies all pending migrations to the database (like Django migrate)."""
    print("\n" + "=" * 56)
    print("▶ Running 'migrate' via Alembic upgrade head...")
    print("=" * 56)
    import subprocess
    alembic_ini = os.path.join(BACKEND_DIR, "alembic.ini")
    cmd = [
        sys.executable,
        "-m",
        "alembic",
        "-c",
        alembic_ini,
        "upgrade",
        "head",
    ]
    res = subprocess.run(cmd, cwd=BACKEND_DIR)
    if res.returncode == 0:
        print("\n✔ All migrations applied successfully.")
        cmd_status()
    else:
        print("\n❌ migrate failed. Check the error output above.")
        sys.exit(res.returncode)


def cmd_clear():
    """Option 1: Reset / Delete all data in tables dynamically from Base.metadata."""
    print("\n" + "=" * 56)
    print("▶ OPTION 1: Clearing all table data (TRUNCATE)...")
    print("=" * 56)
    from app.core.database import clear_all_data
    try:
        clear_all_data()
        cmd_status()
    except Exception as exc:
        print(f"\n❌ Error clearing table data: {exc}")
        sys.exit(1)


def cmd_recreate():
    """Option 2: Drop all tables and recreate from scratch using current models."""
    print("\n" + "=" * 56)
    print("▶ OPTION 2: Dropping all tables & recreating from current models...")
    print("=" * 56)
    from app.core.database import reset_db
    import subprocess
    try:
        reset_db()
        # Stamp alembic head so migrations match current schema
        alembic_ini = os.path.join(BACKEND_DIR, "alembic.ini")
        subprocess.run(
            [sys.executable, "-m", "alembic", "-c", alembic_ini, "stamp", "head"],
            cwd=BACKEND_DIR,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        print("✔ Database schema created and synced with Alembic.")
        cmd_status()
    except Exception as exc:
        print(f"\n❌ Error recreating tables: {exc}")
        sys.exit(1)


def cmd_status():
    """Prints current database connection, registered models, and row counts."""
    from sqlalchemy import text
    engine, Base = get_engine()
    print("\n--- Current Database & Model Summary ---")
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            print("Status: Connected to PostgreSQL")
            tables = Base.metadata.sorted_tables
            if not tables:
                print("  No tables defined in Base.metadata.")
            for table in tables:
                try:
                    res = conn.execute(text(f'SELECT COUNT(*) FROM "{table.name}"')).scalar()
                    print(f'  • {table.name.ljust(20)}: {res} rows')
                except Exception:
                    print(f'  • {table.name.ljust(20)}: (table not created in DB yet)')
    except Exception as exc:
        print(f"Status: Connection failed -> {exc}")


def interactive_menu(raw_url: str):
    masked = mask_db_url(raw_url)
    print("\n" + "=" * 56)
    print("         AIVORA DATABASE MANAGEMENT TOOL")
    print("=" * 56)
    print(f"Target Database: {masked}")
    print("\nChoose an option:")
    print("  [1] Reset all data in tables (TRUNCATE rows, keep schema)")
    print("  [2] Drop all tables and recreate from scratch (Clean setup)")
    print("  [3] Migrate (alembic upgrade head)")
    print("  [4] Make migrations (alembic revision --autogenerate)")
    print("  [5] Check database status and count rows")
    print("  [0] Exit")
    print("-" * 56)

    try:
        choice = input("Enter choice [1-5, or 0]: ").strip()
    except (KeyboardInterrupt, EOFError):
        print("\nCancelled.")
        return

    if choice == "1":
        cmd_clear()
    elif choice == "2":
        cmd_recreate()
    elif choice == "3":
        cmd_migrate()
    elif choice == "4":
        msg = input("Migration message (default: auto_migration): ").strip() or "auto_migration"
        cmd_makemigrations(msg)
    elif choice == "5":
        cmd_status()
    elif choice == "0":
        print("Exiting.")
    else:
        print("Invalid choice.")


def main():
    parser = argparse.ArgumentParser(
        description="Aivora Django-Style Database CLI (Dynamic Models & Alembic)"
    )
    parser.add_argument(
        "command",
        nargs="?",
        choices=[
            "1", "clear",
            "2", "reset", "recreate",
            "3", "status",
            "makemigrations",
            "migrate",
        ],
        help="Command to run: 1/clear, 2/reset, 3/status, makemigrations, migrate",
    )
    parser.add_argument(
        "-m", "--message",
        default="auto_migration",
        help="Message description for makemigrations",
    )

    args = parser.parse_args()

    db_url = load_env_database_url()
    if not db_url:
        print("\n❌ Error: No DATABASE_URL found in backend/.env or environment variables.")
        sys.exit(1)

    cmd = args.command
    if cmd in ["1", "clear"]:
        cmd_clear()
    elif cmd in ["2", "reset", "recreate"]:
        cmd_recreate()
    elif cmd == "makemigrations":
        cmd_makemigrations(args.message)
    elif cmd == "migrate":
        cmd_migrate()
    elif cmd in ["3", "status"]:
        cmd_status()
    else:
        interactive_menu(db_url)


if __name__ == "__main__":
    main()
