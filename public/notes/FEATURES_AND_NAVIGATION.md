# Aivora AI Desktop Assistant — Comprehensive Features & Navigation Guide

**Aivora** is an ultra-modern, lightweight, native AI desktop assistant built with **Tauri v2 (Rust)**, **Angular 21 (Zoneless + Signals + Tailwind CSS v4)**, and a high-performance **FastAPI backend** powered by **Google Gemini**.

---

## 1. System Architecture Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Aivora Desktop App                            │
├───────────────────────────────────┬────────────────────────────────────┤
│         Tauri v2 Native           │       Angular 21 Webview           │
│         (Rust Backend)            │       (Zoneless + Tailwind 4)      │
│  • Window management & dragging   │  • Reactive signals & state        │
│  • Native screen capture (xcap)   │  • Real-time SSE chat streaming    │
│  • In-app updater plugin          │  • Markdown & syntax highlighting  │
│  • Native OS tray & permissions   │  • Session drawer & Auth modal     │
└─────────────────┬─────────────────┴──────────────────┬─────────────────┘
                  │                                    │
                  ▼                                    ▼
       ┌──────────────────────┐             ┌─────────────────────┐
       │   FastAPI Backend    │             │   Google Gemini     │
       │   (Python 3.10+)     │────────────▶│   2.5 Flash Lite    │
       │ • SQLite + SQLAlchemy│             │ • Text & Multimodal │
       │ • JWT Authentication │             │ • Real-time SSE     │
       │ • Session & Prefs DB │             └─────────────────────┘
       └──────────────────────┘
