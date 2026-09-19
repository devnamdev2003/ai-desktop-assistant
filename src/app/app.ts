import { Component, ElementRef, inject, signal, ViewChild } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow, LogicalSize, Window } from '@tauri-apps/api/window';
import { marked } from 'marked';
import { check } from '@tauri-apps/plugin-updater';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  formattedText?: SafeHtml | string;
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

  constructor() {
    this.checkForUpdates();
  }

  async checkForUpdates(): Promise<void> {
    const update = await check();

    if (update) {
      await update.downloadAndInstall();
    }
  }

  private readonly sanitizer = inject(DomSanitizer);

  @ViewChild('messagesContainer') private messagesContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('chatInput') private chatInputElement?: ElementRef<HTMLInputElement>;

  isExpanded = false;
  isMaximized = signal(false);
  inputText = signal('');
  isLoading = signal(false);
  messages = signal<ChatMessage[]>([]);
  copiedMessageId = signal<string | null>(null);
  errorMessage = signal<string | null>(null);
  showOrbContextMenu = signal(false);

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
        await win.setSize(new LogicalSize(180, 180));
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
    this.messages.set([]);
    this.errorMessage.set(null);
    this.inputText.set('');
    setTimeout(() => this.chatInputElement?.nativeElement?.focus(), 50);
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
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        text: answer,
        formattedText: this.formatAnswer(answer),
        timestamp: new Date(),
      };
      this.messages.update((list) => [...list, assistantMessage]);
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

  private async queryAi(question: string): Promise<string> {
    const payload = JSON.stringify({ question });
    const headers = {
      accept: '*/*',
      'Content-Type': 'application/json',
    };

    // 1. If running inside Tauri desktop, try Tauri's native HTTP plugin first!
    // This executes via Rust and bypasses all browser CORS restrictions and disallowed origin checks
    if (this.isTauriEnvironment()) {
      try {
        const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
        const res = await tauriFetch('https://fastapi-gemini-rag.vercel.app/ai', {
          method: 'POST',
          headers,
          body: payload,
        });

        if (res.ok) {
          const data = (await res.json()) as ApiResponse;
          if (data && typeof data.answer === 'string') {
            return data.answer;
          }
        }
      } catch (err) {
        console.warn('Tauri native HTTP fetch attempt failed, trying fallback:', err);
      }
    }

    // 2. Try proxied endpoint (dev server / preview proxy)
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers,
        body: payload,
      });

      if (res.ok) {
        const data = (await res.json()) as ApiResponse;
        if (data && typeof data.answer === 'string') {
          return data.answer;
        }
      }
    } catch {
      // Fall through to direct endpoint attempt
    }

    // 3. Direct FastAPI Vercel endpoint fallback
    const directRes = await fetch('https://fastapi-gemini-rag.vercel.app/ai', {
      method: 'POST',
      headers,
      body: payload,
    });

    if (!directRes.ok) {
      throw new Error(`Server returned ${directRes.status}`);
    }

    const directData = (await directRes.json()) as ApiResponse;
    if (directData && typeof directData.answer === 'string') {
      return directData.answer;
    }

    throw new Error('No answer found in response');
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
    if (event.button !== 0) {
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
