# Aivora — AI Desktop Assistant

<p align="center">
  <img src="./app-icon.svg" alt="Aivora" width="120" />
</p>

<h3 align="center">A floating AI assistant for your desktop</h3>

<p align="center">
  Aivora is a lightweight Windows desktop AI assistant built with Angular, Tauri, and a FastAPI backend.
  It combines a floating orb interface, AI chat, authentication, persistent conversations, screenshots, and automatic updates in a native desktop application.
</p>

<p align="center">
  <a href="https://github.com/devnamdev2003/ai-desktop-assistant/releases/latest"><strong>⬇️ Download Aivora for Windows</strong></a>
  &nbsp;•&nbsp;
  <a href="https://devnamdev2003.github.io/ai-desktop-assistant/public/notes"><strong>🎬 View Interactive Flow Slideshow</strong></a>
  &nbsp;•&nbsp;
  <a href="https://github.com/devnamdev2003/ai-desktop-assistant/releases">Releases</a>
  &nbsp;•&nbsp;
  <a href="https://github.com/devnamdev2003/ai-desktop-assistant">Source Code</a>
</p>

---

## ✨ What is Aivora?

Aivora is designed to keep an AI assistant available while you work, without forcing you to open a browser tab or switch between applications.

The application runs as a small, always-on-top floating orb. Interact with the orb to open the assistant, ask questions, work with AI-generated responses, and use desktop-oriented capabilities.

The project is built as a real desktop application rather than a browser-only Angular app.

## 🚀 Features

### 🫧 Floating AI Orb
- Minimal floating orb interface
- Transparent, frameless desktop window
- Always-on-top behavior
- Designed to stay accessible while other applications are open

### 💬 AI Assistant
- Chat with an AI assistant from the desktop
- Markdown-formatted responses
- Conversation history and saved chats
- Backend integration for server-side AI generation

### 🔐 Authentication
- Google OAuth 2.0 sign-in
- JWT-based authentication
- Short-lived access tokens
- Refresh-token rotation
- Session persistence and logout/revocation support

### 🗂️ Persistent Conversations
- Store conversations and messages in PostgreSQL
- Retrieve previous conversations
- Delete saved conversations
- User-specific chat history

### 📸 Desktop Capture
- Native desktop screenshot capability powered by Tauri
- Designed for future context-aware assistant workflows

### 🔄 Automatic Updates
- Tauri updater integration
- Signed update artifacts
- GitHub Releases-based update endpoint
- New versions can be delivered without reinstalling the application manually

### 🖥️ Native Windows Application
- Native desktop packaging through Tauri
- Windows x64 installer available
- Lightweight desktop shell compared with a traditional browser-based application

## 🧱 Architecture