```

---

## 2. Complete Feature Catalog

### 2.1. Dual-State Window Experience
1. **Compact Floating Orb Mode (120×120 px)**:
   - Floats unobtrusively on your desktop with transparent background.
   - **Always-on-top**: Stays pinned above games, IDEs, code editors, and browsers.
   - **Click & Drag**: Click and drag anywhere on the orb to reposition it anywhere across monitors.
   - **Left-Click**: Instantly toggles and expands into the full assistant chat panel.
   - **Right-Click Context Menu**:
     - **Open Aivora**: Expands the assistant window.
     - **Minimize**: Minimizes Aivora to the Windows taskbar.
     - **Quit**: Safely closes and terminates the application.
2. **Expanded Floating Panel Mode (440×560 px)**:
   - Sleek glassmorphism dark purple UI with subtle borders and shadows.
   - Pinned on top of other windows for quick lookups and coding assistance.
   - Draggable title bar (excluding buttons) for effortless repositioning.
3. **Maximized Fullscreen Mode**:
   - Expands to take advantage of the entire display for long code reviews, deep explanations, and reading.
   - Automatically disables "always-on-top" so switching to another app (e.g., browser or VS Code) naturally moves Aivora behind, just like standard desktop applications.
   - Restoring from maximized instantly re-enables "always-on-top" for the floating window.

---

### 2.2. Instant Native Desktop Screen Capture
* **0-Dialog, 0-Prompt Hardware Capture**:
  - Unlike web browsers that open Chromium's *"Choose what to share with localhost:3000"* prompt, Aivora captures your primary monitor natively in Rust using the `xcap` crate and Windows Graphics API.
  - **1-Click Execution**: Clicking the camera icon in either the header or chat input captures the screen in under 150 milliseconds.
* **Invisible Flicker Fix (Self-Exclusion)**:
  - When you trigger a screenshot, Aivora's window briefly fades to `0 opacity` for a fraction of a second before the capture is taken, and immediately restores visibility.
  - **Result**: Neither the chat window nor the orb appears in the screenshot—your desktop behind it is cleanly captured without closing or minimizing Aivora!
* **Lossless PNG Encoding**:
  - Captured display pixels in `Rgba8` format are encoded directly into clean PNG base64 strings (`data:image/png;base64,...`).
  - Text, code, terminal fonts, and UI details stay 100% sharp.
* **Automatic Input Prompt**:
  - Once captured, the screenshot thumbnail attaches to the input box with a preview button and a remove (`×`) button, automatically suggesting *"What is on my screen?"* if the text box is empty.

---

### 2.3. AI Chat & Real-Time Streaming
* **Server-Sent Events (SSE) Streaming**:
  - Assistant answers stream in token-by-token in real time for instant response perception.
  - A subtle glowing orb animation pulses while generation is active.
* **Stop Generation Button**:
  - While the AI is typing, the Send button transforms into an active Stop (`⏹`) button. Clicking it aborts the network request immediately via `AbortController`.
* **Audio Completion Chime**:
  - Plays a pleasant, subtle two-tone audio chime (synthesized cleanly via the Web Audio API) when the AI finishes streaming its response.
  - Can be toggled on/off in Settings.
* **Suggested Prompt Pills**:
  - Empty conversation states display categorized prompt cards (Code, Debug, Architecture, SQL, Science, Help).
  - Clicking any card immediately loads and sends the prompt.

---

### 2.4. Rich Markdown & Code Formatting
* **Full Markdown Support**:
  - Renders headings, bold, italic, blockquotes, unordered/ordered lists, and markdown tables.
* **Code Block Syntax Blocks**:
  - Automatically identifies programming languages (Python, TypeScript, SQL, Rust, Bash, HTML, etc.).
  - Styled dark code container with language tag and dedicated **Copy Code** button.
  - Clicking **Copy** copies raw source code to the system clipboard and toggles to *"Copied!"* with green feedback for 2 seconds.
* **Security & HTML Sanitization**:
  - Strict HTML sanitization scrubs dangerous elements (`<script>`, `<iframe>`, `javascript:` URIs, inline `onload` handlers) preventing XSS vulnerabilities.

---

### 2.5. Word Limiter & Long-Message Truncation
* **500-Word Input Limit**:
  - Real-time word counter badge displayed at the bottom right of the chat bar (`X / 500 words`).
  - If exceeded, sending is blocked and a red warning banner informs the user to trim their message.
* **Auto-Truncation for Long User Prompts**:
  - Any user message exceeding 35 words is automatically collapsed with a subtle gradient fade and a **"Read More"** link.
  - Clicking **"Read More"** expands the full message. Clicking **"Read Less"** collapses it back, preserving clean chat scroll readability.

---

### 2.6. User Accounts, Authentication & Security
* **Full JWT Authentication**:
  - Secure Sign In & Sign Up with full name, email, and password.
  - Access tokens stored in memory/storage with automatic background refresh on token expiration.
* **Security & Session Invalidation Guardrails**:
  - **Account Deactivation Detection**: If an account is marked inactive in the database, the global HTTP interceptor catches the 401 response, wipes credentials, and forces an immediate logout with a notification.
  - **Revoked Session Detection**: If a session was terminated from another device or revoked by an administrator, Aivora forces logout immediately without infinite retry loops.
  - **Active Login Sessions Tab**: View all active login sessions, devices, IP addresses, and revoke any unwanted session with 1 click.

---

### 2.7. User Profile & Custom Instructions
* **Custom AI Persona / Instructions**:
  - Users can enter personal custom instructions (e.g., *"Always write Python 3 code with type hints"*, *"Explain concepts like I am 10"*).
  - Stored permanently in the backend database and automatically injected into every AI conversation turn.
  - Includes **Save** and **Clear** actions with feedback notifications.
* **Sound Effects Preference**:
  - Toggle audio completion chimes; synced with user preferences in the database.

---

### 2.8. Conversation History & Multi-Session Drawer
* **Collapsible Sessions Drawer**:
  - Accessible via the hamburger menu icon in the top header.
  - Shows all past conversations with timestamps and message counts.
* **Smart Auto-Titling**:
  - Automatically generates a meaningful session title from the first question asked.
* **Session Actions**:
  - **Start New Chat**: Starts a blank conversation immediately.
  - **Switch Conversation**: Switches chat history instantly without reload.
  - **Delete Session**: Removes an individual conversation.
  - **Clear All History**: Wipes all past sessions with confirmation.

---

### 2.9. Desktop Keyboard Guardrails & Shortcuts
* **Blocked Unwanted Web Behaviors**:
  - `F5` / `Ctrl+R` / `Cmd+R`: Blocked (prevents accidental webview reloads).
  - `Ctrl+W` / `Cmd+W`: Blocked (prevents closing the webview tab).
  - `Ctrl+S` / `Cmd+S`: Blocked (prevents saving web page).
  - `Ctrl+P` / `Cmd+P`: Blocked (prevents print dialog).
  - Right-click context menu inside app: Blocked (prevents Chromium inspect/reload menus).
* **Productivity Shortcuts**:
  - `Enter`: Send message.
  - `Shift + Enter`: Multi-line break in textarea without sending.
  - `Ctrl + K` / `Cmd + K`: Instantly focus chat input bar (expands assistant if collapsed).
  - `Ctrl + ,` / `Cmd + ,`: Open Settings / Profile modal.
  - `Escape`: Close active modal, drawer, or orb context menu.

---

### 2.10. In-App Auto Updater
* **GitHub Releases Integration**:
  - Checks for newer versions against GitHub releases (`latest.json`).
  - Supports both native Tauri binary updates and fallback release notes dialog with direct download link.
* **Manual Check**:
  - Click the refresh/update icon in the top bar to verify whether you are on the latest release.

---

## 3. Step-by-Step Navigation & User Journey

### Navigation Flow Map

```
┌────────────────────────────────────────────────────────┐
│                   FLOATING ORB (120x120)               │
└───────────────────────────┬────────────────────────────┘
                            │ Left-Click
                            ▼
