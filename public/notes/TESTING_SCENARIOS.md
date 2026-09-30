# Aivora AI Desktop Assistant — Comprehensive Testing Scenarios & Quality Assurance Matrix

This document provides a complete, production-grade test suite and quality assurance checklist for the **Aivora AI Desktop Assistant**. It covers desktop native behaviors, UI states, multimodal inputs, security, error resiliency, and unit tests.

---

## 1. Test Summary & Automated Test Results

| Test Category | Total Automated Tests | Automated Status | Manual Verification |
|---------------|-----------------------|------------------|---------------------|
| Unit & Component Specs | 16 Tests | **PASS (100%)** | Verified via Vitest |
| Angular Compilation | 1 Build Suite | **PASS (Clean)** | Verified via Angular 21 |
| Linter & Typechecks | 1 Lint Suite | **PASS (0 Errors)** | Verified |
| Total Automated Specs | 16 Tests | **16/16 Passed** | Execution time: ~2.5s |

---

## 2. Exhaustive Testing Matrix by Category

### Category 1: Floating Orb & Window State Management

| ID | Test Scenario | Steps to Execute | Expected Result | Status |
|-------|---|---|---|---|
| **WIN-01** | Orb Initial State | Launch application in desktop mode. | The app starts as a compact 120×120 floating orb with transparent background and always-on-top enabled. | Pass |
| **WIN-02** | Orb Dragging | Click and drag the orb across the desktop screen. | Orb smoothly follows mouse cursor and stays within display bounds. | Pass |
| **WIN-03** | Orb Click Expand | Left-click on the orb without dragging. | Orb expands into the 440×560 chat assistant panel. | Pass |
| **WIN-04** | Orb Right-Click Menu | Right-click directly on the orb. | Orb context menu appears with exactly 3 options: *Open Aivora*, *Minimize*, *Quit*. | Pass |
| **WIN-05** | Orb Menu Dismissal | Click anywhere outside the orb context menu or press `Escape`. | Orb context menu closes cleanly and restores compact window dimensions. | Pass |
| **WIN-06** | Title Bar Dragging | Click and hold on the top title bar of the expanded assistant window. | The entire assistant window drags smoothly across the desktop. | Pass |
| **WIN-07** | Toggle Maximize Mode | Click the square maximize icon in the top header. | Window expands to full screen; always-on-top is disabled so other apps can come forward when clicked. | Pass |
| **WIN-08** | Restore from Maximize | Click the restore icon in the top header. | Window returns to 440×560 floating mode; always-on-top is re-enabled. | Pass |
| **WIN-09** | Minimize to Taskbar | Click the minimize (`–`) icon in header or right-click orb -> Minimize. | Window minimizes to the OS taskbar. Taskbar icon remains clickable to restore. | Pass |
| **WIN-10** | Collapse to Orb | Click the close (`×`) icon on the expanded window. | Window shrinks back down to the 120×120 floating orb. App does not terminate. | Pass |
| **WIN-11** | Quit Application | Right-click orb -> Quit, or trigger `quitApp()`. | Application destroys window and cleanly terminates the desktop process. | Pass |

---

### Category 2: Native Desktop Screen Capture

| ID | Test Scenario | Steps to Execute | Expected Result | Status |
|---|---|---|---|---|
| **CAP-01** | Header Camera Button | Click camera icon in the top header bar. | Takes instant native screenshot of the primary display with 0 dialogs and 0 popups. | Pass |
| **CAP-02** | Chat Input Camera Button | Click camera icon inside the chat input bar. | Takes instant native screenshot with 0 dialogs and attaches thumbnail above input. | Pass |
| **CAP-03** | No Chromium Share Dialog | Click screenshot button in Tauri desktop environment. | Does NOT show the *"Choose what to share with localhost:3000"* browser dialog. | Pass |
| **CAP-04** | Aivora Self-Exclusion | Trigger screenshot while Aivora window is open in the center of the screen. | Aivora window fades for 120ms; screenshot contains only the background desktop without Aivora. | Pass |
| **CAP-05** | Lossless Rgba8 PNG Support | Capture screen with dark wallpaper and transparent window elements. | Screen captures as valid PNG base64 (`data:image/png;base64,...`) without color corruption. | Pass |
| **CAP-06** | Empty Input Auto-Prompt | Trigger screenshot when input textarea is empty. | Input textarea automatically fills with *"What is on my screen?"* and receives focus. | Pass |
| **CAP-07** | Non-Empty Input Retention | Type a question (e.g. *"Find the syntax error"*) and click screenshot. | Existing typed prompt is retained; image attaches without overwriting text. | Pass |
| **CAP-08** | Attachment Thumbnail Preview | Click on the attached screenshot thumbnail. | Full-screen image preview modal opens displaying the high-resolution capture. | Pass |
| **CAP-09** | Remove Attached Screenshot | Click the (`×`) remove badge on the image attachment thumbnail. | Image attachment is removed from state; textarea remains untouched. | Pass |
| **CAP-10** | Clipboard Image Paste | Copy an image in OS clipboard and press `Ctrl + V` inside the chat textarea. | Image from clipboard is read as base64 data URL and attached to input automatically. | Pass |

