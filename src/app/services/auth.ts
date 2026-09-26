import { Injectable, signal, computed, inject } from '@angular/core';
import { ConfigService } from './config';

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

export interface SavedConversation {
  id: number;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly configService = inject(ConfigService);

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
      this.fetchCurrentUser().catch(() => {
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
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        this.fetchCurrentUser();
      }
    }
  }

  /**
   * Pings the FastAPI health endpoint to verify backend connectivity.
   */
  async checkBackendHealth(): Promise<boolean> {
    const url = this.configService.getFullUrl('/api/v1/health');
    try {
      const res = await fetch(url);
      if (res.ok) {
        this.backendHealthy.set(true);
        return true;
      }
    } catch {
      // Offline
    }
    this.backendHealthy.set(false);
    return false;
  }

  /**
   * Manual User Registration with Email and Password.
   * Auto-hashes password and creates account in the database.
   */
  async register(email: string, password: string, fullName?: string): Promise<boolean> {
    this.isLoading.set(true);
    this.authError.set(null);
    this.authSuccessMessage.set(null);

    const endpoint = this.configService.getFullUrl('/api/v1/auth/register');
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          full_name: fullName?.trim() || null,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Registration failed. Please check your details.');
      }

      const tokenData: TokenResponse = await res.json();
      this.handleAuthSuccess(tokenData);
      this.authSuccessMessage.set(`Welcome to Aivora, ${tokenData.user.full_name || tokenData.user.email}!`);
      return true;
    } catch (err: any) {
      this.authError.set(err.message || 'Registration failed');
      return false;
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Manual User Login with Email and Password.
   */
  async login(email: string, password: string): Promise<boolean> {
    this.isLoading.set(true);
    this.authError.set(null);
    this.authSuccessMessage.set(null);

    const endpoint = this.configService.getFullUrl('/api/v1/auth/login');
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Invalid email or password.');
      }

      const tokenData: TokenResponse = await res.json();
      this.handleAuthSuccess(tokenData);
      this.authSuccessMessage.set('Signed in successfully!');
      return true;
    } catch (err: any) {
      this.authError.set(err.message || 'Login failed');
      return false;
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Updates the authenticated user's profile on the FastAPI backend.
   */
  async updateProfile(fullName?: string, avatarUrl?: string): Promise<UserProfile | null> {
    const token = this.accessToken;
    if (!token) return null;

    this.isLoading.set(true);
    this.authError.set(null);
    const endpoint = this.configService.getFullUrl('/api/v1/users/me');

    try {
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          full_name: fullName !== undefined ? fullName : undefined,
          avatar_url: avatarUrl !== undefined ? avatarUrl : undefined,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to update profile.');
      }

      const updatedUser: UserProfile = await res.json();
      this.currentUser.set(updatedUser);
      if (typeof window !== 'undefined') {
        localStorage.setItem(this.USER_KEY, JSON.stringify(updatedUser));
      }
      this.authSuccessMessage.set('Profile updated successfully!');
      return updatedUser;
    } catch (err: any) {
      this.authError.set(err.message || 'Profile update failed');
      return null;
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Opens a URL in the system's default web browser.
   */
  async openUrlInExternalBrowser(url: string): Promise<boolean> {
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(url);
      return true;
    } catch {
      // Ignored
    }

    try {
      const tauriGlobal = (window as unknown as { __TAURI__?: { opener?: { openUrl?: (u: string) => Promise<void> } } }).__TAURI__;
      if (tauriGlobal?.opener?.openUrl) {
        await tauriGlobal.opener.openUrl(url);
        return true;
      }
    } catch {
      // Ignored
    }

    try {
      const newWin = window.open(url, '_blank', 'noopener,noreferrer');
      if (newWin) {
        newWin.focus();
        return true;
      }
    } catch {
      // Ignored
    }

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
   * Initiates Google OAuth flow by fetching the authorization URL.
   */
  async startGoogleLogin(): Promise<void> {
    this.isLoading.set(true);
    this.authError.set(null);
    this.cancelBrowserAuth();

    try {
      const endpoint = this.configService.getFullUrl('/api/v1/auth/google/url?is_desktop=true');
      const res = await fetch(endpoint);

      if (!res.ok) {
        throw new Error('Unable to connect to the authentication service. Please try again.');
      }

      const data = await res.json();
      if (!data.url) {
        throw new Error('Could not start Google sign in. Please try again.');
      }

      this.browserAuthUrl.set(data.url);
      const sessionId = data.session_id;
      this.activeDesktopSessionId.set(sessionId);
      this.isWaitingForBrowserAuth.set(true);
      this.isLoading.set(false);

      await this.openUrlInExternalBrowser(data.url);

      if (sessionId) {
        this.startSessionPolling(sessionId);
      }
    } catch (err: any) {
      this.authError.set(err.message || 'Failed to initialize Google login');
      this.isLoading.set(false);
      this.isWaitingForBrowserAuth.set(false);
    }
  }

  async reopenBrowserAuth(): Promise<void> {
    const url = this.browserAuthUrl();
    if (url) {
      await this.openUrlInExternalBrowser(url);
    }
  }

  cancelBrowserAuth(): void {
    if (this.sessionPollTimer) {
      clearInterval(this.sessionPollTimer);
      this.sessionPollTimer = null;
    }
    this.isWaitingForBrowserAuth.set(false);
    this.activeDesktopSessionId.set(null);
    this.browserAuthUrl.set(null);
  }

  private startSessionPolling(sessionId: string): void {
    if (this.sessionPollTimer) {
      clearInterval(this.sessionPollTimer);
    }

    let attempts = 0;
    const maxAttempts = 250;

    this.sessionPollTimer = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        this.cancelBrowserAuth();
        this.authError.set('Browser sign-in timed out. Please try again.');
        return;
      }

      try {
        const endpoint = this.configService.getFullUrl(
          `/api/v1/auth/google/check-desktop-session?session_id=${encodeURIComponent(sessionId)}`
        );
        const res = await fetch(endpoint).catch(() => null);

        if (res && res.ok) {
          const data = await res.json();
          if (data.status === 'authenticated' && data.tokens) {
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

  async exchangeGoogleCode(input: string): Promise<boolean> {
    if (!input || !input.trim()) return false;
    this.isLoading.set(true);
    this.authError.set(null);

    try {
      let code = input.trim();
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

      const endpoint = this.configService.getFullUrl('/api/v1/auth/google/verify');
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
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

  async verifyGoogleIdToken(idToken: string): Promise<boolean> {
    this.isLoading.set(true);
    this.authError.set(null);

    try {
      const endpoint = this.configService.getFullUrl('/api/v1/auth/google/verify');
      const res = await fetch(endpoint, {
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

  async refreshSession(): Promise<boolean> {
    const refreshToken = this.refreshTokenValue;
    if (!refreshToken) {
      this.logout();
      return false;
    }

    try {
      const endpoint = this.configService.getFullUrl('/api/v1/auth/refresh');
      const res = await fetch(endpoint, {
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

  async fetchCurrentUser(): Promise<UserProfile | null> {
    const token = this.accessToken;
    if (!token) return null;

    try {
      const endpoint = this.configService.getFullUrl('/api/v1/auth/me');
      const res = await fetch(endpoint, {
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
      if (typeof window !== 'undefined') {
        localStorage.setItem(this.USER_KEY, JSON.stringify(user));
      }
      return user;
    } catch {
      return null;
    }
  }

  /**
   * Fetches user's saved conversations from FastAPI backend.
   */
  async getSavedConversations(): Promise<SavedConversation[]> {
    const token = this.accessToken;
    if (!token) return [];

    try {
      const endpoint = this.configService.getFullUrl('/api/v1/chat/conversations');
      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // Ignored
    }
    return [];
  }

  /**
   * Deletes a conversation on the FastAPI backend.
   */
  async deleteConversation(conversationId: number | string): Promise<boolean> {
    const token = this.accessToken;
    if (!token) return false;

    try {
      const endpoint = this.configService.getFullUrl(`/api/v1/chat/conversations/${conversationId}`);
      const res = await fetch(endpoint, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async logout(): Promise<void> {
    const refreshToken = this.refreshTokenValue;
    if (refreshToken) {
      const endpoint = this.configService.getFullUrl('/api/v1/auth/logout');
      fetch(endpoint, {
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
