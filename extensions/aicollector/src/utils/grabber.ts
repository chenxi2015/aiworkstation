import type { GrabbedContent, GrabbedVideo } from '../types';
import { extractPageTDK } from './tdk';
import { extractImagesFromElement } from './imageExtractor';
import { extractVideosFromElement } from './videoExtractor';
import { normalizeHtml } from './htmlNormalizer';
import { captureAndCropArea, type AreaPageRect } from './screenshotHelper';

interface SelectionBoxRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

/**
 * Visual Element Grabber
 *
 * Supports two intuitive capture modes:
 * 1. Single Click: Hover over any DOM element and click to immediately grab it.
 * 2. Press & Drag: Hold down mouse left button and drag downwards/any direction to box-select a region (with auto-scroll).
 */
export class VisualGrabber {
  private active = false;
  private currentHoverElement: HTMLElement | null = null;

  // Mouse Drag state
  private isMouseDown = false;
  private isDragging = false;
  private justDragged = false;
  private dragStartPage = { x: 0, y: 0 };
  private lastMousePage = { x: 0, y: 0 };
  private lastClientY = 0;
  private autoScrollTimer: number | null = null;

  // DOM Elements
  private container: HTMLDivElement | null = null;
  private hoverOverlayBox: HTMLDivElement | null = null;
  private hoverBadge: HTMLDivElement | null = null;
  private selectionBox: HTMLDivElement | null = null;
  private selectionBadge: HTMLDivElement | null = null;
  private banner: HTMLDivElement | null = null;

  constructor() {
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleScroll = this.handleScroll.bind(this);
    this.handleNativeDragStart = this.handleNativeDragStart.bind(this);
  }

  public start(): void {
    if (this.active) return;
    this.active = true;
    this.isMouseDown = false;
    this.isDragging = false;
    this.justDragged = false;
    this.createOverlay();
    this.attachEvents();
    try {
      window.focus();
    } catch {
      // Ignore focus errors
    }
  }

  public stop(notifyCancel = true): void {
    if (!this.active) return;
    this.stopAutoScroll();
    this.active = false;
    this.detachEvents();
    this.removeOverlay();
    this.currentHoverElement = null;
    this.isMouseDown = false;
    this.isDragging = false;
    this.justDragged = false;
    document.body.style.userSelect = '';

    if (notifyCancel) {
      chrome.runtime.sendMessage({ type: 'VISUAL_GRAB_CANCELLED' }).catch(() => {});
    }
  }

  public isActive(): boolean {
    return this.active;
  }

  // ── Overlay UI Creation ─────────────────────────────────────────

