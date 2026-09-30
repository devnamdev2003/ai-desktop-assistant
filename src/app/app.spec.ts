import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the orb button initially', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app.isExpanded = false;
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('#aivora-orb-button')).toBeTruthy();
  });

  it('should toggle maximize state', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app.isMaximized()).toBe(false);
    await app.toggleMaximize();
    expect(app.isMaximized()).toBe(true);
    await app.toggleMaximize();
    expect(app.isMaximized()).toBe(false);
  });

  it('should format markdown and code blocks correctly', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    const md = '# Hello World\n\nThis is **bold** and `code`.\n\n```python\nprint("hi")\n```';
    const formatted = app.formatAnswer(md);
    expect(formatted).toBeTruthy();
  });

  it('should sanitize dangerous HTML tags and javascript: links in markdown', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    const malicious = '<script>alert(1)</script>\n\n<iframe src="evil.com"></iframe>\n\n<a href="javascript:alert(1)">Click me</a>';
    const result = String(app.formatAnswer(malicious));
    expect(result).not.toContain('<script');
    expect(result).not.toContain('<iframe');
    expect(result).not.toContain('javascript:');
  });

  it('should handle quitApp without error', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(async () => await app.quitApp()).not.toThrow();
  });

  it('should show and hide orb context menu', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app.isExpanded = false;
    expect(app.showOrbContextMenu()).toBe(false);
    await app.onOrbContextMenu(new MouseEvent('contextmenu'));
    expect(app.showOrbContextMenu()).toBe(true);
    await app.closeOrbContextMenu();
    expect(app.showOrbContextMenu()).toBe(false);
  });

  it('should immediately log out user and show signin modal on forceLogoutWithNotice', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app.messages.set([
      { id: '1', sender: 'user', text: 'hello', timestamp: new Date() },
    ]);
    app.forceLogoutWithNotice('This account is deactivated. You have been logged out.');

    expect(app.authService.isAuthenticated()).toBe(false);
    expect(app.showAuthModal()).toBe(true);
    expect(app.authMode()).toBe('signin');
    expect(app.authService.authError()).toBe('This account is deactivated. You have been logged out.');
    expect(app.messages().length).toBe(0);
  });

  it('global validator should force logout when an API returns 401 with inactive user account', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    const authService = app.authService;

    // Simulate logged in user
    authService.currentUser.set({
      id: 'usr-123',
      email: 'test@example.com',
      is_active: true,
      is_superuser: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    expect(authService.isAuthenticated()).toBe(true);

    // Create a mock Response mimicking http://localhost:8000/api/v1/users/me/sessions 401
    const mockResponse = new Response(JSON.stringify({ detail: 'Inactive user account' }), {
      status: 401,
      statusText: 'Unauthorized',
      headers: { 'Content-Type': 'application/json' },
    });

    const result = await authService.validateApiResponse(mockResponse, '/api/v1/users/me/sessions');
    expect(result.valid).toBe(false);
    expect(authService.isAuthenticated()).toBe(false);
    expect(authService.authError()).toBe('This account is deactivated. You have been logged out.');
    expect(authService.forcedLogoutEvent()?.reason).toBe('This account is deactivated. You have been logged out.');
  });

  it('global validator should force logout when session is revoked', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    const authService = app.authService;

    authService.currentUser.set({
      id: 'usr-456',
      email: 'revoked@example.com',
      is_active: true,
      is_superuser: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    expect(authService.isAuthenticated()).toBe(true);

    const mockResponse = new Response(JSON.stringify({ detail: 'Session has been revoked' }), {
      status: 401,
      statusText: 'Unauthorized',
      headers: { 'Content-Type': 'application/json' },
    });

    const result = await authService.validateApiResponse(mockResponse, '/api/v1/chat');
    expect(result.valid).toBe(false);
    expect(authService.isAuthenticated()).toBe(false);
    expect(authService.authError()).toBe('Your session has expired. Please sign in again.');
  });

  it('allows user to switch between signin and signup modes and dismiss error banner', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    
    // Simulate forced logout error
    app.authService.authError.set('Your session has expired. Please sign in again.');
    app.authMode.set('signin');
    app.showAuthModal.set(true);

    expect(app.authMode()).toBe('signin');
    expect(app.authService.authError()).toBe('Your session has expired. Please sign in again.');

    // Switch to create account
    app.setAuthMode('signup');
    expect(app.authMode()).toBe('signup');
    expect(app.authService.authError()).toBeNull();

    // Re-set error and test explicit dismissal
    app.authService.authError.set('Some test notice');
    app.dismissAuthError();
    expect(app.authService.authError()).toBeNull();
  });

  it('prevents browser shortcuts like Ctrl+R, F5, Ctrl+W and blocks web contextmenu', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    // Test Ctrl+R blocking
    const ctrlREvent = new KeyboardEvent('keydown', { key: 'r', ctrlKey: true, cancelable: true });
    app.handleGlobalKeydown(ctrlREvent);
    expect(ctrlREvent.defaultPrevented).toBe(true);

    // Test F5 blocking
    const f5Event = new KeyboardEvent('keydown', { key: 'F5', cancelable: true });
    app.handleGlobalKeydown(f5Event);
    expect(f5Event.defaultPrevented).toBe(true);

    // Test Ctrl+W blocking
    const ctrlWEvent = new KeyboardEvent('keydown', { key: 'w', ctrlKey: true, cancelable: true });
    app.handleGlobalKeydown(ctrlWEvent);
    expect(ctrlWEvent.defaultPrevented).toBe(true);

    // Test context menu prevention outside orb
    const contextEvent = new MouseEvent('contextmenu', { cancelable: true });
    app.handleContextMenu(contextEvent);
    expect(contextEvent.defaultPrevented).toBe(true);

    // Test Escape closes auth modal
    app.showAuthModal.set(true);
    const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    app.handleGlobalKeydown(escapeEvent);
    expect(app.showAuthModal()).toBe(false);
  });

  it('should accurately compute input word counts and word limits', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    app.inputText.set('');
    expect(app.inputWordCount()).toBe(0);
    expect(app.isOverWordLimit()).toBe(false);
    expect(app.remainingWords()).toBe(app.maxInputWords());

    app.inputText.set('Hello world from the automated unit test suite');
    expect(app.inputWordCount()).toBe(8);
    expect(app.remainingWords()).toBe(app.maxInputWords() - 8);

    // Test exceeding word limit
    const longText = new Array(505).fill('word').join(' ');
    app.inputText.set(longText);
    expect(app.inputWordCount()).toBe(505);
    expect(app.isOverWordLimit()).toBe(true);
    expect(app.remainingWords()).toBeLessThan(0);
  });

  it('should toggle sound effects and persist custom instructions', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    const initialSound = app.soundEffectsEnabled();
    await app.toggleSoundEffects();
    expect(app.soundEffectsEnabled()).toBe(!initialSound);

    await app.saveCustomInstruction('Always respond in concise bullet points');
    expect(app.customInstruction()).toBe('Always respond in concise bullet points');

    await app.clearCustomInstruction();
    expect(app.customInstruction()).toBe('');
  });

  it('should manage image attachment and preview modal state', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    expect(app.attachedScreenshot()).toBeNull();
    const fakeDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    
    app.attachedScreenshot.set(fakeDataUrl);
    expect(app.attachedScreenshot()).toBe(fakeDataUrl);

    // Open image preview
    app.previewImage(fakeDataUrl);
    expect(app.previewModalImageUrl()).toBe(fakeDataUrl);

    // Close preview modal
    app.closeImagePreview();
    expect(app.previewModalImageUrl()).toBeNull();

    // Remove screenshot attachment
    app.removeAttachedScreenshot();
    expect(app.attachedScreenshot()).toBeNull();
  });

  it('should handle sessions drawer and active session title', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    expect(app.showSessionDrawer()).toBe(false);
    app.toggleSessionDrawer();
    expect(app.showSessionDrawer()).toBe(true);
    app.closeSessionDrawer();
    expect(app.showSessionDrawer()).toBe(false);

    expect(app.currentSessionTitle()).toBe('New Chat');
    app.startNewSession();
    expect(app.messages().length).toBe(0);
  });
});
