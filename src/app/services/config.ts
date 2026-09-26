import { Injectable, signal, computed } from '@angular/core';
import { environment } from '../../environments/environment';

declare global {
  interface Window {
    __AIVORA_API_URL__?: string;
  }
}

@Injectable({
  providedIn: 'root',
})
export class ConfigService {
  private readonly STORAGE_KEY = 'aivora_api_base_url';

  // Reactive signal for the API Base URL used across the application
  apiUrl = signal<string>(this.resolveInitialApiUrl());

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
    }
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
