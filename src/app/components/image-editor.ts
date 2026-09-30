import {
  Component,
  ChangeDetectionStrategy,
  ElementRef,
  ViewChild,
  signal,
  input,
  output,
  AfterViewInit,
  OnDestroy,
  effect,
} from '@angular/core';

export interface BoxAnnotation {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

interface CropRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface HistoryItem {
  imageSrc: string;
  boxes: BoxAnnotation[];
}

@Component({
  selector: 'app-image-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown)': 'handleGlobalKeydown($event)',
    '(window:resize)': 'onWindowResize()',
  },
  template: `
    <div
      id="aivora-image-editor-modal"
      class="fixed inset-0 z-[160] flex flex-col bg-slate-950/95 backdrop-blur-xl text-white select-none overflow-hidden"
      role="dialog"
      aria-label="Screenshot Box Annotator & Cropper"
    >
      <!-- =================================================================== -->
      <!-- TOP HEADER BAR                                                      -->
      <!-- =================================================================== -->
      <header
        class="h-14 px-3 sm:px-5 bg-slate-900/90 border-b border-white/10 flex items-center justify-between shrink-0 gap-3"
      >
        <!-- Left: Tool Mode Switcher (Draw Box vs Crop) -->
        <div class="flex items-center gap-2 sm:gap-3 min-w-0">
          <div class="flex items-center p-0.5 rounded-xl bg-white/10 border border-white/10 shrink-0">
            <!-- Mode 1: Draw Box -->
            <button
              type="button"
              (click)="setMode('box')"
              [class]="
                activeMode() === 'box'
                  ? 'bg-red-600/30 text-white border-red-500/40 shadow-sm font-semibold'
                  : 'text-white/60 hover:text-white border-transparent'
              "
              class="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs border transition cursor-pointer"
              title="Draw red highlight boxes to point out elements"
            >
              <svg class="h-3.5 w-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <rect x="3" y="3" width="18" height="18" rx="2" stroke-width="2.5" />
              </svg>
              <span>Draw Box</span>
            </button>

            <!-- Mode 2: Crop -->
            <button
              type="button"
              (click)="setMode('crop')"
              [class]="
                activeMode() === 'crop'
                  ? 'bg-purple-600/40 text-white border-purple-500/40 shadow-sm font-semibold'
                  : 'text-white/60 hover:text-white border-transparent'
              "
              class="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs border transition cursor-pointer"
              title="Crop screenshot to focus on a specific region"
            >
              <svg class="h-3.5 w-3.5 text-purple-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 2v14a2 2 0 002 2h14M18 22V8a2 2 0 00-2-2H2"
                />
              </svg>
              <span>Crop</span>
            </button>
          </div>

          <!-- Tool Guidance / Feedback Notice -->
          <div class="hidden md:flex items-center gap-2 min-w-0">
            @if (cropFeedbackMessage(); as feedback) {
              <div class="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-medium animate-pulse">
                <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
                </svg>
                <span>{{ feedback }}</span>
              </div>
            } @else if (activeMode() === 'box') {
              <p class="text-[11px] text-white/60 truncate">
                Click & drag to draw red highlight boxes around elements you want to point out
              </p>
            } @else {
              <p class="text-[11px] text-purple-200/80 truncate">
                Click & drag to select region to crop, then click Apply Crop or press Enter
              </p>
            }
          </div>
        </div>

        <!-- Center: Actions (Undo, Redo, Clear/Apply Crop) -->
        <div class="flex items-center gap-1.5">
          <!-- Undo Button (Works for both Boxes AND Crop!) -->
          <button
            type="button"
            (click)="undo()"
            [disabled]="undoStack().length === 0"
            title="Undo box or crop (Ctrl+Z)"
            aria-label="Undo"
            class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer"
            [class]="undoStack().length > 0 ? 'bg-white/10 hover:bg-white/15 text-white border-white/20' : 'text-white/40 border-white/5'"
          >
            <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M3 10h10a5 5 0 015 5v2m0 0l-3-3m3 3l3-3M3 10l3 3m-3-3l3-3"
              />
            </svg>
            <span class="hidden sm:inline">Undo</span>
          </button>

          <!-- Redo Button (Works for both Boxes AND Crop!) -->
          <button
            type="button"
            (click)="redo()"
            [disabled]="redoStack().length === 0"
            title="Redo box or crop (Ctrl+Y)"
            aria-label="Redo"
            class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer"
            [class]="redoStack().length > 0 ? 'bg-white/10 hover:bg-white/15 text-white border-white/20' : 'text-white/40 border-white/5'"
          >
            <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M21 10H11a5 5 0 00-5 5v2m0 0l3-3m-3 3l-3-3m17-7l-3 3m3-3l-3-3"
              />
            </svg>
            <span class="hidden sm:inline">Redo</span>
          </button>

          <div class="h-4 w-px bg-white/15 mx-1"></div>

          <!-- Mode-specific buttons -->
          @if (activeMode() === 'box') {
            <!-- Clear All Boxes -->
            <button
              type="button"
              (click)="clearBoxes()"
              [disabled]="boxes().length === 0"
              title="Clear all red boxes"
              aria-label="Clear all boxes"
              class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-white/70 hover:bg-white/10 hover:text-red-300 transition disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer"
            >
              <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              <span class="hidden sm:inline">Clear Boxes</span>
            </button>
          } @else if (cropSelection() && !isDragging()) {
            <!-- In Crop Mode with finalized selection: Header Action to Apply Crop -->
            <button
              type="button"
              (click)="applyCrop()"
              id="header-apply-crop-btn"
              title="Apply crop (Enter)"
              class="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow transition cursor-pointer"
            >
              <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
              </svg>
              <span>Apply Crop</span>
            </button>

            <!-- Reset Crop Selection -->
            <button
              type="button"
              (click)="cancelCropSelection()"
              title="Cancel crop selection (Esc)"
              class="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-white/70 hover:bg-white/10 hover:text-white transition cursor-pointer"
            >
              <span>Reset</span>
            </button>
          }
        </div>

        <!-- Right: Cancel & Attach Buttons -->
        <div class="flex items-center gap-2">
          <!-- Cancel Button -->
          <button
            type="button"
            (click)="onCancel()"
            title="Discard and close"
            class="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs text-white/90 font-medium transition cursor-pointer"
          >
            Cancel
          </button>

          <!-- Primary Save & Attach Button -->
          <button
            type="button"
            (click)="onSaveAndAttach()"
            id="editor-save-attach-btn"
            title="Attach screenshot to chat"
            class="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-xs text-white font-semibold shadow-lg shadow-purple-600/30 active:scale-95 transition cursor-pointer"
          >
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
            </svg>
            <span>Attach to Chat</span>
          </button>
        </div>
      </header>

      <!-- =================================================================== -->
      <!-- CANVAS VIEWPORT                                                     -->
      <!-- =================================================================== -->
      <main
        #viewportContainer
        id="image-editor-canvas-viewport"
        class="flex-1 relative overflow-auto flex items-center justify-center p-3 sm:p-6 bg-[#070a13]"
        style="background-image: radial-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px); background-size: 20px 20px;"
      >
        <div class="relative inline-block">
          <!-- Drawing Canvas with Unified Pointer Events & Capture -->
          <canvas
            #drawingCanvas
            id="editor-drawing-canvas"
            (pointerdown)="onCanvasPointerDown($event)"
            (pointermove)="onCanvasPointerMove($event)"
            (pointerup)="onCanvasPointerUp($event)"
            (pointercancel)="onCanvasPointerCancel($event)"
            class="block rounded-lg shadow-2xl border border-white/20 bg-black/40 touch-none cursor-crosshair max-w-full max-h-[calc(100vh-6rem)] object-contain"
          ></canvas>

          <!-- Floating Apply Crop Pill (ONLY visible when Crop is NOT currently being dragged) -->
          @if (activeMode() === 'crop' && !isDragging() && cropSelection(); as crop) {
            <div
              class="absolute z-30 flex items-center gap-2 p-1.5 rounded-xl bg-slate-900/95 border border-purple-400/40 shadow-2xl shadow-black/80 backdrop-blur-md"
              [style.left.px]="cropActionPos().x"
              [style.top.px]="cropActionPos().y"
            >
              <button
                type="button"
                (click)="applyCrop()"
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow transition cursor-pointer"
                title="Apply crop (Enter)"
              >
                <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
                </svg>
                <span>Apply Crop</span>
              </button>

              <button
                type="button"
                (click)="cancelCropSelection()"
                class="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white/80 text-xs font-medium transition cursor-pointer"
                title="Cancel crop selection (Esc)"
              >
                Cancel
              </button>
            </div>
          }
        </div>
      </main>
    </div>
  `,
})
export class ImageEditor implements AfterViewInit, OnDestroy {
  // Input: screenshot data URL or image source
  imageUrl = input.required<string>();

