# Aivora Assistant - Production FastAPI Backend

Scalable, asynchronous FastAPI backend for the **Aivora Desktop AI Assistant**. Built with **PostgreSQL (Neon)**, **Google OAuth 2.0**, secure **JWT Access/Refresh token rotation**, and session persistence.

---

## 🛠️ Architecture & Tech Stack

- **Framework**: [FastAPI](https://fastapi.tiangolo.com/) (Python 3.10+)
- **Database**: [PostgreSQL](https://www.postgresql.org/) (Hosted on Neon DB with SSL)
- **ORM**: [SQLAlchemy 2.0](https://www.sqlalchemy.org/) with declarative mapping and connection pooling
- **Migrations**: [Alembic](https://alembic.sqlalchemy.org/)
- **Authentication**:
  - Google OAuth 2.0 Login (`openid`, `email`, `profile`)
  - JWT Tokens (HS256) with short-lived access tokens & database-tracked refresh tokens
  - Refresh token rotation and instant revocation (`/logout`)
- **API Documentation**: Interactive Swagger UI (`/docs`) & ReDoc (`/redoc`)
- **Containerization**: Docker & Docker Compose

---

## 📁 Directory Structure

```text
backend/
├── alembic/                 # Database migration scripts
│   ├── versions/            # Migration versions
│   └── env.py               # Alembic configuration
├── app/
│   ├── api/
│   │   ├── deps.py          # Authentication & DB session dependencies
│   │   └── v1/
│   │       ├── endpoints/
│   │       │   ├── auth.py   # Google OAuth, JWT tokens, refresh, logout
│   │       │   ├── users.py  # User profile & active sessions
│   │       │   ├── chat.py   # AI Assistant chat & saved history
│   │       │   └── health.py # Health check & Neon DB connectivity
│   │       └── router.py    # v1 API Router
│   ├── core/
│   │   ├── config.py        # Pydantic Settings & environment manager
│   │   ├── database.py      # SQLAlchemy engine, session maker, base
│   │   └── security.py      # JWT creation/verification & hashing
│   ├── models/              # SQLAlchemy database models
│   │   ├── user.py          # User account schema
│   │   ├── session.py       # RefreshToken / session schema
│   │   └── chat.py          # Conversation & ChatMessage schemas
│   ├── schemas/             # Pydantic validation schemas (request/response)
│   └── main.py              # FastAPI application entrypoint & middleware
├── .env.example             # Example environment configuration
├── .env                     # Local environment file (git-ignored)
├── alembic.ini              # Alembic INI configuration
├── Dockerfile               # Production Docker container
├── docker-compose.yml       # Local container runner
├── requirements.txt         # Python dependencies
├── run.py                   # Development server runner
└── README.md                # Documentation
```

---

## ⚙️ Environment Configuration

Create a `.env` file in `backend/` (or use the pre-configured one):

```env
# Database Configuration (Neon PostgreSQL)
DATABASE_URL=

# JWT Configuration
JWT_SECRET_KEY=
JWT_ALGORITHM=
ACCESS_TOKEN_EXPIRE_MINUTES=
REFRESH_TOKEN_EXPIRE_DAYS=

# Server & Network
ENVIRONMENT=development
ALLOWED_ORIGINS=*
FASTAPI_PORT=8000
FRONTEND_URL=http://localhost:3000

# Google OAuth 2.0 Credentials
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
```

---

## 🚀 Local Development Setup

### 1. Create and Activate Virtual Environment

```bash
cd backend
python3 -m venv venv

# On Linux / macOS:
source venv/bin/activate

# On Windows (cmd):
venv\Scripts\activate.bat

# On Windows (PowerShell):
venv\Scripts\Activate.ps1
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Run Database Migrations

Apply Alembic migrations to create tables in your PostgreSQL database:

```bash
alembic upgrade head
```

*(Note: The server also auto-verifies and registers tables on startup via `init_db()` if needed).*

### 4. Start the FastAPI Server

```bash
python run.py
```
Or with `uvicorn`:
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

The API will be running at **http://localhost:8000**.
Interactive documentation:
- Swagger UI: **http://localhost:8000/docs**
- ReDoc: **http://localhost:8000/redoc**

---

## 🐳 Docker Deployment

To spin up the backend using Docker:

```bash
cd backend
docker compose up --build
```

---

## 🔑 Google OAuth 2.0 Configuration Guide

In your [Google Cloud Console](https://console.cloud.google.com/apis/credentials):
1. Navigate to **APIs & Services > Credentials**.
2. Select your **OAuth 2.0 Client ID** (Web application).
3. Under **Authorized JavaScript origins**, add:
   - `http://localhost:3000` (Angular Frontend / Tauri dev server)
   - `http://localhost:8000` (FastAPI backend)
4. Under **Authorized redirect URIs**, add:
   - `http://localhost:8000/api/v1/auth/google/callback`
   - `http://localhost:8000/api/v1/auth/google/callback`

---

## 📡 API Endpoints Overview

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/` | API status and root info | No |
| `GET` | `/api/v1/health` | Service & Neon DB health check | No |
| `GET` | `/api/v1/auth/google/url` | Get Google OAuth authorization URL | No |
| `GET` | `/api/v1/auth/google/callback` | Google OAuth code callback & redirect | No |
| `POST` | `/api/v1/auth/google/verify` | Direct ID token or code verification | No |
| `POST` | `/api/v1/auth/refresh` | Refresh JWT access token with rotation | No |
| `POST` | `/api/v1/auth/logout` | Revoke refresh token & end session | No |
| `GET` | `/api/v1/auth/me` | Fetch authenticated user details | **Bearer JWT** |
| `GET` | `/api/v1/users/me` | Fetch detailed user profile | **Bearer JWT** |
| `PATCH` | `/api/v1/users/me` | Update name or avatar URL | **Bearer JWT** |
| `GET` | `/api/v1/users/me/sessions` | List active sessions count | **Bearer JWT** |
| `POST` | `/api/v1/chat` | Send question to AI Assistant & save history | Optional Bearer |
| `GET` | `/api/v1/chat/conversations` | List user's saved conversations | **Bearer JWT** |
| `GET` | `/api/v1/chat/conversations/{id}`| Get conversation message history | **Bearer JWT** |
| `DELETE`| `/api/v1/chat/conversations/{id}`| Delete saved conversation | **Bearer JWT** |

---

## 💻 Independent Frontend & Backend Execution

You can run both concurrently:
- **FastAPI Backend**: `cd backend && python run.py` (running on port 8000)
- **Angular Frontend / Tauri**: `npm run dev` (running on port 3000) or `npx tauri dev`