  private createOverlay(): void {
    this.container = document.createElement('div');
    this.container.id = 'ai-workstation-grabber-container';
    this.container.style.cssText = `
      position: fixed; top: 0; left: 0;
      width: 100vw; height: 100vh;
      pointer-events: none;
      z-index: 2147483646;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;

    // 1. Hover Highlight Box (for single click selection)
    this.hoverOverlayBox = document.createElement('div');
    this.hoverOverlayBox.style.cssText = `
      position: absolute;
      border: 2px solid #6366f1;
      background-color: rgba(99, 102, 241, 0.08);
      border-radius: 4px;
      transition: all 0.06s ease-out;
      pointer-events: none;
      box-shadow: 0 0 0 1px rgba(255,255,255,0.6), 0 4px 20px rgba(99,102,241,0.25);
      display: none;
    `;
    this.hoverBadge = document.createElement('div');
    this.hoverBadge.style.cssText = `
      position: absolute; top: -28px; left: 0;
      background: #4f46e5; color: #fff;
      padding: 3px 8px; border-radius: 4px;
      font-size: 11px; font-weight: 600;
      white-space: nowrap; pointer-events: none;
      box-shadow: 0 2px 6px rgba(0,0,0,0.2);
    `;
    this.hoverOverlayBox.appendChild(this.hoverBadge);

    // 2. Drag Selection Box (for press-and-drag box selection)
    this.selectionBox = document.createElement('div');
    this.selectionBox.style.cssText = `
      position: absolute;
      border: 2px dashed #2563eb;
      background-color: rgba(37, 99, 235, 0.12);
      border-radius: 6px;
      pointer-events: none;
      box-shadow: 0 0 0 1px rgba(255,255,255,0.8), 0 8px 32px rgba(37,99,235,0.28);
      display: none;
      z-index: 2147483647;
    `;
    this.selectionBadge = document.createElement('div');
    this.selectionBadge.style.cssText = `
      position: absolute; top: -28px; left: 0;
      background: #1d4ed8; color: #fff;
      padding: 3px 10px; border-radius: 4px;
      font-size: 11px; font-weight: 600;
      white-space: nowrap; pointer-events: none;
      box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    `;
    this.selectionBox.appendChild(this.selectionBadge);

    // 3. Top Action Guide Banner
    this.banner = document.createElement('div');
    this.banner.style.cssText = `
      position: fixed; top: 16px; left: 50%;
      transform: translateX(-50%);
      background: rgba(15, 23, 42, 0.92);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      color: #f8fafc;
      padding: 5px 6px 5px 12px;
      border-radius: 9999px;
      font-size: 13px; font-weight: 500;
      box-shadow: 0 16px 36px -4px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.12);
      display: flex; align-items: center; gap: 10px;
      pointer-events: auto;
      z-index: 2147483647;
      user-select: none;
      max-width: 95vw;
    `;

    this.renderBanner();

    this.container.appendChild(this.hoverOverlayBox);
    this.container.appendChild(this.selectionBox);
    this.container.appendChild(this.banner);
    document.documentElement.appendChild(this.container);
  }

  private renderBanner(): void {
    if (!this.banner) return;

    this.banner.innerHTML = `
      <style>
        .ai-grabber-toolbar {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          color: #f8fafc;
          font-size: 13px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          user-select: none;
        }
        .ai-grabber-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 3px 8px;
          background: rgba(56, 189, 248, 0.12);
          border: 1px solid rgba(56, 189, 248, 0.28);
          border-radius: 9999px;
          font-size: 12px;
          font-weight: 600;
          color: #38bdf8;
          white-space: nowrap;
        }
        .ai-grabber-dot {
          width: 6px;
          height: 6px;
          background: #38bdf8;
          border-radius: 50%;
          box-shadow: 0 0 6px #38bdf8;
        }
        .ai-grabber-hint {
          color: #94a3b8;
          font-size: 12px;
          white-space: nowrap;
        }
        .ai-grabber-separator {
          width: 1px;
          height: 14px;
          background: rgba(255, 255, 255, 0.15);
          margin: 0 2px;
        }
        .ai-grabber-button-group {
          display: inline-flex;
          align-items: center;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 9999px;
          padding: 2px;
          gap: 2px;
        }
        .ai-grabber-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 9999px;
          font-size: 12px;
          font-weight: 500;
          line-height: 1;
          cursor: pointer;
          border: none;
          background: transparent;
          color: #e2e8f0;
          transition: all 0.15s ease;
          outline: none;
          box-sizing: border-box;
          white-space: nowrap;
        }
        .ai-grabber-btn:hover {
          background: rgba(255, 255, 255, 0.12);
          color: #ffffff;
        }
        .ai-grabber-btn:active {
          transform: scale(0.96);
          background: rgba(255, 255, 255, 0.16);
        }
        .ai-grabber-btn-danger {
          color: #f87171;
        }
        .ai-grabber-btn-danger:hover {
          background: rgba(239, 68, 68, 0.18);
          color: #fca5a5;
        }
        .ai-grabber-kbd {
          background: rgba(255, 255, 255, 0.12);
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 4px;
          padding: 1px 4px;
          font-size: 10px;
          font-family: ui-monospace, monospace;
          color: inherit;
        }
      </style>
      <div class="ai-grabber-toolbar">
        <div class="ai-grabber-badge">
          <span class="ai-grabber-dot"></span>
          <span>点选 / 拖拽框选</span>
        </div>
        <span class="ai-grabber-hint">点击单个元素，或按住鼠标向下拖动框选区域</span>
        <div class="ai-grabber-separator"></div>
        <div class="ai-grabber-button-group">
          <button id="ai-banner-fullpage-btn" class="ai-grabber-btn" title="截取当前网页完整页面">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            <span>截取整页</span>
          </button>
          <button id="ai-banner-exit-btn" class="ai-grabber-btn ai-grabber-btn-danger" title="退出截取 (Esc)">
            <span class="ai-grabber-kbd">Esc</span>
            <span>退出</span>
          </button>
        </div>
      </div>
    `;

    this.banner.querySelector('#ai-banner-exit-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.stop();
    });

    this.banner.querySelector('#ai-banner-fullpage-btn')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      this.stop(false);
      // Trigger full page capture
      try {
        const fullWidth = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0, window.innerWidth);
        const fullHeight = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0, window.innerHeight);
        const pageRect = { left: 0, top: 0, width: fullWidth, height: fullHeight };
        const screenshot = await captureAndCropArea(pageRect, (progress) => {
          chrome.runtime.sendMessage({ type: 'SCREENSHOT_PROGRESS', payload: progress }).catch(() => {});
        });
        const content = extractFullPageContent(screenshot);
        chrome.runtime.sendMessage({ type: 'ELEMENT_GRABBED', payload: content });
      } catch (err) {
        console.error('[AI Collector] Full page capture error:', err);
      }
    });
  }


  private removeOverlay(): void {
    if (this.container?.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.container = null;
    this.hoverOverlayBox = null;
    this.hoverBadge = null;
    this.selectionBox = null;
    this.selectionBadge = null;
    this.banner = null;
  }

  // ── Event Handlers ──────────────────────────────────────────────

  private attachEvents(): void {
    window.addEventListener('mousemove', this.handleMouseMove, true);
    window.addEventListener('mousedown', this.handleMouseDown, true);
    window.addEventListener('mouseup', this.handleMouseUp, true);
    window.addEventListener('click', this.handleClick, true);
    window.addEventListener('keydown', this.handleKeyDown, true);
    window.addEventListener('scroll', this.handleScroll, true);
    window.addEventListener('dragstart', this.handleNativeDragStart, true);
  }

  private detachEvents(): void {
    window.removeEventListener('mousemove', this.handleMouseMove, true);
    window.removeEventListener('mousedown', this.handleMouseDown, true);
    window.removeEventListener('mouseup', this.handleMouseUp, true);
    window.removeEventListener('click', this.handleClick, true);
    window.removeEventListener('keydown', this.handleKeyDown, true);
    window.removeEventListener('scroll', this.handleScroll, true);
    window.removeEventListener('dragstart', this.handleNativeDragStart, true);
  }

  private handleNativeDragStart(e: DragEvent): void {
    if (this.active) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  private handleMouseMove(e: MouseEvent): void {
    if (!this.active) return;

    this.lastMousePage = { x: e.pageX, y: e.pageY };
    this.lastClientY = e.clientY;

    // 1. Mouse Dragging Mode
    if (this.isMouseDown) {
      const dx = Math.abs(e.pageX - this.dragStartPage.x);
      const dy = Math.abs(e.pageY - this.dragStartPage.y);

      if (!this.isDragging && (dx > 5 || dy > 5)) {
        this.isDragging = true;
        document.body.style.userSelect = 'none';
        if (this.hoverOverlayBox) this.hoverOverlayBox.style.display = 'none';
      }

      if (this.isDragging) {
        this.renderSelectionBox(this.dragStartPage, this.lastMousePage);
        this.checkAutoScroll(e.clientY);
        return;
      }
    }

    // 2. Hover Highlight Mode (for single click selection)
    const target = e.target as HTMLElement;
    if (!target || this.isInternalElement(target)) return;
    this.highlightHoverElement(target);
  }

  private handleMouseDown(e: MouseEvent): void {
    if (!this.active || e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (this.isInternalElement(target)) return;

    this.isMouseDown = true;
    this.isDragging = false;
    this.justDragged = false;
    this.dragStartPage = { x: e.pageX, y: e.pageY };
    this.lastClientY = e.clientY;
  }

  private handleMouseUp(e: MouseEvent): void {
    if (!this.active) return;
    this.stopAutoScroll();
    document.body.style.userSelect = '';

    if (this.isDragging) {
      e.preventDefault();
      e.stopPropagation();
      this.justDragged = true;

      const pageLeft = Math.min(this.dragStartPage.x, e.pageX);
      const pageTop = Math.min(this.dragStartPage.y, e.pageY);
      const pageWidth = Math.abs(e.pageX - this.dragStartPage.x);
      const pageHeight = Math.abs(e.pageY - this.dragStartPage.y);

      this.isMouseDown = false;
      this.isDragging = false;
      if (this.selectionBox) this.selectionBox.style.display = 'none';

      // Reset justDragged flag after click event tick
      setTimeout(() => {
        this.justDragged = false;
      }, 50);

      if (pageWidth >= 8 && pageHeight >= 8) {
        this.confirmAreaGrab({
          left: pageLeft,
          top: pageTop,
          right: pageLeft + pageWidth,
          bottom: pageTop + pageHeight,
          width: pageWidth,
          height: pageHeight,
        });
        return;
      }
    }

    this.isMouseDown = false;
    this.isDragging = false;
  }

  private handleClick(e: MouseEvent): void {
    if (!this.active) return;
    const target = e.target as HTMLElement;
    if (this.isInternalElement(target)) return;

    e.preventDefault();
    e.stopPropagation();

    // If this click is the result of completing a drag, ignore it
    if (this.isDragging || this.justDragged) {
      this.justDragged = false;
      return;
    }

    // Direct single click: Grab the clicked element immediately
    if (target) {
      this.confirmGrab(target);
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.active) return;

    if (e.key === 'Escape' || e.key === 'Esc' || e.code === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.stop(true);
      return;
    }

    if ((e.key === 'Enter' || e.code === 'Enter') && this.currentHoverElement) {
      e.preventDefault();
      e.stopPropagation();
      this.confirmGrab(this.currentHoverElement);
    }
  }

  private handleScroll(): void {
    if (!this.active) return;

    if (this.isDragging) {
      this.renderSelectionBox(this.dragStartPage, this.lastMousePage);
    } else if (this.currentHoverElement) {
      this.highlightHoverElement(this.currentHoverElement);
    }
  }

  // ── Hover Highlight ─────────────────────────────────────────────

  private highlightHoverElement(el: HTMLElement): void {
    this.currentHoverElement = el;
    if (!this.hoverOverlayBox || !this.hoverBadge || this.isDragging) return;

    const rect = el.getBoundingClientRect();
    this.hoverOverlayBox.style.display = 'block';
    this.hoverOverlayBox.style.top = `${rect.top}px`;
    this.hoverOverlayBox.style.left = `${rect.left}px`;
    this.hoverOverlayBox.style.width = `${rect.width}px`;
    this.hoverOverlayBox.style.height = `${rect.height}px`;

    const tagName = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    const className = el.classList.length > 0 ? `.${Array.from(el.classList).slice(0, 1).join('.')}` : '';
    const dimensions = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
    this.hoverBadge.textContent = `${tagName}${id}${className} (${dimensions}) - 点击直接选取`;

    if (rect.top < 32) {
      this.hoverBadge.style.top = '4px';
      this.hoverBadge.style.left = '4px';
    } else {
      this.hoverBadge.style.top = '-26px';
      this.hoverBadge.style.left = '0px';
    }
  }

  // ── Drag Selection Box ──────────────────────────────────────────

  private renderSelectionBox(p1: { x: number; y: number }, p2: { x: number; y: number }): void {
    if (!this.selectionBox || !this.selectionBadge) return;

    const startClientX = p1.x - window.scrollX;
    const startClientY = p1.y - window.scrollY;
    const currentClientX = p2.x - window.scrollX;
    const currentClientY = p2.y - window.scrollY;

    const left = Math.min(startClientX, currentClientX);
    const top = Math.min(startClientY, currentClientY);
    const width = Math.abs(currentClientX - startClientX);
    const height = Math.abs(currentClientY - startClientY);

    this.selectionBox.style.display = 'block';
    this.selectionBox.style.left = `${left}px`;
    this.selectionBox.style.top = `${top}px`;
    this.selectionBox.style.width = `${width}px`;
    this.selectionBox.style.height = `${height}px`;

    this.selectionBadge.textContent = `${Math.round(width)} × ${Math.round(height)} px (松开鼠标完成选区)`;
    if (top < 32) {
      this.selectionBadge.style.top = '4px';
      this.selectionBadge.style.left = '4px';
    } else {
      this.selectionBadge.style.top = '-26px';
      this.selectionBadge.style.left = '0px';
    }
  }

  // ── Auto Scroll ─────────────────────────────────────────────────

  private checkAutoScroll(clientY: number): void {
    const edgeThreshold = 50;
    const viewHeight = window.innerHeight;

    if (clientY < edgeThreshold) {
      const speed = Math.max(3, Math.round((edgeThreshold - clientY) / 3));
      this.startAutoScroll(-speed);
    } else if (clientY > viewHeight - edgeThreshold) {
      const speed = Math.max(3, Math.round((clientY - (viewHeight - edgeThreshold)) / 3));
      this.startAutoScroll(speed);
    } else {
      this.stopAutoScroll();
    }
  }

  private startAutoScroll(speed: number): void {
    if (this.autoScrollTimer !== null) return;
    const step = () => {
      if (!this.isDragging) {
        this.stopAutoScroll();
        return;
      }
      window.scrollBy(0, speed);
      this.lastMousePage = {
        x: this.lastMousePage.x,
        y: this.lastClientY + window.scrollY,
      };

      this.renderSelectionBox(this.dragStartPage, this.lastMousePage);
      this.autoScrollTimer = requestAnimationFrame(step);
    };
    this.autoScrollTimer = requestAnimationFrame(step);
  }

  private stopAutoScroll(): void {
    if (this.autoScrollTimer !== null) {
      cancelAnimationFrame(this.autoScrollTimer);
      this.autoScrollTimer = null;
    }
  }

  // ── Confirm & Submit ────────────────────────────────────────────

  private async confirmGrab(el: HTMLElement): Promise<void> {
    const clientRect = el.getBoundingClientRect();
    const pageRect: AreaPageRect = {
      left: clientRect.left + window.scrollX,
      top: clientRect.top + window.scrollY,
      width: clientRect.width,
      height: clientRect.height,
    };

    // Temporarily hide overlay UI
    if (this.container) {
      this.container.style.display = 'none';
    }

    // Only capture immediately if fully visible in current viewport without scrolling.
    // For long / cross-screen elements, defer multi-screen scrolling capture until user clicks "区域截图".
    const viewportW = window.innerWidth || document.documentElement.clientWidth || 1;
    const viewportH = window.innerHeight || document.documentElement.clientHeight || 1;
    const isFullyVisibleInViewport =
      pageRect.height <= viewportH &&
      pageRect.width <= viewportW &&
      clientRect.top >= 0 &&
      clientRect.bottom <= viewportH &&
      clientRect.left >= 0 &&
      clientRect.right <= viewportW;

    let screenshot: string | undefined = undefined;
    if (isFullyVisibleInViewport) {
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 30)));
      screenshot = await captureAndCropArea(pageRect);
    }

    const content = this.extractContent(el, screenshot, pageRect);

    chrome.runtime.sendMessage({
      type: 'ELEMENT_GRABBED',
      payload: content,
    });
    this.stop(false);
  }

  private async confirmAreaGrab(rect: SelectionBoxRect): Promise<void> {
    const pageRect: AreaPageRect = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };

    // Temporarily hide overlay UI
    if (this.container) {
      this.container.style.display = 'none';
    }

    // Only capture immediately if fully visible in current viewport without scrolling
    const viewportW = window.innerWidth || document.documentElement.clientWidth || 1;
    const viewportH = window.innerHeight || document.documentElement.clientHeight || 1;
    const isFullyVisibleInViewport =
      rect.height <= viewportH &&
      rect.width <= viewportW &&
      rect.top >= window.scrollY &&
      rect.top + rect.height <= window.scrollY + viewportH &&
      rect.left >= window.scrollX &&
      rect.left + rect.width <= window.scrollX + viewportW;

    let screenshot: string | undefined = undefined;
    if (isFullyVisibleInViewport) {
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 30)));
      screenshot = await captureAndCropArea(pageRect);
    }

    const content = this.extractAreaContent(rect, screenshot, pageRect);

    chrome.runtime.sendMessage({
      type: 'ELEMENT_GRABBED',
      payload: content,
    });
    this.stop(false);
  }

  // ── Utilities ───────────────────────────────────────────────────

  private isInternalElement(el: HTMLElement): boolean {
    return !!el.closest('#ai-workstation-grabber-container');
  }

  private generateSelector(el: HTMLElement): string {
    if (el.id) return `#${el.id}`;
    const parts: string[] = [];
    let curr: HTMLElement | null = el;
    while (curr && curr !== document.body && curr !== document.documentElement) {
      let segment = curr.tagName.toLowerCase();
      if (curr.className && typeof curr.className === 'string') {
        const cls = curr.className.trim().split(/\s+/).filter(Boolean)[0];
        if (cls) segment += `.${cls}`;
      }
      parts.unshift(segment);
      curr = curr.parentElement;
    }
    return parts.slice(-3).join(' > ') || el.tagName.toLowerCase();
  }

  // ── Content Extraction ──────────────────────────────────────────

  private extractContent(
    el: HTMLElement,
    screenshot?: string,
    pageRect?: AreaPageRect,
  ): GrabbedContent {
    const rect = el.getBoundingClientRect();
    const tdk = extractPageTDK(document);
    const images = extractImagesFromElement(el, window.location.href);
    const videos = extractVideosFromElement(el, window.location.href);

    const links: string[] = [];
    if (el.tagName.toLowerCase() === 'a' && (el as HTMLAnchorElement).href) {
      links.push((el as HTMLAnchorElement).href);
    }
    el.querySelectorAll('a').forEach((a) => {
      if (a.href && !links.includes(a.href)) links.push(a.href);
    });

    return {
      id: `grab_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      url: window.location.href,
      tdk,
      selectedHtml: normalizeHtml(el, window.location.href),
      selectedText: el.innerText || el.textContent || '',
      selector: this.generateSelector(el),
      tag: el.tagName.toLowerCase(),
      dimensions: { width: Math.round(rect.width), height: Math.round(rect.height) },
      images,
      videos,
      links,
      screenshot,
      pageRect: pageRect
        ? {
            left: Math.round(pageRect.left),
            top: Math.round(pageRect.top),
            width: Math.round(pageRect.width),
            height: Math.round(pageRect.height),
          }
        : undefined,
      pageScroll: { x: window.scrollX || 0, y: window.scrollY || 0 },
      createdAt: Date.now(),
    };
  }

  /**
   * Extract content from bounding box rectangle.
   *
   * Evaluates all elements in document/page coordinates for scroll-independent accuracy.
   */
  private extractAreaContent(
    rect: SelectionBoxRect,
    screenshot?: string,
    pageRect?: AreaPageRect,
  ): GrabbedContent {
    const tdk = extractPageTDK(document);
    const allElements = Array.from(document.querySelectorAll<HTMLElement>('body *'));
    const selectionArea = rect.width * rect.height;

    // Helper to calculate geometric intersection in page coordinates
    const getIntersection = (elPage: { left: number; top: number; right: number; bottom: number; width: number; height: number }) => {
      if (elPage.width === 0 || elPage.height === 0) return null;

      const intersectLeft = Math.max(elPage.left, rect.left);
      const intersectTop = Math.max(elPage.top, rect.top);
      const intersectRight = Math.min(elPage.right, rect.right);
      const intersectBottom = Math.min(elPage.bottom, rect.bottom);

      const intersectWidth = Math.max(0, intersectRight - intersectLeft);
      const intersectHeight = Math.max(0, intersectBottom - intersectTop);
      const intersectArea = intersectWidth * intersectHeight;

      if (intersectArea <= 0) return null;

      const elArea = elPage.width * elPage.height;
      const overlapRatio = elArea > 0 ? intersectArea / elArea : 0;
      const centerX = elPage.left + elPage.width / 2;
      const centerY = elPage.top + elPage.height / 2;
      const centerInBox =
        centerX >= rect.left && centerX <= rect.right &&
        centerY >= rect.top && centerY <= rect.bottom;

      return {
        intersectArea,
        elArea,
        overlapRatio,
        centerInBox,
      };
    };

    // Helper to compute element's page coordinates
    const getElementPageRect = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return {
        left: r.left + window.scrollX,
        top: r.top + window.scrollY,
        right: r.right + window.scrollX,
        bottom: r.bottom + window.scrollY,
        width: r.width,
        height: r.height,
      };
    };

    // 1. Direct scan for all image / media elements intersecting the selection area
    const allImages: string[] = [];
    const allVideos: GrabbedVideo[] = [];
    const addedVideoUrls = new Set<string>();

    const addExtractedVideos = (videos: GrabbedVideo[]) => {
      for (const v of videos) {
        if (!addedVideoUrls.has(v.src)) {
          addedVideoUrls.add(v.src);
          allVideos.push(v);
          if (v.poster && !allImages.includes(v.poster)) {
            allImages.push(v.poster);
          }
        }
      }
    };

    const mediaElements = Array.from(
      document.querySelectorAll<HTMLElement>(
        'img, picture, figure, svg image, video, [tt-videoid], [data-video-url], [data-poster], [tt-poster], [data-bg], [data-background]',
      ),
    );
    for (const mediaEl of mediaElements) {
      if (this.isInternalElement(mediaEl)) continue;
      const elPage = getElementPageRect(mediaEl);
      const info = getIntersection(elPage);
      if (!info) continue;

      // If center is in box or has visible overlap
      if (info.centerInBox || info.overlapRatio >= 0.05 || info.intersectArea >= 30) {
        const extractedImgs = extractImagesFromElement(mediaEl, window.location.href);
        for (const imgUrl of extractedImgs) {
          if (!allImages.includes(imgUrl)) {
            allImages.push(imgUrl);
          }
        }

        const extractedVids = extractVideosFromElement(mediaEl, window.location.href);
        addExtractedVideos(extractedVids);
      }
    }

    // 2. Candidate content elements
    const candidates: HTMLElement[] = [];
    const contentTagRegex = /^(p|h[1-6]|li|blockquote|pre|code|table|tr|figure|figcaption|article|section|div|span|a|ul|ol|dd|dt)$/i;

    for (let i = 0; i < allElements.length; i++) {
      const el = allElements[i];
      if (!el || this.isInternalElement(el)) continue;

      const elPage = getElementPageRect(el);
      const info = getIntersection(elPage);
      if (!info) continue;

      // Skip massive wrapper containers (e.g. body wrappers, #app) that dwarf the selection
      if (info.elArea > selectionArea * 3.5 && info.overlapRatio < 0.65) {
        continue;
      }

      // Check if element is a valid candidate
      const isContentTag = contentTagRegex.test(el.tagName);
      const isCandidate =
        info.centerInBox ||
        info.overlapRatio >= 0.2 ||
        (isContentTag && info.intersectArea >= 30);

      if (isCandidate) {
        candidates.push(el);
      }
    }

    // 3. Keep top-level selected elements to avoid nested duplicate text / HTML
    const topLevel = candidates.filter((el) => {
      let p = el.parentElement;
      while (p && p !== document.body && p !== document.documentElement) {
        if (candidates.includes(p)) {
          const pr = getElementPageRect(p);
          // If parent is not an oversized container, let parent encapsulate this child
          if (pr.width * pr.height <= selectionArea * 1.5) {
            return false;
          }
        }
        p = p.parentElement;
      }
      return true;
    });

    // 4. Fallback if no candidates found
    if (topLevel.length === 0 && candidates.length === 0) {
      let bestEl: HTMLElement | null = null;
      let maxIntersect = 0;

      for (let i = 0; i < allElements.length; i++) {
        const el = allElements[i];
        if (!el || this.isInternalElement(el)) continue;
        const elPage = getElementPageRect(el);
        const info = getIntersection(elPage);
        if (info && info.intersectArea > maxIntersect) {
          maxIntersect = info.intersectArea;
          bestEl = el;
        }
      }

      if (bestEl) {
        return this.extractContent(bestEl);
      }
    }

    const selectedElements = topLevel.length > 0 ? topLevel : candidates;

    // 5. Sort elements by natural DOM order for coherent reading
    selectedElements.sort((a, b) => {
      const pos = a.compareDocumentPosition(b);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });

    // 6. Aggregate text, HTML, images, videos and links
    const textPieces: string[] = [];
    const htmlPieces: string[] = [];
    const allLinks: string[] = [];

    selectedElements.forEach((el) => {
      const text = (el.innerText || el.textContent || '').trim();
      if (text && !textPieces.includes(text)) {
        textPieces.push(text);
      }

      htmlPieces.push(normalizeHtml(el, window.location.href));

      // Extract images from selected subtree
      extractImagesFromElement(el, window.location.href).forEach((img) => {
        if (!allImages.includes(img)) {
          allImages.push(img);
        }
      });

      // Extract videos from selected subtree
      addExtractedVideos(extractVideosFromElement(el, window.location.href));

      if (el.tagName.toLowerCase() === 'a' && (el as HTMLAnchorElement).href) {
        const href = (el as HTMLAnchorElement).href;
        if (!allLinks.includes(href)) allLinks.push(href);
      }
      el.querySelectorAll('a').forEach((a) => {
        if (a.href && !allLinks.includes(a.href)) allLinks.push(a.href);
      });
    });

    return {
      id: `grab_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      url: window.location.href,
      tdk,
      selectedHtml: htmlPieces.length === 1 ? htmlPieces[0]! : `<div class="drag-selected-area">\n${htmlPieces.join('\n')}\n</div>`,
      selectedText: textPieces.join('\n\n'),
      selector: selectedElements.length === 1 ? this.generateSelector(selectedElements[0]!) : 'box-selection',
      tag: selectedElements.length === 1 ? selectedElements[0]!.tagName.toLowerCase() : 'selection-area',
      dimensions: { width: Math.round(rect.width), height: Math.round(rect.height) },
      images: allImages,
      videos: allVideos,
      links: allLinks,
      screenshot,
      pageRect: pageRect
        ? {
            left: Math.round(pageRect.left),
            top: Math.round(pageRect.top),
            width: Math.round(pageRect.width),
            height: Math.round(pageRect.height),
          }
        : undefined,
      pageScroll: { x: window.scrollX || 0, y: window.scrollY || 0 },
      createdAt: Date.now(),
    };
  }
}

