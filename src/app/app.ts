import { Component, HostListener } from '@angular/core';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly window = getCurrentWindow();

  isExpanded = false;

  // Orb click/drag state
  private orbMouseDown = false;
  private orbDragging = false;
  private orbStartX = 0;
  private orbStartY = 0;
  private suppressNextOrbClick = false;

  async toggleAssistant(): Promise<void> {
    this.isExpanded = !this.isExpanded;

    if (this.isExpanded) {
      await this.window.setSize(new LogicalSize(420, 520));
      await this.window.center();
    } else {
      await this.window.setSize(new LogicalSize(180, 180));
      await this.window.center();
    }
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