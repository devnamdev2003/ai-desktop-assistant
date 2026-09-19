import { Component, ElementRef, HostListener, signal, ViewChild } from '@angular/core';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { check } from '@tauri-apps/plugin-updater';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  formattedText?: string;
  timestamp: Date;
  isError?: boolean;
}

interface ApiResponse {
  question: string;
  answer: string;
}

interface AppWindow {
  setSize(size: LogicalSize): Promise<void>;
  center(): Promise<void>;
  startDragging(): Promise<void>;
}

function getAppWindow(): AppWindow {
  if (
    typeof window !== 'undefined' &&
    Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
  ) {
    try {
      return getCurrentWindow();
    } catch {
      // Fallback if Tauri internals cannot be initialized
    }
  }

  return {
    async setSize(_size: LogicalSize): Promise<void> { },
    async center(): Promise<void> { },
    async startDragging(): Promise<void> { },
  };
}

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
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

  private readonly window: AppWindow = getAppWindow();

  @ViewChild('messagesContainer') private messagesContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('chatInput') private chatInputElement?: ElementRef<HTMLInputElement>;

  isExpanded = false;
  inputText = signal('');
  isLoading = signal(false);
  messages = signal<ChatMessage[]>([]);
  copiedMessageId = signal<string | null>(null);
  errorMessage = signal<string | null>(null);

  suggestedQuestions = [
    'What can you help me with?',
    'Explain quantum computing simply',
    'Write a Python script to reverse a string',
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
      await this.window.setSize(new LogicalSize(440, 560));
      await this.window.center();
      setTimeout(() => {
        this.chatInputElement?.nativeElement?.focus();
        this.scrollToBottom();
      }, 100);
    } else {
      await this.window.setSize(new LogicalSize(180, 180));
      await this.window.center();
    }
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
        formattedText: `Sorry, I couldn't reach the AI server (<em>${this.escapeHtml(errText)}</em>). Please check your connection and try again.`,
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

    // 1. Try proxied endpoint first (prevents browser CORS preflight blocks in dev/web preview)
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

    // 2. Direct FastAPI Vercel endpoint fallback
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

  formatAnswer(text: string): string {
    if (!text) return '';
    let sanitized = this.escapeHtml(text);

    // Code blocks ```language\ncode```
    sanitized = sanitized.replace(
      /```(?:[a-zA-Z0-9_-]+)?\n?([\s\S]*?)```/g,
      '<pre class="my-2.5 overflow-x-auto rounded-xl border border-purple-500/20 bg-slate-900/90 p-3 font-mono text-xs text-purple-200"><code>$1</code></pre>'
    );

    // Inline code `code`
    sanitized = sanitized.replace(
      /`([^`]+)`/g,
      '<code class="rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs text-purple-300">$1</code>'
    );

    // Bold **text**
    sanitized = sanitized.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-white">$1</strong>');

    // Italics *text*
    sanitized = sanitized.replace(/\*([^*]+)\*/g, '<em class="italic text-purple-200/90">$1</em>');

    // Bullet points "- item" or "* item"
    sanitized = sanitized.replace(/^(?:[-*])\s+(.+)$/gm, '<span class="inline-block mr-1 text-purple-400">•</span>$1');

    // Numbered points "1. item"
    sanitized = sanitized.replace(/^(\d+\.)\s+(.+)$/gm, '<span class="font-medium text-purple-300">$1</span> $2');

    // Newlines to <br/>
    sanitized = sanitized.replace(/\n/g, '<br/>');

    return sanitized;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
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

    await this.window.startDragging();
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

  @HostListener('document:mousemove', ['$event'])
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

      await this.window.startDragging();
    }
  }

  @HostListener('document:mouseup')
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
}
