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

  it('should show and hide orb context menu', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app.showOrbContextMenu()).toBe(false);
    app.onOrbContextMenu(new MouseEvent('contextmenu'));
    expect(app.showOrbContextMenu()).toBe(true);
    app.closeOrbContextMenu();
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
});
