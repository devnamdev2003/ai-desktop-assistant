import { Component, ElementRef, inject, signal, ViewChild } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow, LogicalSize, Window } from '@tauri-apps/api/window';
import { marked } from 'marked';
import { check, Update } from '@tauri-apps/plugin-updater';
import { AuthService, UserProfile } from './services/auth';

export interface UpdateInfo {
  version: string;
  notes?: string;
  date?: string;
  currentVersion?: string;
  downloadUrl?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  formattedText?: SafeHtml | string;
  isStreaming?: boolean;
  timestamp: Date;
  isError?: boolean;
}

interface ApiResponse {
  question: string;
  answer: string;
}

export interface PromptSuggestion {
  title: string;
  desc: string;
  prompt: string;
  tag: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Configure marked with GitHub Flavored Markdown, line breaks, and enhanced code blocks
marked.use({
  gfm: true,
  breaks: true,
  renderer: {
    code({ text, lang }: { text: string; lang?: string }): string {
      const language = (lang || '').trim();
      const displayLang = language || 'code';
      const encodedCode = encodeURIComponent(text);
      const escapedCode = escapeHtml(text);

      return (
        `<div class="code-block" data-code-block="true">` +
        `<div class="code-block-header">` +
        `<span class="code-block-lang">${escapeHtml(displayLang)}</span>` +
        `<button type="button" class="copy-code-btn" data-code="${encodedCode}">` +
        `<svg class="w-3 h-3 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">` +
        `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />` +
        `</svg>` +
        `<span class="copy-label pointer-events-none">Copy</span>` +
        `</button>` +
        `</div>` +
        `<pre><code>${escapedCode}</code></pre>` +
        `</div>`
      );
    },
    link({ href, title, text }: { href: string; title?: string | null; text: string }): string {
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
      return `<a href="${href}" target="_blank" rel="noopener noreferrer"${titleAttr}>${text}</a>`;
    },
  },
});

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
  host: {
    '(document:mousemove)': 'handleMouseMove($event)',
    '(document:mouseup)': 'handleMouseUp()',
    '(click)': 'handleGlobalClick($event)',
  },
})
export class App {

  private readonly sanitizer = inject(DomSanitizer);

  @ViewChild('messagesContainer') private messagesContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('chatInput') private chatInputElement?: ElementRef<HTMLInputElement>;

  isExpanded = typeof window !== 'undefined' ? !this.isTauriEnvironment() : false;
  isMaximized = signal(false);
  inputText = signal('');
  isLoading = signal(false);
  messages = signal<ChatMessage[]>([]);
  copiedMessageId = signal<string | null>(null);
  errorMessage = signal<string | null>(null);
  showOrbContextMenu = signal(false);
  isStreamingActive = signal(false);
  private activeStreamTimer: ReturnType<typeof setTimeout> | null = null;

  // App Update State
  currentAppVersion = signal('0.1.2');
  isCheckingUpdate = signal(false);
  isInstallingUpdate = signal(false);
  availableUpdate = signal<UpdateInfo | null>(null);
  updateStatusMessage = signal<string | null>(null);
  updateDownloadedBytes = signal<number>(0);
  updateTotalBytes = signal<number>(0);
  showUpdateModal = signal(false);
  private tauriUpdateHandle: Update | null = null;

  // Authentication & Backend State
  authService = inject(AuthService);
  showAuthModal = signal(false);
  testApiResult = signal<string | null>(null);
  isTestingApi = signal(false);
  manualTokenInput = signal('');
  manualCodeOrUrlInput = signal('');

  constructor() {
    if (typeof document !== 'undefined' && this.isTauriEnvironment()) {
      document.body.classList.add('is-tauri');
    }
    this.checkForUpdates(false);
  }