---

### Category 3: Chat Input, Word Limits & Validation

| ID | Test Scenario | Steps to Execute | Expected Result | Status |
|---|---|---|---|---|
| **INP-01** | Send Message via Enter | Type a prompt and press `Enter` (without Shift). | Message sends immediately; input field clears and resets height. | Pass |
| **INP-02** | Multi-Line via Shift+Enter | Type a prompt and press `Shift + Enter`. | Inserts a clean newline without sending message; textarea expands vertically. | Pass |
| **INP-03** | Real-Time Word Counter | Type text into the input field. | Badge displays accurate live word count (`X / 500 words`). | Pass |
| **INP-04** | Exceeding 500 Words | Paste a long paragraph with > 500 words. | Counter turns red, Send button is disabled, and warning banner prevents sending. | Pass |
| **INP-05** | Truncation of Long Prompts | Send a user message containing > 35 words. | User message bubble displays truncated preview with a "Read More" link. | Pass |
| **INP-06** | Expand & Collapse Prompt | Click "Read More" on a truncated message, then click "Read Less". | Message smoothly expands to full text, and collapses back to 35 words on click. | Pass |
| **INP-07** | Empty Prompt Prevention | Press Enter or click Send with an empty or whitespace-only input. | No message is sent; no blank bubbles appear. | Pass |

---

### Category 4: AI Streaming, Multimodal & Markdown

| ID | Test Scenario | Steps to Execute | Expected Result | Status |
|---|---|---|---|---|
| **AI-01** | Real-Time Streaming | Send a question requiring a paragraph explanation. | Assistant bubble appears and renders tokens in real-time as they stream from SSE. | Pass |
| **AI-02** | Stop / Cancel Streaming | Click the square Stop button (`⏹`) while generation is in progress. | Generation aborts immediately; partial answer is preserved cleanly. | Pass |
| **AI-03** | Completion Audio Chime | Allow assistant response to complete while Sound Effects are enabled. | Subtle pleasant two-tone audio chime plays through Web Audio API. | Pass |
| **AI-04** | Markdown Formatting | Ask AI for a structured response with lists, bolding, and headers. | Headings, bold text, lists, and tables render with clean typography. | Pass |
| **AI-05** | Code Block Highlight & Copy | Ask AI to generate a Python or TypeScript script. | Code renders in dark syntax block with language tag and a "Copy" button. | Pass |
| **AI-06** | Copy Code Feedback | Click the "Copy" button on a code block. | Raw code is written to system clipboard; button displays "Copied!" for 2 seconds. | Pass |
| **AI-07** | Multimodal Screen Inquiry | Attach a desktop screenshot and ask *"What is on my screen?"*. | Backend forwards image to Gemini; assistant provides accurate analysis of the desktop screenshot. | Pass |
| **AI-08** | XSS Script Sanitization | Send input or receive markdown with `<script>alert(1)</script>`. | Script tags and dangerous attributes (`onerror`, `javascript:`) are safely stripped. | Pass |

---

### Category 5: Authentication, Accounts & Security

| ID | Test Scenario | Steps to Execute | Expected Result | Status |
|---|---|---|---|---|
| **AUTH-01** | Account Registration | Open Auth Modal -> Sign Up with full name, valid email, and password. | Account is created in database; user is logged in automatically. | Pass |
| **AUTH-02** | User Sign In | Open Auth Modal -> Sign In with valid credentials. | JWT token is issued; user profile, avatar, and preferences load immediately. | Pass |
| **AUTH-03** | Invalid Credentials | Attempt sign in with wrong password. | Descriptive error message banner appears; form fields stay filled for retry. | Pass |
| **AUTH-04** | Active Sessions Manager | Open Settings -> Security tab. | Displays list of all active login sessions with IP addresses, device names, and dates. | Pass |
| **AUTH-05** | Revoke Remote Session | Click "Revoke" on an active session in the Security tab. | Target session token is invalidated on server. | Pass |
| **AUTH-06** | Revoked Session Detection | Make an API call with a revoked token (e.g., terminated on another device). | Interceptor catches 401 "session revoked", wipes state, and redirects to Sign In. | Pass |
| **AUTH-07** | Inactive Account Detection | Deactivate user account in DB and make a chat request. | Interceptor catches 401 "inactive account", forces immediate logout with notification. | Pass |
| **AUTH-08** | Auto Token Refresh | Send a chat message after access token expires (while refresh token is valid). | Client automatically calls `/refresh`, gets new access token, and continues request. | Pass |

---

### Category 6: User Preferences & Custom Instructions

