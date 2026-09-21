import { Injectable, signal, computed } from '@angular/core';

export interface UserProfile {
  id: string;
  email: string;
  full_name?: string | null;
  avatar_url?: string | null;
  google_id?: string | null;
  is_active: boolean;
  is_superuser: boolean;
  created_at: string;
  updated_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: UserProfile;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly ACCESS_TOKEN_KEY = 'aivora_access_token';
  private readonly REFRESH_TOKEN_KEY = 'aivora_refresh_token';
  private readonly USER_KEY = 'aivora_user';

  // Signals
  currentUser = signal<UserProfile | null>(null);
  isAuthenticated = computed(() => !!this.currentUser());
  isLoading = signal<boolean>(false);
  isWaitingForBrowserAuth = signal<boolean>(false);
  browserAuthUrl = signal<string | null>(null);
  activeDesktopSessionId = signal<string | null>(null);
  authError = signal<string | null>(null);
  authSuccessMessage = signal<string | null>(null);
  backendHealthy = signal<boolean | null>(null);

  private sessionPollTimer: any = null;

  constructor() {
    this.initAuthFromStorage();
    this.checkBackendHealth();
    this.handleUrlTokenCallback();
    this.initDeepLinkListener();
  }

  /**
   * Initializes Tauri native deep link listener for custom URI scheme (aivora://)
   */
  private async initDeepLinkListener(): Promise<void> {
    if (typeof window === 'undefined') return;

    // Check if running inside Tauri
    const isTauri = !!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__;
    if (!isTauri) return;

    try {
      const { onOpenUrl } = await import('@tauri-apps/plugin-deep-link');
      await onOpenUrl((urls: string[]) => {
        for (const rawUrl of urls) {
          this.handleDeepLinkUrl(rawUrl);
        }
      });
    } catch (e) {
      console.warn('[DeepLink] Deep link plugin listener not attached:', e);
    }
  }

  /**
   * Handles incoming aivora:// URLs from the browser redirect or OS
   */
  handleDeepLinkUrl(rawUrl: string): void {
    if (!rawUrl) return;
    try {
      // Normalizes aivora://auth/callback?... into a parseable URL
      const normalized = rawUrl.replace(/^aivora:\/\//, 'http://aivora/');
      const parsed = new URL(normalized);
      const accessToken = parsed.searchParams.get('access_token');
      const refreshToken = parsed.searchParams.get('refresh_token');
      const code = parsed.searchParams.get('code');

      if (accessToken) {
        this.cancelBrowserAuth();
        this.saveTokens(accessToken, refreshToken || '');
        this.fetchCurrentUser().then(() => {
          this.authSuccessMessage.set('Logged in successfully via Aivora Desktop!');
        });
      } else if (code) {
        this.exchangeGoogleCode(code);
      }
    } catch (err: any) {
      this.authError.set(`Deep link authentication error: ${err.message}`);
    }
  }

  get accessToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(this.ACCESS_TOKEN_KEY);
  }

  get refreshTokenValue(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(this.REFRESH_TOKEN_KEY);
  }

  getAuthorizationHeader(): Record<string, string> {
    const token = this.accessToken;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  /**
   * Initializes user session from persistent localStorage.
   */
  private initAuthFromStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      const storedUser = localStorage.getItem(this.USER_KEY);
      if (storedUser) {
        this.currentUser.set(JSON.parse(storedUser));
      }
    } catch {
      // Ignored
    }