  // Outputs
  save = output<string>();
  cancel = output<void>();

  @ViewChild('drawingCanvas') canvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('viewportContainer') viewportRef?: ElementRef<HTMLDivElement>;

  // Mode: 'box' (default) or 'crop'
  activeMode = signal<'box' | 'crop'>('box');

  // Red Highlight Box Settings
  readonly DEFAULT_RED = '#ef4444';
  readonly BOX_LINE_WIDTH = 3.5;

  // Box annotations state
  boxes = signal<BoxAnnotation[]>([]);

  // Current working image data URL (updated upon crop, undo, redo)
  currentImageSrc = signal<string>('');

  // Undo / Redo history stacks (capturing both image & boxes)
  undoStack = signal<HistoryItem[]>([]);
  redoStack = signal<HistoryItem[]>([]);

  // Feedback message upon crop or undo
  cropFeedbackMessage = signal<string | null>(null);

  // Dragging state (true strictly while user pointer is down and moving)
  isDragging = signal<boolean>(false);

  // Active crop selection (finalized normalized rectangle)
  cropSelection = signal<CropRegion | null>(null);

  // Position of floating crop action pill
  cropActionPos = signal<{ x: number; y: number }>({ x: 10, y: 10 });

  private baseImageElement: HTMLImageElement | null = null;
  private pointerStartX = 0;
  private pointerStartY = 0;
  private pointerCurrentX = 0;
  private pointerCurrentY = 0;
  private lastLoadedInputUrl: string | null = null;