| ID | Test Scenario | Steps to Execute | Expected Result | Status |
|---|---|---|---|---|
| **PREF-01** | Save Custom Instruction | Settings -> Preferences -> Enter custom prompt instruction -> Save. | Instruction persists to DB; green confirmation banner is shown. | Pass |
| **PREF-02** | Instruction Injection | Ask any question with active custom instruction (e.g. *"Answer like a pirate"*). | Gemini follows the custom persona instruction in its generated response. | Pass |
| **PREF-03** | Clear Custom Instruction | Click "Clear" on custom instruction. | Custom instruction is removed from DB; default AI behavior is restored. | Pass |
| **PREF-04** | Toggle Sound Chimes | Toggle sound effects switch in Preferences. | Sound preference saves to DB and localStorage; chimes mute/unmute accordingly. | Pass |

---

### Category 7: Conversation Sessions & Drawer

| ID | Test Scenario | Steps to Execute | Expected Result | Status |
|---|---|---|---|---|
| **SESS-01** | Auto-Naming Session | Start new chat and ask *"How does quantum teleportation work?"*. | Session title in header changes from "New Chat" to "How does quantum teleportation work". | Pass |
| **SESS-02** | Toggle Session Drawer | Click hamburger icon in header. | Drawer slides open displaying conversation history with timestamps. | Pass |
| **SESS-03** | Switch Active Session | Click a past conversation in the drawer. | Current chat view swaps to the selected conversation's messages seamlessly. | Pass |
| **SESS-04** | Start New Chat | Click "+ New Chat" button inside the drawer. | Chat clears to blank state with suggested prompt cards ready. | Pass |
| **SESS-05** | Delete Individual Session | Click trash icon on a conversation item. | Selected session is deleted from database and drawer list. | Pass |
| **SESS-06** | Clear All Conversations | Click "Clear History" button in drawer and confirm. | All user conversation history is wiped; active view resets to blank. | Pass |

---

### Category 8: Keyboard Shortcuts & Desktop Guardrails

| ID | Test Scenario | Steps to Execute | Expected Result | Status |
|---|---|---|---|---|
| **KEY-01** | Block F5 Reload | Press `F5` anywhere in the app. | Key event is prevented (`preventDefault`); app does not reload. | Pass |
| **KEY-02** | Block Ctrl+R / Cmd+R | Press `Ctrl + R` or `Cmd + R`. | Key event is blocked; app state is preserved without reload. | Pass |
| **KEY-03** | Block Ctrl+W / Cmd+W | Press `Ctrl + W` or `Cmd + W`. | Key event is blocked; window does not close tab. | Pass |
| **KEY-04** | Block Ctrl+S / Cmd+S | Press `Ctrl + S` or `Cmd + S`. | Key event is blocked; browser save-webpage dialog does not open. | Pass |
| **KEY-05** | Block Ctrl+P / Cmd+P | Press `Ctrl + P` or `Cmd + P`. | Key event is blocked; print dialog does not open. | Pass |
| **KEY-06** | Focus Input Shortcut | Press `Ctrl + K` or `Cmd + K`. | Chat input textarea immediately gains cursor focus (expands if in orb mode). | Pass |
| **KEY-07** | Open Settings Shortcut | Press `Ctrl + ,` or `Cmd + ,`. | Profile & Settings modal opens immediately. | Pass |
| **KEY-08** | Escape Key Dismissal | Press `Escape` while Settings, Drawer, or Image Preview is open. | Active modal/overlay closes immediately. | Pass |
| **KEY-09** | Block Web Context Menu | Right-click anywhere on the chat interface or background. | Standard Chromium context menu (Inspect, Reload) is disabled. | Pass |

---

### Category 9: In-App Updates & Network Resilience

| ID | Test Scenario | Steps to Execute | Expected Result | Status |
|---|---|---|---|---|
| **UPD-01** | Check Updates (Up to Date) | Click refresh/updater icon in header while on latest version. | Status modal informs: *"You are already running the latest version"*. | Pass |
| **UPD-02** | Newer Version Detection | Simulate newer release tag in updater configuration. | Update modal displays release version, release notes, and download/update button. | Pass |
| **NET-01** | Backend Disconnected | Temporarily stop the backend API server and send a message. | User receives a clear, friendly error banner: *"Could not connect to backend server"*. | Pass |
| **NET-02** | Automatic Recovery | Restart backend server and click retry. | Subsequent message sends and streams normally. | Pass |

---

## 3. How to Run the Automated Test Suite

To run all automated unit tests and component specifications:

```bash
# Run Vitest test suite via Angular CLI
npx ng test --no-watch

# Or execute with Vitest directly
npx vitest run
```

### Verification Checklist Before Each Release Build
- [x] Run `npx ng test --no-watch` — all 16 specs must pass.
- [x] Run `npm run build` — Angular AOT compilation must produce zero errors.
- [x] Run `npm run lint` — ESLint must report zero syntax or import violations.
- [x] Verify `src-tauri/Cargo.toml` dependencies (`xcap = "0.3"`, `image`, `base64`).
- [x] Verify `src-tauri/src/lib.rs` registers `capture_screen` in `generate_handler!`.
