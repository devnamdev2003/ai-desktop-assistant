import { Injectable, signal, computed } from '@angular/core';
import { environment } from '../../environments/environment';

declare global {
  interface Window {
    __AIVORA_API_URL__?: string;
    __AIVORA_MAX_INPUT_WORDS__?: number;
    __AIVORA_USER_MESSAGE_TRUNCATE_WORDS__?: number;
  }
}

@Injectable({
  providedIn: 'root',
})
export class ConfigService {
  private readonly STORAGE_KEY = 'aivora_api_base_url';
  private readonly WORDS_LIMIT_KEY = 'aivora_max_input_words';

  // Reactive signal for the API Base URL used across the application
  apiUrl = signal<string>(this.resolveInitialApiUrl());

  // Reactive signal for maximum words allowed per chat message (fetched from environment / .env default)
  maxInputWords = signal<number>(this.resolveInitialMaxWords());

  // Truncate limit for user message preview before minimize/maximize toggle (30 to 40 words, default 35)
  userMessageTruncateWords = signal<number>(
    (environment as any).userMessageTruncateWords ?? 35
  );

  isCustomUrl = computed(() => {
    return this.apiUrl() !== environment.apiUrl;
  });

  constructor() {
    // If running in browser, watch for any runtime override
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored !== null && stored !== this.apiUrl()) {
        this.apiUrl.set(stored.trim());
      }
      const storedWords = localStorage.getItem(this.WORDS_LIMIT_KEY);
      if (storedWords !== null) {
        const parsed = parseInt(storedWords, 10);
        if (!isNaN(parsed) && parsed > 0) {
          this.maxInputWords.set(parsed);
        }
      }
    }
  }

  private resolveInitialMaxWords(): number {
    if (typeof window !== 'undefined') {
      if (typeof window.__AIVORA_MAX_INPUT_WORDS__ === 'number' && window.__AIVORA_MAX_INPUT_WORDS__ > 0) {
        return window.__AIVORA_MAX_INPUT_WORDS__;
      }
      const stored = localStorage.getItem(this.WORDS_LIMIT_KEY);
      if (stored !== null) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed) && parsed > 0) {
          return parsed;
        }
      }
    }
    return (environment as any).maxInputWords ?? 250;
  }

  setMaxInputWords(limit: number): void {
    if (limit > 0) {
      this.maxInputWords.set(limit);
      if (typeof window !== 'undefined') {
        localStorage.setItem(this.WORDS_LIMIT_KEY, limit.toString());
      }
    }
  }

  resetMaxInputWords(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(this.WORDS_LIMIT_KEY);
    }
    this.maxInputWords.set((environment as any).maxInputWords ?? 250);
  }

  private resolveInitialApiUrl(): string {
    if (typeof window !== 'undefined') {
      // 1. Check window.__AIVORA_API_URL__
      if (window.__AIVORA_API_URL__) {
        return window.__AIVORA_API_URL__.trim();
      }
      // 2. Check localStorage
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored !== null) {
        return stored.trim();
      }
    }
    // 3. Fallback to environment.apiUrl (empty string for relative /api/v1 proxying)
    return environment.apiUrl || '';
  }

  /**
   * Sets a custom API URL (e.g., "http://localhost:8000" or "https://api.my-domain.com")
   * and saves it to local storage so all endpoints immediately use it without reloading.
   */
  setApiUrl(newUrl: string): void {
    const cleaned = (newUrl || '').trim().replace(/\/+$/, '');
    this.apiUrl.set(cleaned);
    if (typeof window !== 'undefined') {
      if (cleaned) {
        localStorage.setItem(this.STORAGE_KEY, cleaned);
      } else {
        localStorage.removeItem(this.STORAGE_KEY);
      }
    }
  }

  /**
   * Resets the API URL to the environment default.
   */
  resetApiUrl(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(this.STORAGE_KEY);
    }
    this.apiUrl.set(environment.apiUrl || '');
  }

  /**
   * Transforms a relative API path like "/api/v1/auth/login" or "/api/v1/chat"
   * into a full URL based on the centralized dynamic apiUrl setting.
   */
  getFullUrl(path: string): string {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const base = this.apiUrl();
    if (!base) {
      // Relative path: automatically routed through proxy.conf.json or same origin
      return cleanPath;
    }
    return `${base}${cleanPath}`;
  }
}
