from typing import Generator
from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from app.core.config import settings

engine = create_engine(
    settings.normalized_database_url,
    pool_pre_ping=True,
    pool_recycle=300,
    echo=(settings.ENVIRONMENT == "development"),
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a SQLAlchemy database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Creates database tables if they do not already exist and ensures schema upgrades."""
    # Import all models here so that Base.metadata has registered them
    import app.models  # noqa: F401

    Base.metadata.create_all(bind=engine)

    # Ensure PostgreSQL columns exist (e.g. hashed_password if users table was created previously)
    try:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS hashed_password VARCHAR(255);"))
    except Exception:
        # Silently pass if non-postgres or already up-to-date
        pass


def reset_db() -> None:
    """Drops all tables and recreates them cleanly from scratch in PostgreSQL."""
    import app.models  # noqa: F401
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    print("✔ All PostgreSQL tables dropped and recreated from scratch successfully.")


def clear_all_data() -> None:
    """Truncates all data from all tables while keeping table structures intact."""
    import app.models  # noqa: F401
    with engine.begin() as conn:
        try:
            conn.execute(text("TRUNCATE TABLE chat_messages, conversations, refresh_tokens, users RESTART IDENTITY CASCADE;"))
        except Exception:
            # Fallback for DB engines that don't support multi-table cascade truncate
            conn.execute(text("DELETE FROM chat_messages;"))
            conn.execute(text("DELETE FROM conversations;"))
            conn.execute(text("DELETE FROM refresh_tokens;"))
            conn.execute(text("DELETE FROM users;"))
    print("✔ All data in tables has been successfully cleared.")