  constructor() {
    // CRITICAL: Only reload if the PARENT's input imageUrl changes.
    // Do NOT read currentImageSrc() inside this effect, so crop/undo/redo never triggers a reset!
    effect(() => {
      const inputUrl = this.imageUrl();
      if (inputUrl && inputUrl !== this.lastLoadedInputUrl) {
        this.lastLoadedInputUrl = inputUrl;
        this.currentImageSrc.set(inputUrl);
        this.undoStack.set([]);
        this.redoStack.set([]);
        this.boxes.set([]);
        this.cropSelection.set(null);
        this.loadImage(inputUrl);
      }
    });
  }

  ngAfterViewInit(): void {
    const url = this.currentImageSrc() || this.imageUrl();
    if (url && !this.baseImageElement) {
      this.loadImage(url);
    }
  }

  ngOnDestroy(): void {
    this.baseImageElement = null;
  }

  setMode(mode: 'box' | 'crop'): void {
    this.activeMode.set(mode);
    if (mode === 'box') {
      this.cropSelection.set(null);
    }
    this.redrawCanvas();
  }

  onWindowResize(): void {
    this.redrawCanvas();
    if (this.cropSelection()) {
      this.updateCropActionPosition();
    }
  }

  private loadImage(src: string, onLoaded?: () => void): void {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.baseImageElement = img;
      const canvas = this.canvasRef?.nativeElement;
      if (canvas) {
        canvas.width = img.naturalWidth || 1920;
        canvas.height = img.naturalHeight || 1080;
      }
      this.redrawCanvas();
      if (onLoaded) onLoaded();
    };
    img.src = src;
  }

  redrawCanvas(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas || !this.baseImageElement) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // 1. Draw base image
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.baseImageElement, 0, 0, w, h);

    // 2. Draw all existing red highlight boxes
    for (const box of this.boxes()) {
      this.renderBox(ctx, box);
    }

    // 3. Draw active draft box while user is dragging in Box mode
    if (this.activeMode() === 'box' && this.isDragging()) {
      const draftBox: BoxAnnotation = {
        id: 'draft',
        x: this.pointerStartX,
        y: this.pointerStartY,
        w: this.pointerCurrentX - this.pointerStartX,
        h: this.pointerCurrentY - this.pointerStartY,
        color: this.DEFAULT_RED,
      };
      this.renderBox(ctx, draftBox);
      this.renderDimensionBadge(ctx, draftBox);
    }

    // 4. Draw Crop Overlay (if in Crop mode)
    if (this.activeMode() === 'crop') {
      if (this.isDragging()) {
        // While dragging: draw live crop region
        const liveRegion: CropRegion = {
          x: Math.min(this.pointerStartX, this.pointerCurrentX),
          y: Math.min(this.pointerStartY, this.pointerCurrentY),
          w: Math.abs(this.pointerCurrentX - this.pointerStartX),
          h: Math.abs(this.pointerCurrentY - this.pointerStartY),
        };
        if (liveRegion.w > 2 && liveRegion.h > 2) {
          this.renderCropOverlay(ctx, liveRegion, w, h);
        }
      } else {
        // While idle: draw finalized crop selection
        const crop = this.cropSelection();
        if (crop && crop.w > 2 && crop.h > 2) {
          this.renderCropOverlay(ctx, crop, w, h);
        }
      }
    }
  }

  private renderBox(ctx: CanvasRenderingContext2D, box: BoxAnnotation): void {
    const minX = Math.min(box.x, box.x + box.w);
    const minY = Math.min(box.y, box.y + box.h);
    const absW = Math.abs(box.w);
    const absH = Math.abs(box.h);

    if (absW < 2 && absH < 2) return;

    ctx.save();

    // High-contrast dark shadow outline so the red box is vivid on ANY background
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.lineWidth = this.BOX_LINE_WIDTH + 2.5;
    ctx.lineJoin = 'miter';
    ctx.strokeRect(minX, minY, absW, absH);

    // Primary Red Stroke
    ctx.strokeStyle = this.DEFAULT_RED;
    ctx.lineWidth = this.BOX_LINE_WIDTH;
    ctx.strokeRect(minX, minY, absW, absH);

    // High-precision corner target brackets
    const cornerSize = Math.min(14, absW / 3, absH / 3);
    if (cornerSize > 4) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;

      // Top-left
      ctx.beginPath();
      ctx.moveTo(minX, minY + cornerSize);
      ctx.lineTo(minX, minY);
      ctx.lineTo(minX + cornerSize, minY);
      ctx.stroke();

      // Top-right
      ctx.beginPath();
      ctx.moveTo(minX + absW - cornerSize, minY);
      ctx.lineTo(minX + absW, minY);
      ctx.lineTo(minX + absW, minY + cornerSize);
      ctx.stroke();

      // Bottom-left
      ctx.beginPath();
      ctx.moveTo(minX, minY + absH - cornerSize);
      ctx.lineTo(minX, minY + absH);
      ctx.lineTo(minX + cornerSize, minY + absH);
      ctx.stroke();

      // Bottom-right
      ctx.beginPath();
      ctx.moveTo(minX + absW - cornerSize, minY + absH);
      ctx.lineTo(minX + absW, minY + absH);
      ctx.lineTo(minX + absW, minY + absH - cornerSize);
      ctx.stroke();
    }

    ctx.restore();
  }

  private renderDimensionBadge(ctx: CanvasRenderingContext2D, box: { x: number; y: number; w: number; h: number }): void {
    const minX = Math.min(box.x, box.x + box.w);
    const minY = Math.min(box.y, box.y + box.h);
    const absW = Math.round(Math.abs(box.w));
    const absH = Math.round(Math.abs(box.h));

    if (absW < 10 || absH < 10) return;

    ctx.save();
    const label = `${absW} × ${absH} px`;
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    const textWidth = ctx.measureText(label).width;

    const badgeX = Math.max(4, minX);
    const badgeY = Math.max(18, minY - 6);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(badgeX, badgeY - 14, textWidth + 8, 16);

    ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
    ctx.lineWidth = 1;
    ctx.strokeRect(badgeX, badgeY - 14, textWidth + 8, 16);

    ctx.fillStyle = '#fca5a5';
    ctx.fillText(label, badgeX + 4, badgeY - 2);
    ctx.restore();
  }

  private renderCropOverlay(
    ctx: CanvasRenderingContext2D,
    crop: CropRegion,
    canvasW: number,
    canvasH: number
  ): void {
    const minX = Math.min(crop.x, crop.x + crop.w);
    const minY = Math.min(crop.y, crop.y + crop.h);
    const absW = Math.abs(crop.w);
    const absH = Math.abs(crop.h);

    if (absW < 2 || absH < 2) return;

    ctx.save();

    // 1. Dim the area outside the crop rectangle
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    // Top
    ctx.fillRect(0, 0, canvasW, minY);
    // Bottom
    ctx.fillRect(0, minY + absH, canvasW, canvasH - (minY + absH));
    // Left
    ctx.fillRect(0, minY, minX, absH);
    // Right
    ctx.fillRect(minX + absW, minY, canvasW - (minX + absW), absH);

    // 2. Crisp dashed crop outline
    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(minX, minY, absW, absH);

    // 3. Rule of thirds grid lines inside crop region
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);

    const thirdW = absW / 3;
    const thirdH = absH / 3;
    ctx.beginPath();
    // Vertical grid lines
    ctx.moveTo(minX + thirdW, minY);
    ctx.lineTo(minX + thirdW, minY + absH);
    ctx.moveTo(minX + thirdW * 2, minY);
    ctx.lineTo(minX + thirdW * 2, minY + absH);
    // Horizontal grid lines
    ctx.moveTo(minX, minY + thirdH);
    ctx.lineTo(minX + absW, minY + thirdH);
    ctx.moveTo(minX, minY + thirdH * 2);
    ctx.lineTo(minX + absW, minY + thirdH * 2);
    ctx.stroke();

    // 4. Solid corner indicators
    ctx.setLineDash([]);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3.5;
    const cSize = Math.min(18, absW / 4, absH / 4);

    // Top-left
    ctx.beginPath();
    ctx.moveTo(minX, minY + cSize);
    ctx.lineTo(minX, minY);
    ctx.lineTo(minX + cSize, minY);
    ctx.stroke();

    // Top-right
    ctx.beginPath();
    ctx.moveTo(minX + absW - cSize, minY);
    ctx.lineTo(minX + absW, minY);
    ctx.lineTo(minX + absW, minY + cSize);
    ctx.stroke();

    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(minX, minY + absH - cSize);
    ctx.lineTo(minX, minY + absH);
    ctx.lineTo(minX + cSize, minY + absH);
    ctx.stroke();

    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(minX + absW - cSize, minY + absH);
    ctx.lineTo(minX + absW, minY + absH);
    ctx.lineTo(minX + absW, minY + absH - cSize);
    ctx.stroke();

    // 5. Dimensions label badge
    const label = `${Math.round(absW)} × ${Math.round(absH)} px`;
    ctx.font = 'bold 11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    const textWidth = ctx.measureText(label).width;
    const badgeX = Math.max(4, minX);
    const badgeY = Math.max(18, minY - 6);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.fillRect(badgeX, badgeY - 14, textWidth + 10, 17);
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 1;
    ctx.strokeRect(badgeX, badgeY - 14, textWidth + 10, 17);
    ctx.fillStyle = '#e9d5ff';
    ctx.fillText(label, badgeX + 5, badgeY - 1);

    ctx.restore();
  }

  // =========================================================================
  // UNIFIED POINTER EVENTS & POINTER CAPTURE
  // =========================================================================

  private getCanvasCoordinates(clientX: number, clientY: number): { x: number; y: number } {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = Math.max(0, Math.min(canvas.width, (clientX - rect.left) * scaleX));
    const y = Math.max(0, Math.min(canvas.height, (clientY - rect.top) * scaleY));
    return { x, y };
  }

  onCanvasPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();

    const canvas = this.canvasRef?.nativeElement;
    if (canvas) {
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch { }
    }

    const { x, y } = this.getCanvasCoordinates(event.clientX, event.clientY);
    this.pointerStartX = x;
    this.pointerStartY = y;
    this.pointerCurrentX = x;
    this.pointerCurrentY = y;
    this.isDragging.set(true);

    if (this.activeMode() === 'crop') {
      // Clear previous crop while starting a new drag
      this.cropSelection.set(null);
    }

    this.redrawCanvas();
  }

  onCanvasPointerMove(event: PointerEvent): void {
    if (!this.isDragging()) return;
    event.preventDefault();

    const { x, y } = this.getCanvasCoordinates(event.clientX, event.clientY);
    this.pointerCurrentX = x;
    this.pointerCurrentY = y;

    this.redrawCanvas();
  }

  onCanvasPointerUp(event: PointerEvent): void {
    if (!this.isDragging()) return;
    event.preventDefault();

    const canvas = this.canvasRef?.nativeElement;
    if (canvas && canvas.hasPointerCapture(event.pointerId)) {
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch { }
    }

    const { x, y } = this.getCanvasCoordinates(event.clientX, event.clientY);
    this.pointerCurrentX = x;
    this.pointerCurrentY = y;
    this.isDragging.set(false);

    const minX = Math.round(Math.min(this.pointerStartX, x));
    const minY = Math.round(Math.min(this.pointerStartY, y));
    const absW = Math.round(Math.abs(x - this.pointerStartX));
    const absH = Math.round(Math.abs(y - this.pointerStartY));

    if (this.activeMode() === 'box') {
      // Add red highlight box if drag is at least 6x6 px
      if (absW >= 6 && absH >= 6) {
        this.pushHistory();
        const newBox: BoxAnnotation = {
          id: 'box_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
          x: minX,
          y: minY,
          w: absW,
          h: absH,
          color: this.DEFAULT_RED,
        };
        this.boxes.update((list) => [...list, newBox]);
      }
      this.redrawCanvas();
    } else {
      // Finalize Crop Selection
      if (absW >= 12 && absH >= 12) {
        const crop: CropRegion = {
          x: minX,
          y: minY,
          w: absW,
          h: absH,
        };
        this.cropSelection.set(crop);
        this.updateCropActionPosition();
      } else {
        this.cropSelection.set(null);
      }
      this.redrawCanvas();
    }
  }

  onCanvasPointerCancel(event: PointerEvent): void {
    if (this.isDragging()) {
      this.isDragging.set(false);
      this.redrawCanvas();
    }
  }

  private updateCropActionPosition(): void {
    const crop = this.cropSelection();
    const canvas = this.canvasRef?.nativeElement;
    if (!crop || !canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / canvas.width;
    const scaleY = rect.height / canvas.height;

    const canvasCropMinX = crop.x * scaleX;
    const canvasCropMaxY = (crop.y + crop.h) * scaleY;

    // Position floating action pill safely below the crop rectangle or clamp to viewport
    const x = Math.max(10, Math.min(rect.width - 190, canvasCropMinX));
    let y = canvasCropMaxY + 12;
    if (y > rect.height - 50) {
      y = Math.max(10, (crop.y * scaleY) - 48);
    }

    this.cropActionPos.set({ x, y });
  }

  // =========================================================================
  // CROP EXECUTION
  // =========================================================================

  applyCrop(): void {
    const crop = this.cropSelection();
    if (!crop || !this.baseImageElement) return;

    const minX = Math.round(crop.x);
    const minY = Math.round(crop.y);
    const absW = Math.round(crop.w);
    const absH = Math.round(crop.h);

    if (absW < 12 || absH < 12) {
      this.cancelCropSelection();
      return;
    }

    // 1. Push current snapshot to undo stack BEFORE updating image
    this.pushHistory();

    // 2. Create offscreen canvas to render cropped image portion
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = absW;
    cropCanvas.height = absH;
    const cropCtx = cropCanvas.getContext('2d');
    let croppedDataUrl = this.currentImageSrc();

    if (cropCtx) {
      cropCtx.drawImage(
        this.baseImageElement,
        minX,
        minY,
        absW,
        absH,
        0,
        0,
        absW,
        absH
      );
      croppedDataUrl = cropCanvas.toDataURL('image/jpeg', 0.95);
    } else {
      // In headless test environments without 2d canvas context
      croppedDataUrl = `data:image/jpeg;base64,CROPPED_${absW}x${absH}`;
    }

    // 3. Translate and filter existing boxes to the new coordinate space
    const updatedBoxes: BoxAnnotation[] = [];
    for (const b of this.boxes()) {
      const bMinX = Math.min(b.x, b.x + b.w);
      const bMinY = Math.min(b.y, b.y + b.h);
      const bMaxX = Math.max(b.x, b.x + b.w);
      const bMaxY = Math.max(b.y, b.y + b.h);

      // Check if box overlaps cropped region
      const overlapX = Math.max(0, Math.min(bMaxX, minX + absW) - Math.max(bMinX, minX));
      const overlapY = Math.max(0, Math.min(bMaxY, minY + absH) - Math.max(bMinY, minY));

      if (overlapX > 4 && overlapY > 4) {
        const shiftedX = b.x - minX;
        const shiftedY = b.y - minY;
        updatedBoxes.push({
          ...b,
          x: shiftedX,
          y: shiftedY,
        });
      }
    }

    this.boxes.set(updatedBoxes);
    this.currentImageSrc.set(croppedDataUrl);
    this.cropSelection.set(null);
    this.cropFeedbackMessage.set('Image cropped! Click Undo (Ctrl+Z) anytime to revert.');
    setTimeout(() => this.cropFeedbackMessage.set(null), 3500);

    // 4. Load the cropped image and adjust canvas dimensions
    this.loadImage(croppedDataUrl);
  }

  cancelCropSelection(): void {
    this.cropSelection.set(null);
    this.redrawCanvas();
  }

  // =========================================================================
  // HISTORY: UNDO, REDO, CLEAR, SAVE, CANCEL
  // =========================================================================

  private pushHistory(): void {
    const currentSnapshot: HistoryItem = {
      imageSrc: this.currentImageSrc(),
      boxes: [...this.boxes()],
    };
    this.undoStack.update((stack) => [...stack, currentSnapshot]);
    this.redoStack.set([]);
  }

  undo(): void {
    const stack = this.undoStack();
    if (stack.length === 0) return;

    const previous = stack[stack.length - 1];
    this.undoStack.update((s) => s.slice(0, -1));

    // Save current state to redo stack
    this.redoStack.update((r) => [
      ...r,
      {
        imageSrc: this.currentImageSrc(),
        boxes: [...this.boxes()],
      },
    ]);

    this.boxes.set(previous.boxes);
    this.cropSelection.set(null);

    // If image source changed due to crop undo
    if (previous.imageSrc !== this.currentImageSrc()) {
      this.currentImageSrc.set(previous.imageSrc);
      this.cropFeedbackMessage.set('Crop undone! Restored previous image.');
      setTimeout(() => this.cropFeedbackMessage.set(null), 3000);
      this.loadImage(previous.imageSrc);
    } else {
      this.redrawCanvas();
    }
  }

  redo(): void {
    const stack = this.redoStack();
    if (stack.length === 0) return;

    const next = stack[stack.length - 1];
    this.redoStack.update((s) => s.slice(0, -1));

    // Save current state to undo stack
    this.undoStack.update((u) => [
      ...u,
      {
        imageSrc: this.currentImageSrc(),
        boxes: [...this.boxes()],
      },
    ]);

    this.boxes.set(next.boxes);
    this.cropSelection.set(null);

    // If image source changed due to crop redo
    if (next.imageSrc !== this.currentImageSrc()) {
      this.currentImageSrc.set(next.imageSrc);
      this.cropFeedbackMessage.set('Redo applied!');
      setTimeout(() => this.cropFeedbackMessage.set(null), 3000);
      this.loadImage(next.imageSrc);
    } else {
      this.redrawCanvas();
    }
  }

  clearBoxes(): void {
    if (this.boxes().length === 0) return;
    this.pushHistory();
    this.boxes.set([]);
    this.redrawCanvas();
  }

  onSaveAndAttach(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) {
      this.cancel.emit();
      return;
    }

    // Ensure final state is drawn without active drafts or crop overlays
    this.isDragging.set(false);
    this.cropSelection.set(null);
    this.redrawCanvas();

    // Export as clean high-quality JPEG
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    this.save.emit(dataUrl);
  }

  onCancel(): void {
    this.cancel.emit();
  }

  handleGlobalKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (this.activeMode() === 'crop' && this.cropSelection()) {
        event.preventDefault();
        this.cancelCropSelection();
        return;
      }
      event.preventDefault();
      this.onCancel();
      return;
    }

    if (event.key === 'Enter') {
      if (this.activeMode() === 'crop' && this.cropSelection()) {
        event.preventDefault();
        this.applyCrop();
        return;
      }
      event.preventDefault();
      this.onSaveAndAttach();
      return;
    }

    const isCtrlOrCmd = event.ctrlKey || event.metaKey;
    if (isCtrlOrCmd && (event.key === 'z' || event.key === 'Z')) {
      if (event.shiftKey) {
        event.preventDefault();
        this.redo();
      } else {
        event.preventDefault();
        this.undo();
      }
      return;
    }

    if (isCtrlOrCmd && (event.key === 'y' || event.key === 'Y')) {
      event.preventDefault();
      this.redo();
      return;
    }
  }
}