  /**
   * Check for app updates against GitHub releases / Tauri updater endpoint.
   * If manual is true, user-facing notifications/modals will be shown.
   */
  async checkForUpdates(manual: boolean = false): Promise<void> {
    this.isCheckingUpdate.set(true);
    this.updateStatusMessage.set(null);

    // 1. If running inside Tauri desktop, use the native updater plugin
    if (this.isTauriEnvironment()) {
      try {
        const update = await check();
        if (update) {
          this.tauriUpdateHandle = update;
          this.availableUpdate.set({
            version: update.version,
            currentVersion: update.currentVersion || this.currentAppVersion(),
            notes: update.body || 'A new version with performance improvements and updates is available.',
            date: update.date,
          });
          if (manual) {
            this.showUpdateModal.set(true);
          }
        } else {
          this.availableUpdate.set(null);
          this.tauriUpdateHandle = null;
          if (manual) {
            this.updateStatusMessage.set(`You are already running the latest version (v${this.currentAppVersion()}).`);
            this.showUpdateModal.set(true);
          }
        }
      } catch (err) {
        console.warn('Tauri update check failed, trying fallback:', err);
        await this.checkFallbackRelease(manual);
      } finally {
        this.isCheckingUpdate.set(false);
      }
      return;
    }

    // 2. Web or browser environment: fetch latest.json from GitHub releases
    await this.checkFallbackRelease(manual);
  }

  private async checkFallbackRelease(manual: boolean): Promise<void> {
    try {
      const response = await fetch(
        'https://raw.githubusercontent.com/devnamdev2003/ai-desktop-assistant/main/latest.json?t=' + Date.now()
      );
      if (response.ok) {
        const data = await response.json();
        const latestVersion = data.version;
        const current = this.currentAppVersion();

        if (latestVersion && this.isVersionNewer(latestVersion, current)) {
          const downloadUrl =
            data.platforms?.['windows-x86_64']?.url ||
            'https://github.com/devnamdev2003/ai-desktop-assistant/releases/latest';

          this.availableUpdate.set({
            version: latestVersion,
            currentVersion: current,
            notes: data.notes || 'Includes new features, fixes, and performance updates.',
            date: data.pub_date,
            downloadUrl,
          });
          if (manual) {
            this.showUpdateModal.set(true);
          }
        } else {
          this.availableUpdate.set(null);
          if (manual) {
            this.updateStatusMessage.set(`You are already running the latest version (v${current}).`);
            this.showUpdateModal.set(true);
          }
        }
      } else {
        throw new Error('Failed to load release metadata');
      }
    } catch (err) {
      console.warn('Fallback update check error:', err);
      if (manual) {
        this.updateStatusMessage.set('Could not fetch update info. Please check your internet connection.');
        this.showUpdateModal.set(true);
      }
    } finally {
      this.isCheckingUpdate.set(false);
    }
  }

  private isVersionNewer(latest: string, current: string): boolean {
    const lParts = latest.split('.').map((p) => parseInt(p, 10) || 0);
    const cParts = current.split('.').map((p) => parseInt(p, 10) || 0);
    const maxLen = Math.max(lParts.length, cParts.length);

    for (let i = 0; i < maxLen; i++) {
      const l = lParts[i] ?? 0;
      const c = cParts[i] ?? 0;
      if (l > c) return true;
      if (l < c) return false;
    }
    return false;
  }

  /**
   * Triggers download and installation of the latest release.
   */
  async updateToLatestRelease(): Promise<void> {
    const updateInfo = this.availableUpdate();
    if (!updateInfo) {
      return;
    }

    this.isInstallingUpdate.set(true);
    this.updateStatusMessage.set('Downloading and applying update...');

    if (this.isTauriEnvironment() && this.tauriUpdateHandle) {
      try {
        let downloaded = 0;
        let total = 0;

        await this.tauriUpdateHandle.downloadAndInstall(
          (event) => {
            if (event.event === 'Started') {
              total = event.data.contentLength ?? 0;
              this.updateTotalBytes.set(total);
            } else if (event.event === 'Progress') {
              downloaded += event.data.chunkLength;
              this.updateDownloadedBytes.set(downloaded);
              if (total > 0) {
                const pct = Math.round((downloaded / total) * 100);
                this.updateStatusMessage.set(`Downloading update: ${pct}%`);
              }
            } else if (event.event === 'Finished') {
              this.updateStatusMessage.set('Installing update and relaunching app...');
            }
          },
          { restartAfterInstall: true }
        );
      } catch (err) {
        console.error('Tauri download and install failed:', err);
        this.updateStatusMessage.set('Update failed: ' + (err instanceof Error ? err.message : String(err)));
        this.isInstallingUpdate.set(false);
      }
      return;
    }

    // Web / Direct Download
    const downloadUrl =
      updateInfo.downloadUrl ||
      'https://github.com/devnamdev2003/ai-desktop-assistant/releases/latest';

    this.updateStatusMessage.set('Redirecting to the latest release installer...');
    setTimeout(() => {
      window.open(downloadUrl, '_blank', 'noopener,noreferrer');
      this.isInstallingUpdate.set(false);
    }, 800);
  }