┌────────────────────────────────────────────────────────┐
│               EXPANDED CHAT PANEL (440x560)            │
├────────────┬─────────────────────────────┬─────────────┤
│ Left Icon  │ Center                      │ Right Icons │
│ [Sessions] │ Current Session Title       │ [Update]    │
│            │                             │ [Profile]   │
│            │                             │ [Camera]    │
│            │                             │ [Minimize]  │
│            │                             │ [Maximize]  │
│            │                             │ [Close/Orb] │
└─────┬──────┴─────────────────────────────┴──────┬──────┘
      │                                           │
      ▼                                           ▼
┌──────────────────┐                     ┌─────────────────────┐
│  Session Drawer  │                     │ Profile & Settings  │
│ • New Chat       │                     │ • Profile Details   │
│ • Past Sessions  │                     │ • Preferences       │
│ • Clear History  │                     │ • Active Sessions   │
└──────────────────┘                     └─────────────────────┘
```

### Detailed User Paths

#### Path 1: Taking an Instant Native Screenshot
1. Click the **Camera Icon** located in the top header or next to the chat input.
2. Aivora temporarily hides for 120ms to keep itself out of the capture.
3. The native Rust backend captures your primary monitor and returns the lossless PNG.
4. The image thumbnail appears directly above your chat input.
5. If the input is empty, *"What is on my screen?"* is suggested automatically.
6. Press **Enter** or click the purple **Send arrow** to analyze your screen with Gemini!

#### Path 2: Managing Conversations
1. Click the **Hamburger menu icon** (top-left of header).
2. The Session Drawer slides out.
3. Click **+ New Chat** to start a clean session.
4. Click any existing conversation to load its history.
5. Click the **Trash icon** next to a session to delete it.

#### Path 3: Configuring Custom Instructions
1. Press `Ctrl + ,` or click your **Avatar icon** in the top bar.
2. Select the **Preferences** tab.
3. In the **Custom AI Instruction** box, type your guidelines.
4. Click **Save Instruction**. A confirmation badge will display.
5. Close the modal by clicking the **×** button or pressing **Escape**.
