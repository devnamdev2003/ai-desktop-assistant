#!/usr/bin/env python3
"""
Aivora Database Management Utility
Loads DATABASE_URL from .env and provides two primary operations:
  1) Reset all data in tables (TRUNCATE rows, preserve schema)
  2) Drop all tables if they exist and recreate the entire schema from scratch
"""

import os
import sys
import argparse
from urllib.parse import urlparse

# Ensure backend directory is in path
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)


def load_env_database_url():
    """Reads DATABASE_URL directly from backend/.env or root .env, or system env."""
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


def get_engine(db_url: str):
    """Initializes and returns a SQLAlchemy engine."""
    try:
        from sqlalchemy import create_engine
    except ImportError:
        print("\n❌ Error: 'SQLAlchemy' is not installed in your Python environment.")
        print("Please install requirements first:")
        print("   pip install -r backend/requirements.txt\n")
        sys.exit(1)

    # Normalize postgres:// to postgresql://
    normalized = db_url
    if normalized.startswith("postgres://"):
        normalized = normalized.replace("postgres://", "postgresql://", 1)

    return create_engine(normalized, pool_pre_ping=True)


DDL_SCHEMA = """
-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(255),
    avatar_url VARCHAR(1024),
    hashed_password VARCHAR(255),
    google_id VARCHAR(128) UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_superuser BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_users_id ON users(id);
CREATE INDEX IF NOT EXISTS ix_users_email ON users(email);
CREATE INDEX IF NOT EXISTS ix_users_google_id ON users(google_id);

-- 2. Refresh Tokens Table
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    revoked BOOLEAN NOT NULL DEFAULT false,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    device_info VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS ix_refresh_tokens_id ON refresh_tokens(id);
CREATE INDEX IF NOT EXISTS ix_refresh_tokens_token_hash ON refresh_tokens(token_hash);

-- 3. Conversations Table
CREATE TABLE IF NOT EXISTS conversations (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_conversations_id ON conversations(id);
CREATE INDEX IF NOT EXISTS ix_conversations_user_id ON conversations(user_id);

-- 4. Chat Messages Table
CREATE TABLE IF NOT EXISTS chat_messages (
    id VARCHAR(36) PRIMARY KEY,
    conversation_id VARCHAR(36) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role VARCHAR(32) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_chat_messages_id ON chat_messages(id);
CREATE INDEX IF NOT EXISTS ix_chat_messages_conversation_id ON chat_messages(conversation_id);
"""

DROP_SCHEMA = """
DROP TABLE IF EXISTS chat_messages CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;
DROP TABLE IF EXISTS refresh_tokens CASCADE;
DROP TABLE IF EXISTS users CASCADE;
"""


def option_1_clear_data(engine):
    """Option 1: Reset / Delete all data in tables while keeping tables."""
    from sqlalchemy import text
    print("\n" + "=" * 54)
    print("▶ OPTION 1: Clearing all table data (TRUNCATE)...")
    print("=" * 54)
    try:
        with engine.begin() as conn:
            try:
                conn.execute(text("TRUNCATE TABLE chat_messages, conversations, refresh_tokens, users RESTART IDENTITY CASCADE;"))
            except Exception:
                conn.execute(text("DELETE FROM chat_messages;"))
                conn.execute(text("DELETE FROM conversations;"))
                conn.execute(text("DELETE FROM refresh_tokens;"))
                conn.execute(text("DELETE FROM users;"))
        print("\n✔ Success: All table rows have been cleared.")
        print_status(engine)
    except Exception as exc:
        print(f"\n❌ Error clearing data: {exc}")
        sys.exit(1)


def option_2_recreate_schema(engine):
    """Option 2: Drop all tables if they exist and recreate from scratch."""
    from sqlalchemy import text
    print("\n" + "=" * 54)
    print("▶ OPTION 2: Dropping all tables & recreating from scratch...")
    print("=" * 54)
    try:
        with engine.begin() as conn:
            print("  1. Dropping existing tables (CASCADE)...")
            conn.execute(text(DROP_SCHEMA))
            print("  2. Recreating tables and indexes from scratch...")
            conn.execute(text(DDL_SCHEMA))
        print("\n✔ Success: All tables dropped and cleanly recreated.")
        print_status(engine)
    except Exception as exc:
        print(f"\n❌ Error recreating tables: {exc}")
        sys.exit(1)


def print_status(engine):
    """Prints current database connection and table counts."""
    from sqlalchemy import text
    print("\n--- Current Database Summary ---")
    tables = ["users", "refresh_tokens", "conversations", "chat_messages"]
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            print("Status: Connected to PostgreSQL")
            for t in tables:
                try:
                    res = conn.execute(text(f"SELECT COUNT(*) FROM {t}")).scalar()
                    print(f"  • {t.ljust(16)}: {res} rows")
                except Exception:
                    print(f"  • {t.ljust(16)}: (table does not exist)")
    except Exception as exc:
        print(f"Status: Connection failed -> {exc}")


def interactive_menu(engine, raw_url: str):
    masked = mask_db_url(raw_url)
    print("\n" + "=" * 56)
    print("         AIVORA DATABASE MANAGEMENT TOOL")
    print("=" * 56)
    print(f"Target Database: {masked}")
    print("\nPlease choose an option:")
    print("  [1] Reset all data in tables (TRUNCATE rows, keep schema)")
    print("  [2] Drop all tables and recreate from scratch (Clean setup)")
    print("  [3] Check database status and count rows")
    print("  [0] Exit")
    print("-" * 56)

    try:
        choice = input("Enter choice [1, 2, 3, or 0]: ").strip()
    except (KeyboardInterrupt, EOFError):
        print("\nCancelled.")
        return

    if choice == "1":
        option_1_clear_data(engine)
    elif choice == "2":
        option_2_recreate_schema(engine)
    elif choice == "3":
        print_status(engine)
    elif choice == "0":
        print("Exiting.")
    else:
        print("Invalid choice. Please run again with 1, 2, or 3.")


def main():
    parser = argparse.ArgumentParser(
        description="Aivora Database Manager (loads DATABASE_URL from .env)"
    )
    parser.add_argument(
        "action",
        nargs="?",
        choices=["1", "2", "3", "clear", "recreate", "reset", "status"],
        help="1 or clear: Truncate table data | 2 or recreate: Drop & recreate schema | 3 or status: Check status",
    )
    parser.add_argument(
        "--clear",
        action="store_true",
        help="Option 1: Reset all data in tables (keep tables intact)",
    )
    parser.add_argument(
        "--recreate",
        action="store_true",
        help="Option 2: Drop all tables if they exist and recreate from scratch",
    )
    parser.add_argument(
        "--status",
        action="store_true",
        help="Option 3: Show database connectivity and table counts",
    )

    args = parser.parse_args()

    db_url = load_env_database_url()
    if not db_url:
        print("\n❌ Error: No DATABASE_URL found.")
        print("Please define DATABASE_URL in backend/.env or your environment variables.")
        print("Example: DATABASE_URL=postgresql://postgres:postgres@localhost:5432/aivora\n")
        sys.exit(1)

    engine = get_engine(db_url)

    if args.clear or args.action in ["1", "clear"]:
        option_1_clear_data(engine)
    elif args.recreate or args.action in ["2", "recreate", "reset"]:
        option_2_recreate_schema(engine)
    elif args.status or args.action in ["3", "status"]:
        print_status(engine)
    else:
        interactive_menu(engine, db_url)


if __name__ == "__main__":
    main()