  openUpdateModal(): void {
    this.showUpdateModal.set(true);
  }

  closeUpdateModal(): void {
    this.showUpdateModal.set(false);
  }

  openAuthModal(): void {
    this.showAuthModal.set(true);
    this.testApiResult.set(null);
    this.authService.checkBackendHealth();
  }

  closeAuthModal(): void {
    this.showAuthModal.set(false);
    this.testApiResult.set(null);
  }

  loginWithGoogle(): void {
    this.authService.startGoogleLogin();
  }

  logout(): void {
    this.authService.logout();
    this.testApiResult.set(null);
  }

  async testProtectedEndpoint(): Promise<void> {
    this.isTestingApi.set(true);
    this.testApiResult.set(null);
    try {
      const user = await this.authService.fetchCurrentUser();
      if (user) {
        this.testApiResult.set(`Authenticated as: ${user.email} (ID: ${user.id})`);
      } else {
        this.testApiResult.set('Verification failed: Token rejected or expired.');
      }
    } catch (err: any) {
      this.testApiResult.set(`Error: ${err.message || 'Failed to call endpoint'}`);
    } finally {
      this.isTestingApi.set(false);
    }
  }

  async verifyManualToken(): Promise<void> {
    const token = this.manualTokenInput().trim();
    if (!token) return;
    const success = await this.authService.verifyGoogleIdToken(token);
    if (success) {
      this.manualTokenInput.set('');
    }
  }

  async redeemCodeOrUrl(): Promise<void> {
    const val = this.manualCodeOrUrlInput().trim();
    if (!val) return;
    const success = await this.authService.exchangeGoogleCode(val);
    if (success) {
      this.manualCodeOrUrlInput.set('');
    }
  }