/**
 * Extract full webpage metadata, media, and text content for full page grab
 */
export function extractFullPageContent(screenshot?: string): GrabbedContent {
  const rootEl = document.body || document.documentElement;
  const fullWidth = Math.max(
    document.documentElement.scrollWidth,
    document.body?.scrollWidth || 0,
    window.innerWidth,
  );
  const fullHeight = Math.max(
    document.documentElement.scrollHeight,
    document.body?.scrollHeight || 0,
    window.innerHeight,
  );

  const tdk = extractPageTDK(document);
  const images = extractImagesFromElement(rootEl, window.location.href);
  const videos = extractVideosFromElement(rootEl, window.location.href);

  const linkSet = new Set<string>();
  document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => {
    if (a.href && !a.href.startsWith('javascript:')) {
      linkSet.add(a.href);
    }
  });

  return {
    id: `page_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    url: window.location.href,
    tdk,
    selectedHtml: normalizeHtml(rootEl, window.location.href),
    selectedText: (rootEl.innerText || rootEl.textContent || '').trim(),
    selector: 'html',
    tag: 'page',
    dimensions: { width: Math.round(fullWidth), height: Math.round(fullHeight) },
    images,
    videos,
    links: Array.from(linkSet),
    screenshot,
    pageRect: {
      left: 0,
      top: 0,
      width: Math.round(fullWidth),
      height: Math.round(fullHeight),
    },
    pageScroll: { x: 0, y: 0 },
    createdAt: Date.now(),
  };
}