    if (this.accessToken) {
      // Validate session with backend in background
      this.fetchCurrentUser().catch(() => {
        // Attempt refresh
        this.refreshSession();
      });
    }
  }

  /**
   * Checks if URL contains OAuth redirect fragment (#access_token=...&refresh_token=...)
   */
  private handleUrlTokenCallback(): void {
    if (typeof window === 'undefined') return;

    const hash = window.location.hash;
    if (hash && hash.includes('access_token=')) {
      const params = new URLSearchParams(hash.substring(1));
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (accessToken) {
        this.saveTokens(accessToken, refreshToken || '');
        // Clean URL hash
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        this.fetchCurrentUser();
      }
    }
  }

  /**
   * Pings the FastAPI health endpoint to verify backend connectivity.
   */
  async checkBackendHealth(): Promise<boolean> {
    try {
      const res = await fetch('https://ai-desktop-api.vercel.app/api/v1/health');
      if (res.ok) {
        this.backendHealthy.set(true);
        return true;
      }
    } catch {
      // Fallback direct port check if proxy not used
      try {
        const directRes = await fetch('https://ai-desktop-api.vercel.app/api/v1/health');
        if (directRes.ok) {
          this.backendHealthy.set(true);
          return true;
        }
      } catch {
        // Backend not currently running
      }
    }
    this.backendHealthy.set(false);
    return false;
  }

  /**
   * Opens a URL in the system's default web browser (Chrome/Firefox/Edge/Safari).
   * Works with Tauri's official opener plugin, with resilient browser fallbacks.
   */
  async openUrlInExternalBrowser(url: string): Promise<boolean> {
    // 1. Try Tauri v2 plugin opener
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(url);
      return true;
    } catch {
      // Plugin opener not present or not running in Tauri
    }

    // 2. Try window.__TAURI__ opener API if present
    try {
      const tauriGlobal = (window as unknown as { __TAURI__?: { opener?: { openUrl?: (u: string) => Promise<void> } } }).__TAURI__;
      if (tauriGlobal?.opener?.openUrl) {
        await tauriGlobal.opener.openUrl(url);
        return true;
      }
    } catch {
      // Continue to browser fallback
    }

    // 3. Fallback: window.open in new tab/window
    try {
      const newWin = window.open(url, '_blank', 'noopener,noreferrer');
      if (newWin) {
        newWin.focus();
        return true;
      }
    } catch {
      // Continue to link click fallback
    }

    // 4. Anchor element click fallback
    if (typeof document !== 'undefined') {
      try {
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return true;
      } catch {
        // Ignored
      }
    }

    return false;
  }

  /**
   * Initiates Google OAuth flow by fetching the Google Auth URL with account chooser
   * and redirecting to the user's external default web browser.
   */
  async startGoogleLogin(): Promise<void> {
    this.isLoading.set(true);
    this.authError.set(null);
    this.cancelBrowserAuth();

    try {
      let endpoint = 'https://ai-desktop-api.vercel.app/api/v1/auth/google/url?is_desktop=true';
      let res = await fetch(endpoint).catch(() => null);

      if (!res || !res.ok) {
        // Try direct backend port 8000
        res = await fetch('https://ai-desktop-api.vercel.app/api/v1/auth/google/url?is_desktop=true');
      }

      if (!res.ok) {
        throw new Error('FastAPI backend is offline. Please start the backend on port 8000.');
      }

      const data = await res.json();
      if (!data.url) {
        throw new Error('No Google OAuth URL returned by backend.');
      }

      this.browserAuthUrl.set(data.url);
      const sessionId = data.session_id;
      this.activeDesktopSessionId.set(sessionId);
      this.isWaitingForBrowserAuth.set(true);
      this.isLoading.set(false);

      // Open the Google login page directly in the user's default browser
      await this.openUrlInExternalBrowser(data.url);

      // Poll session status in the background
      if (sessionId) {
        this.startSessionPolling(sessionId);
      }
    } catch (err: any) {
      this.authError.set(err.message || 'Failed to initialize Google login');
      this.isLoading.set(false);
      this.isWaitingForBrowserAuth.set(false);
    }
  }

  /**
   * Re-opens the browser authorization link if the user closed the tab or missed the popup.
   */
  async reopenBrowserAuth(): Promise<void> {
    const url = this.browserAuthUrl();
    if (url) {
      await this.openUrlInExternalBrowser(url);
    }
  }

  /**
   * Cancels the active browser authentication wait loop.
   */
  cancelBrowserAuth(): void {
    if (this.sessionPollTimer) {
      clearInterval(this.sessionPollTimer);
      this.sessionPollTimer = null;
    }
    this.isWaitingForBrowserAuth.set(false);
    this.activeDesktopSessionId.set(null);
    this.browserAuthUrl.set(null);
  }

  /**
   * Repeatedly checks whether the user has completed Google authorization in their browser.
   */
  private startSessionPolling(sessionId: string): void {
    if (this.sessionPollTimer) {
      clearInterval(this.sessionPollTimer);
    }

    let attempts = 0;
    const maxAttempts = 250; // ~5 minutes of polling at 1.2s intervals

    this.sessionPollTimer = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        this.cancelBrowserAuth();
        this.authError.set('Browser sign-in timed out. Please try again.');
        return;
      }

      try {
        let endpoint = `https://ai-desktop-api.vercel.app/api/v1/auth/google/check-desktop-session?session_id=${encodeURIComponent(sessionId)}`;
        let res = await fetch(endpoint).catch(() => null);

        if (!res || !res.ok) {
          res = await fetch(`{endpoint}`).catch(() => null);
        }

        if (res && res.ok) {
          const data = await res.json();
          if (data.status === 'authenticated' && data.tokens) {
            // Authentication successful!
            this.cancelBrowserAuth();
            this.handleAuthSuccess(data.tokens);
          } else if (data.status === 'expired') {
            this.cancelBrowserAuth();
            this.authError.set('Authentication session expired. Please sign in again.');
          }
        }
      } catch {
        // Polling retry
      }
    }, 1200);
  }

  /**
   * Exchanges an OAuth authorization code or full redirected browser URL
   * (e.g. http://localhost:8000/api/v1/auth/google/callback?code=4/0Ab... or pure code)
   * directly with the backend and completes desktop login.
   */
  async exchangeGoogleCode(input: string): Promise<boolean> {
    if (!input || !input.trim()) return false;
    this.isLoading.set(true);
    this.authError.set(null);

    try {
      let code = input.trim();
      // If user pasted full callback URL
      if (code.includes('code=')) {
        try {
          const u = new URL(code.startsWith('http') ? code : `http://${code}`);
          const extracted = u.searchParams.get('code');
          if (extracted) code = extracted;
        } catch {
          const match = code.match(/code=([^&]+)/);
          if (match && match[1]) {
            code = decodeURIComponent(match[1]);
          }
        }
      }

      const res = await fetch('https://ai-desktop-api.vercel.app/api/v1/auth/google/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          redirect_uri: 'https://ai-desktop-api.vercel.app/api/v1/auth/google/callback',
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Authorization code redemption failed.');
      }

      const tokenData: TokenResponse = await res.json();
      this.cancelBrowserAuth();
      this.handleAuthSuccess(tokenData);
      this.authSuccessMessage.set('Logged in successfully!');
      return true;
    } catch (err: any) {
      this.authError.set(err.message || 'Failed to exchange authorization code');
      return false;
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Validates an ID token directly with the FastAPI backend.
   */
  async verifyGoogleIdToken(idToken: string): Promise<boolean> {
    this.isLoading.set(true);
    this.authError.set(null);

    try {
      const res = await fetch('https://ai-desktop-api.vercel.app/api/v1/auth/google/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: idToken }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Google authentication verification failed.');
      }

      const tokenData: TokenResponse = await res.json();
      this.handleAuthSuccess(tokenData);
      return true;
    } catch (err: any) {
      this.authError.set(err.message || 'Authentication error');
      return false;
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Refreshes access token using the stored refresh token.
   */
  async refreshSession(): Promise<boolean> {
    const refreshToken = this.refreshTokenValue;
    if (!refreshToken) {
      this.logout();
      return false;
    }

    try {
      const res = await fetch('https://ai-desktop-api.vercel.app/api/v1/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!res.ok) {
        this.logout();
        return false;
      }

      const tokenData: TokenResponse = await res.json();
      this.handleAuthSuccess(tokenData);
      return true;
    } catch {
      this.logout();
      return false;
    }
  }

  /**
   * Fetches latest user profile from protected endpoint /api/v1/auth/me.
   */
  async fetchCurrentUser(): Promise<UserProfile | null> {
    const token = this.accessToken;
    if (!token) return null;

    try {
      const res = await fetch('https://ai-desktop-api.vercel.app/api/v1/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        if (res.status === 401) {
          const refreshed = await this.refreshSession();
          if (!refreshed) return null;
          return this.fetchCurrentUser();
        }
        return null;
      }

      const user: UserProfile = await res.json();
      this.currentUser.set(user);
      localStorage.setItem(this.USER_KEY, JSON.stringify(user));
      return user;
    } catch {
      return null;
    }
  }

  /**
   * Revokes session on backend and clears local tokens.
   */
  async logout(): Promise<void> {
    const refreshToken = this.refreshTokenValue;
    if (refreshToken) {
      fetch('https://ai-desktop-api.vercel.app/api/v1/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      }).catch(() => {});
    }

    if (typeof window !== 'undefined') {
      localStorage.removeItem(this.ACCESS_TOKEN_KEY);
      localStorage.removeItem(this.REFRESH_TOKEN_KEY);
      localStorage.removeItem(this.USER_KEY);
    }
    this.currentUser.set(null);
    this.authError.set(null);
  }

  private handleAuthSuccess(tokenData: TokenResponse): void {
    this.saveTokens(tokenData.access_token, tokenData.refresh_token);
    this.currentUser.set(tokenData.user);
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.USER_KEY, JSON.stringify(tokenData.user));
    }
    this.authError.set(null);
  }

  private saveTokens(accessToken: string, refreshToken: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(this.ACCESS_TOKEN_KEY, accessToken);
    if (refreshToken) {
      localStorage.setItem(this.REFRESH_TOKEN_KEY, refreshToken);
    }
  }
}