  /**
   * Dynamically retrieves the active Tauri window if running in Tauri desktop,
   * avoiding premature initialization issues when Angular bootstraps.
   */
  private getTauriWindow(): Window | null {
    if (typeof window === 'undefined') {
      return null;
    }
    try {
      if (
        isTauri() ||
        Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) ||
        Boolean((window as unknown as { isTauri?: boolean }).isTauri)
      ) {
        return getCurrentWindow();
      }
    } catch (err) {
      console.warn('Unable to get Tauri window instance:', err);
    }
    return null;
  }

  /**
   * Safely execute an operation on the Tauri desktop window with error handling
   */
  private async safeWindowOp(fn: (win: Window) => Promise<void>): Promise<void> {
    const win = this.getTauriWindow();
    if (!win) {
      return;
    }
    try {
      await fn(win);
    } catch (err) {
      console.warn('Tauri window operation failed:', err);
    }
  }

  isTauriEnvironment(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }
    return Boolean(
      isTauri() ||
      (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ ||
      (window as unknown as { isTauri?: boolean }).isTauri
    );
  }

  compactSuggestions: PromptSuggestion[] = [
    {
      title: 'Explain quantum computing',
      desc: 'Break down complex physics concepts simply',
      prompt: 'Explain quantum computing in simple terms with an intuitive analogy.',
      tag: 'Science',
    },
    {
      title: 'Reverse a string in Python',
      desc: 'Provide clear code examples and explanations',
      prompt: 'Write a Python script to reverse a string with multiple practical methods.',
      tag: 'Code',
    },
    {
      title: 'What can you help me with?',
      desc: 'Discover Aivora AI capabilities and tools',
      prompt: 'What can you help me with as an AI assistant?',
      tag: 'Help',
    },
  ];

  fullSuggestions: PromptSuggestion[] = [
    {
      title: 'Explain quantum computing',
      desc: 'Break down complex physics concepts simply',
      prompt: 'Explain quantum computing in simple terms with an intuitive analogy.',
      tag: 'Science',
    },
    {
      title: 'Reverse a string in Python',
      desc: 'Provide clear code examples and explanations',
      prompt: 'Write a Python script to reverse a string with multiple practical methods.',
      tag: 'Code',
    },
    {
      title: 'Debug async JavaScript',
      desc: 'Fix common Promise and async/await pitfalls',
      prompt: 'Explain common Promise and async/await pitfalls in JavaScript with code solutions.',
      tag: 'Debug',
    },
    {
      title: 'Design a RESTful API',
      desc: 'Clean endpoints and schema architecture',
      prompt: 'What are the best practices for designing a clean, scalable RESTful API?',
      tag: 'API',
    },
    {
      title: 'Optimize SQL queries',
      desc: 'Indexing strategies and execution plans',
      prompt: 'How do I optimize slow SQL database queries using indexes and execution plans?',
      tag: 'Database',
    },
    {
      title: 'What can you help me with?',
      desc: 'Discover Aivora AI capabilities and tools',
      prompt: 'What can you help me with as an AI assistant?',
      tag: 'Help',
    },
  ];

  // Orb click/drag state
  private orbMouseDown = false;
  private orbDragging = false;
  private orbStartX = 0;
  private orbStartY = 0;
  private suppressNextOrbClick = false;

  async toggleAssistant(): Promise<void> {
    this.isExpanded = !this.isExpanded;

    if (this.isExpanded) {
      await this.safeWindowOp(async (win) => {
        try {
          await win.setResizable(true);
        } catch { }

        if (this.isMaximized()) {
          try {
            await win.maximize();
          } catch {
            await win.setSize(new LogicalSize(1100, 750));
            await win.center();
          }
        } else {
          await win.setSize(new LogicalSize(440, 560));
          await win.center();
        }
      });

      setTimeout(() => {
        this.chatInputElement?.nativeElement?.focus();
        this.scrollToBottom();
      }, 100);
    } else {
      await this.safeWindowOp(async (win) => {
        if (this.isMaximized()) {
          try {
            await win.unmaximize();
          } catch { }
        }
        await win.setSize(new LogicalSize(120, 120));
        await win.center();
      });
      this.isMaximized.set(false);
    }
  }

  async toggleMaximize(): Promise<void> {
    const nextState = !this.isMaximized();
    this.isMaximized.set(nextState);

    await this.safeWindowOp(async (win) => {
      try {
        await win.setResizable(true);
      } catch { }

      if (nextState) {
        try {
          await win.maximize();
        } catch {
          // In case desktop environment restricts borderless window maximize, expand to large size
          await win.setSize(new LogicalSize(1100, 750));
          await win.center();
        }
      } else {
        try {
          await win.unmaximize();
        } catch { }
        await win.setSize(new LogicalSize(440, 560));
        await win.center();
      }
    });

    this.scrollToBottom();
    setTimeout(() => this.chatInputElement?.nativeElement?.focus(), 50);
  }

  onInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.inputText.set(input.value);
  }

  useSuggestion(suggestion: string): void {
    this.sendMessage(suggestion);
  }

  clearChat(): void {
    if (this.activeStreamTimer) {
      clearTimeout(this.activeStreamTimer);
      this.activeStreamTimer = null;
    }
    this.isStreamingActive.set(false);
    this.messages.set([]);
    this.errorMessage.set(null);
    this.inputText.set('');
    setTimeout(() => this.chatInputElement?.nativeElement?.focus(), 50);
  }

  cancelStreaming(): void {
    if (this.activeStreamTimer) {
      clearTimeout(this.activeStreamTimer);
      this.activeStreamTimer = null;
    }
    this.isStreamingActive.set(false);
    this.messages.update((msgs) =>
      msgs.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m))
    );
  }

  async copyMessage(msg: ChatMessage): Promise<void> {
    try {
      await navigator.clipboard.writeText(msg.text);
      this.copiedMessageId.set(msg.id);
      setTimeout(() => {
        if (this.copiedMessageId() === msg.id) {
          this.copiedMessageId.set(null);
        }
      }, 2000);
    } catch {
      // Ignore clipboard write failures
    }
  }

  async sendMessage(customText?: string): Promise<void> {
    if (!this.authService.isAuthenticated()) {
      this.openAuthModal();
      return;
    }

    if (this.isStreamingActive()) {
      this.cancelStreaming();
      return;
    }

    const questionText = (customText ?? this.inputText()).trim();
    if (!questionText || this.isLoading()) {
      return;
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: questionText,
      timestamp: new Date(),
    };

    this.messages.update((list) => [...list, userMessage]);
    this.inputText.set('');
    if (this.chatInputElement?.nativeElement) {
      this.chatInputElement.nativeElement.value = '';
    }
    this.errorMessage.set(null);
    this.isLoading.set(true);
    this.scrollToBottom();

    try {
      const answer = await this.queryAi(questionText);
      this.isLoading.set(false);
      await this.streamAssistantResponse(answer);
    } catch (err: unknown) {
      const errText = err instanceof Error ? err.message : 'Failed to communicate with AI';
      this.errorMessage.set(errText);
      const errorMessageObj: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'assistant',
        text: `Sorry, I couldn't reach the AI server (${errText}). Please try again.`,
        formattedText: this.sanitizer.bypassSecurityTrustHtml(
          `Sorry, I couldn't reach the AI server (<em>${escapeHtml(errText)}</em>). Please check your connection and try again.`
        ),
        timestamp: new Date(),
        isError: true,
      };
      this.messages.update((list) => [...list, errorMessageObj]);
    } finally {
      this.isLoading.set(false);
      this.scrollToBottom();
      setTimeout(() => this.chatInputElement?.nativeElement?.focus(), 50);
    }
  }

  /**
   * Streams the assistant's answer chunk-by-chunk to create a natural typing effect.
   */
  private async streamAssistantResponse(fullText: string): Promise<void> {
    const assistantId = `assistant-${Date.now()}`;
    const initialMessage: ChatMessage = {
      id: assistantId,
      sender: 'assistant',
      text: '',
      formattedText: '',
      isStreaming: true,
      timestamp: new Date(),
    };

    this.messages.update((prev) => [...prev, initialMessage]);
    this.isStreamingActive.set(true);
    this.scrollToBottom();

    return new Promise<void>((resolve) => {
      let currentIndex = 0;
      const totalLength = fullText.length;

      const getChunkSize = (): number => {
        if (totalLength > 1200) {
          return Math.floor(Math.random() * 8) + 8;
        } else if (totalLength > 400) {
          return Math.floor(Math.random() * 5) + 4;
        }
        return Math.floor(Math.random() * 3) + 2;
      };

      const tick = () => {
        if (currentIndex < totalLength) {
          const remaining = totalLength - currentIndex;
          const step = Math.min(getChunkSize(), remaining);
          currentIndex += step;

          const currentText = fullText.slice(0, currentIndex);
          const formatted = this.formatAnswer(currentText);
          const isDone = currentIndex >= totalLength;

          this.messages.update((msgs) =>
            msgs.map((m) =>
              m.id === assistantId
                ? {
                  ...m,
                  text: currentText,
                  formattedText: formatted,
                  isStreaming: !isDone,
                }
                : m
            )
          );

          this.scrollToBottom();

          if (!isDone) {
            const lastChar = currentText.slice(-1);
            let delay = 18;
            if (['.', '!', '?', '\n'].includes(lastChar)) {
              delay = 45;
            } else if ([',', ';', ':'].includes(lastChar)) {
              delay = 28;
            }
            this.activeStreamTimer = setTimeout(tick, delay);
          } else {
            this.isStreamingActive.set(false);
            this.activeStreamTimer = null;
            resolve();
          }
        } else {
          this.isStreamingActive.set(false);
          this.activeStreamTimer = null;
          resolve();
        }
      };

      this.activeStreamTimer = setTimeout(tick, 15);
    });
  }

  private async queryAi(question: string): Promise<string> {
    if (!this.authService.isAuthenticated()) {
      this.openAuthModal();
      throw new Error('Authentication required: Only authenticated users can access Aivora.');
    }

    const payload = JSON.stringify({ question });
    const authHeaders = {
      accept: 'application/json',
      'Content-Type': 'application/json',
      ...this.authService.getAuthorizationHeader(),
    };

    // Query authenticated FastAPI backend endpoint exclusively
    let res: Response | null = null;
    try {
      res = await fetch('/api/v1/chat', {
        method: 'POST',
        headers: authHeaders,
        body: payload,
      });
    } catch {
      // Direct backend port check if dev server proxy not running
      try {
        res = await fetch('http://localhost:8000/api/v1/chat', {
          method: 'POST',
          headers: authHeaders,
          body: payload,
        });
      } catch {
        res = null;
      }
    }

    if (!res) {
      throw new Error('FastAPI backend is offline. Please start the backend on port 8000 to access Aivora.');
    }

    if (res.status === 401) {
      // Session expired: attempt automatic refresh once
      const refreshed = await this.authService.refreshSession();
      if (refreshed) {
        return this.queryAi(question);
      }
      this.openAuthModal();
      throw new Error('Your authentication session has expired. Please sign in again.');
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || `Backend error: status ${res.status}`);
    }

    const data = (await res.json()) as ApiResponse;
    if (data && typeof data.answer === 'string') {
      return data.answer;
    }

    throw new Error('No valid answer returned by backend');
  }

  formatAnswer(text: string): SafeHtml {
    if (!text) return '';
    try {
      const parsed = marked.parse(text, { async: false }) as string;
      return this.sanitizer.bypassSecurityTrustHtml(parsed);
    } catch (e) {
      console.warn('Error parsing markdown:', e);
      return this.sanitizer.bypassSecurityTrustHtml(escapeHtml(text));
    }
  }

  handleGlobalClick(event: MouseEvent): void {
    if (this.showOrbContextMenu()) {
      this.showOrbContextMenu.set(false);
    }

    const target = event.target as HTMLElement;
    const btn = target.closest('.copy-code-btn') as HTMLButtonElement | null;
    if (btn) {
      event.preventDefault();
      event.stopPropagation();
      const codeAttr = btn.getAttribute('data-code');
      if (codeAttr) {
        try {
          const rawCode = decodeURIComponent(codeAttr);
          navigator.clipboard.writeText(rawCode).then(() => {
            btn.classList.add('copied');
            const label = btn.querySelector('.copy-label');
            if (label) {
              label.textContent = 'Copied!';
            }
            setTimeout(() => {
              btn.classList.remove('copied');
              if (label) {
                label.textContent = 'Copy';
              }
            }, 2000);
          });
        } catch (err) {
          console.warn('Clipboard write failed:', err);
        }
      }
    }
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      if (this.messagesContainer?.nativeElement) {
        this.messagesContainer.nativeElement.scrollTo({
          top: this.messagesContainer.nativeElement.scrollHeight,
          behavior: 'smooth',
        });
      }
    }, 50);
  }

  // -----------------------------
  // Expanded panel dragging
  // -----------------------------

  async startDragging(event: MouseEvent): Promise<void> {
    if (event.button !== 0 || this.isMaximized()) {
      return;
    }

    await this.safeWindowOp(async (win) => {
      await win.startDragging();
    });
  }

  // -----------------------------
  // Collapsed orb
  // Click = open
  // Drag = move
  // -----------------------------

  startOrbInteraction(event: MouseEvent): void {
    if (event.button !== 0) {
      return;
    }

    this.orbMouseDown = true;
    this.orbDragging = false;
    this.suppressNextOrbClick = false;

    this.orbStartX = event.clientX;
    this.orbStartY = event.clientY;
  }

  async handleMouseMove(event: MouseEvent): Promise<void> {
    if (!this.orbMouseDown || this.orbDragging) {
      return;
    }

    const deltaX = Math.abs(event.clientX - this.orbStartX);
    const deltaY = Math.abs(event.clientY - this.orbStartY);

    // Small movement = still considered a click
    // Larger movement = start dragging
    if (deltaX > 5 || deltaY > 5) {
      this.orbDragging = true;
      this.suppressNextOrbClick = true;

      await this.safeWindowOp(async (win) => {
        await win.startDragging();
      });
    }
  }

  handleMouseUp(): void {
    this.orbMouseDown = false;
  }

  handleOrbClick(): void {
    if (this.suppressNextOrbClick) {
      this.suppressNextOrbClick = false;
      return;
    }

    this.toggleAssistant();
  }

  onOrbContextMenu(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.showOrbContextMenu.set(true);
  }

  closeOrbContextMenu(): void {
    this.showOrbContextMenu.set(false);
  }

  async quitApp(event?: Event): Promise<void> {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    this.showOrbContextMenu.set(false);

    await this.safeWindowOp(async (win) => {
      try {
        await win.close();
      } catch (closeErr) {
        console.warn('win.close() encountered error, attempting win.destroy():', closeErr);
        try {
          await win.destroy();
        } catch (destroyErr) {
          console.error('win.destroy() failed:', destroyErr);
        }
      }
    });

    // In web preview fallback
    if (!this.isTauriEnvironment()) {
      this.isExpanded = false;
    }
  }
}