Aivora uses a three-layer architecture. *(Explore each layer in the [Interactive Architecture Slideshow](https://devnamdev2003.github.io/ai-desktop-assistant/public/notes):

```text
┌───────────────────────────────────────────────┐
│                  Aivora Desktop               │
│                                               │
│  Angular UI  ──────── Tauri / Rust            │
│      │                    │                   │
│      │                    ├─ Native window    │
│      │                    ├─ Screenshots      │
│      │                    ├─ Deep links       │
│      │                    └─ Auto updater     │
│      │                                        │
└──────┼────────────────────────────────────────┘
       │ HTTP / API
       ▼
┌───────────────────────────────────────────────┐
│               FastAPI Backend                 │
│                                               │
│  Authentication  •  AI Chat  •  Users        │
│  Sessions        •  Conversations • Health    │
└──────┬────────────────────────────────────────┘
       │
       ▼
┌───────────────────────────────────────────────┐
│             PostgreSQL / Neon DB              │
│                                               │
│  Users • Sessions • Conversations • Messages │
└───────────────────────────────────────────────┘
```

### Main components

| Layer | Technology | Purpose |
|---|---|---|
| Desktop UI | Angular | Application interface and interactions |
| Desktop runtime | Tauri 2 + Rust | Native window, desktop APIs, packaging |
| Backend API | FastAPI | Authentication, chat, user/session APIs |
| Database | PostgreSQL | Users, sessions, conversations and messages |
| ORM / migrations | SQLAlchemy + Alembic | Database access and schema migrations |
| AI | Google Gemini API | AI response generation |
| Authentication | Google OAuth 2.0 + JWT | Sign-in and session security |
| Styling | Tailwind CSS + custom CSS | Application UI |
| Updates | Tauri Updater + GitHub Releases | Automatic application updates |

## 🛠️ Tech Stack

### Frontend
- Angular 21
- TypeScript
- Tailwind CSS 4
- RxJS
- Marked

### Desktop
- Tauri 2
- Rust
- Tauri HTTP plugin
- Tauri Updater plugin
- Tauri Deep Link plugin
- Tauri Opener plugin
- XCap for desktop capture

### Backend
- Python 3.10+
- FastAPI
- Uvicorn
- SQLAlchemy 2
- Alembic
- Pydantic
- PostgreSQL / Psycopg2
- Google Authentication
- Google Gemini SDK
- JWT / Passlib / Cryptography

### Development & Deployment
- npm
- GitHub
- GitHub Releases
- Docker / Docker Compose
- Neon PostgreSQL

## 📦 Download & Install

### Latest Windows Release

**Current release: Aivora v0.2.5**

[**⬇️ Download Aivora v0.2.5 for Windows (x64)**](https://github.com/devnamdev2003/ai-desktop-assistant/releases/download/v0.2.5/Aivora_0.2.5_x64-setup.exe)

Or visit the release page:

[**View all Aivora releases →**](https://github.com/devnamdev2003/ai-desktop-assistant/releases)

### Installation
1. Download the **Aivora x64 installer**.
2. Run `Aivora_0.2.5_x64-setup.exe`.
3. Complete the installation.
4. Launch **Aivora**.
5. The floating Aivora orb will appear on your desktop.

> **Windows note:** Aivora currently provides a Windows x64 installer. Other operating systems are not currently published as user-facing releases.

## 🔄 Automatic Updates

Aivora is configured with the Tauri Updater and GitHub Releases.

The application checks the configured release endpoint for update metadata:

```text
https://github.com/devnamdev2003/ai-desktop-assistant/releases/latest/download/latest.json
```

Release artifacts include:
- Windows installer
- Update signature
- `latest.json` update metadata

This allows future versions of Aivora to be distributed through GitHub Releases and picked up by the updater.

## 💻 Development Setup

### Prerequisites
- Node.js
- npm
- Python 3.10+
- Rust / Cargo
- Tauri prerequisites for your operating system
- PostgreSQL (local or hosted)

### Clone the repository
```bash
git clone https://github.com/devnamdev2003/ai-desktop-assistant.git
cd ai-desktop-assistant
```

### Install frontend dependencies
```bash
npm install
```

### Configure the backend
Copy `backend/.env.example` to `backend/.env` and configure the required values:

```env
DATABASE_URL=postgresql://...
JWT_SECRET_KEY=your-secure-secret
GEMINI_API_KEY=your-gemini-api-key

# Optional Google Sign-In configuration
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:8000/api/v1/auth/google/callback
```

For detailed backend configuration, see [`backend/README.md`](./backend/README.md).

### Install Python dependencies
```powershell
cd backend
python -m venv venv
venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Linux/macOS:
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Run database migrations
```bash
cd backend
alembic upgrade head
```

### Start the backend
```bash
cd backend
python run.py
```

The API is available at:
- `http://localhost:8000`
- Swagger: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

### Start the Angular development server
From the repository root:

```bash
npm run dev
```

The frontend runs on `http://localhost:3000`.

### Start Aivora as a desktop app
After the backend is running:

```bash
npx tauri dev
```

## 🏗️ Build the Desktop Application

Build the Angular production bundle:

```bash
npm run build
```

Build the native Tauri application:

```bash
npx tauri build
```

The generated release artifacts are produced by Tauri and can be published through GitHub Releases.

## 📁 Project Structure

```text
ai-desktop-assistant/
│
├── backend/                   # FastAPI backend
│   ├── app/
│   │   ├── api/               # API routes and dependencies
│   │   ├── core/              # Config, DB, security
│   │   ├── models/            # SQLAlchemy models
│   │   └── schemas/           # Pydantic schemas
│   ├── alembic/               # Database migrations
│   ├── .env.example           # Backend environment template
│   ├── requirements.txt       # Python dependencies
│   ├── docker-compose.yml     # Docker setup
│   ├── run.py                 # Backend runner
│   └── README.md              # Backend documentation
│
├── src/
│   └── app/                   # Angular application
│       ├── components/        # UI components
│       ├── services/          # Frontend services
│       ├── app.html           # Main application markup
│       ├── app.ts             # Main application logic
│       └── app.css            # Application styles
│
├── src-tauri/                 # Tauri / Rust desktop layer
│   ├── capabilities/          # Tauri permissions/capabilities
│   ├── icons/                 # Application icons
│   ├── src/                   # Rust desktop code
│   ├── tauri.conf.json        # Tauri configuration
│   └── Cargo.toml             # Rust dependencies
│
├── scripts/                   # Development/setup utilities
├── app-icon.svg               # Aivora application icon
├── latest.json                # Updater metadata
├── metadata.json              # Project metadata
├── angular.json
├── package.json
└── README.md
```

## 🔌 Backend API

The backend exposes APIs for:

| Area | Examples |
|---|---|
| Authentication | Google OAuth, token refresh, logout, current user |
| Users | Profile, avatar, active sessions |
| Chat | Send prompts, save conversations, load history |
| Health | Service and database health checks |

Full API documentation is available through FastAPI Swagger when the backend is running:

`http://localhost:8000/docs`

## 🔐 Security

Aivora's backend includes:
- Google OAuth 2.0 authentication
- JWT access tokens
- Refresh-token rotation
- Session tracking and revocation
- Environment-based secret configuration
- Server-side AI API integration

**Never commit your real `.env` file, API keys, OAuth secrets, JWT secrets, or database credentials.**

## 🧪 Testing

Frontend tests use Vitest through Angular's test tooling:

```bash
npm test
```

Backend API tests are located at `backend/test_api.py`.

## 🐳 Docker Backend

The backend includes Docker support:

```bash
cd backend
docker compose up --build
```

## 🗺️ Roadmap

Planned and evolving areas for Aivora include:
- More desktop-aware AI workflows
- Better context capture and assistance
- Expanded native desktop actions
- Improved conversation management
- Additional AI provider/model integrations
- More platform builds
- More polished onboarding and settings
- Continued security hardening

## 🤝 Contributing

Contributions, ideas, bug reports, and feature requests are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Make your changes.
4. Test the application.
5. Open a pull request with a clear description.

Please keep secrets out of commits and do not commit local environment files.

## 📄 License

A license file is not currently included in this repository. Until a license is added, the repository should not be assumed to grant permission to reuse, modify, or redistribute the code beyond the rights provided by GitHub's standard terms for viewing the repository.

## 🔗 Links
- **Repository:** https://github.com/devnamdev2003/ai-desktop-assistant
- **Latest Release:** https://github.com/devnamdev2003/ai-desktop-assistant/releases/latest
- **All Releases:** https://github.com/devnamdev2003/ai-desktop-assistant/releases
- **Windows Installer (v0.2.5):** https://github.com/devnamdev2003/ai-desktop-assistant/releases/download/v0.2.5/Aivora_0.2.5_x64-setup.exe
- **Backend Documentation:** [`backend/README.md`](./backend/README.md)

---

<p align="center">Built with ❤️ using Angular, Tauri, Rust, FastAPI, PostgreSQL, and Google Gemini.</p>