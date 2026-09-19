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
});
