/**
 * Visual Element Grabber Controller
 *
 * Coordinates user interaction (hover click & drag-box selection),
 * visual overlays, auto-scrolling, and content extraction pipelines.
 */

import {
  captureAndCropArea,
  findScrollContainer,
  type AreaPageRect,
} from '../screenshotHelper';
import { GrabberOverlay } from './domOverlay';
import {
  extractElementContent,
  extractBoxAreaContent,
  extractFullPageContent,
} from './contentExtractor';
import type { SelectionBoxRect } from './types';

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

  // Overlay UI Manager
  private overlay: GrabberOverlay;

  constructor() {
    this.overlay = new GrabberOverlay();

    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleScroll = this.handleScroll.bind(this);
    this.handleNativeDragStart = this.handleNativeDragStart.bind(this);
    this.handleFullPageCapture = this.handleFullPageCapture.bind(this);
  }

  public start(): void {
    if (this.active) return;
    this.active = true;
    this.isMouseDown = false;
    this.isDragging = false;
    this.justDragged = false;

    this.overlay.create({
      onExit: () => this.stop(true),
      onFullPageCapture: this.handleFullPageCapture,
    });

    this.attachEvents();
    try {
      window.focus();
    } catch {
      // Ignore focus errors
    }
  }

  public stop(notifyCancel = true): void {
    if (!this.active) return;
    this.overlay.stopAutoScroll();
    this.active = false;
    this.detachEvents();
    this.overlay.destroy();
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

  // ── Event Attachment ────────────────────────────────────────────

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

  // ── Mouse & Keyboard Handlers ───────────────────────────────────

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
        this.overlay.hideHover();
      }

      if (this.isDragging) {
        this.overlay.showSelection(this.dragStartPage, this.lastMousePage);
        this.overlay.checkAutoScroll(e.clientY, this.isDragging, () => {
          this.lastMousePage = {
            x: this.lastMousePage.x,
            y: this.lastClientY + window.scrollY,
          };
          this.overlay.showSelection(this.dragStartPage, this.lastMousePage);
        });
        return;
      }
    }

    // 2. Hover Highlight Mode (for single click selection)
    const target = e.target as HTMLElement;
    if (!target || this.overlay.isInternalElement(target)) return;
    this.highlightHoverElement(target);
  }

  private handleMouseDown(e: MouseEvent): void {
    if (!this.active || e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (this.overlay.isInternalElement(target)) return;

    this.isMouseDown = true;
    this.isDragging = false;
    this.justDragged = false;
    this.dragStartPage = { x: e.pageX, y: e.pageY };
    this.lastClientY = e.clientY;
  }

  private handleMouseUp(e: MouseEvent): void {
    if (!this.active) return;
    this.overlay.stopAutoScroll();
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
      this.overlay.hideSelection();

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
    if (this.overlay.isInternalElement(target)) return;

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
      this.overlay.showSelection(this.dragStartPage, this.lastMousePage);
    } else if (this.currentHoverElement) {
      this.highlightHoverElement(this.currentHoverElement);
    }
  }

  // ── Hover Highlight ─────────────────────────────────────────────

  private highlightHoverElement(el: HTMLElement): void {
    this.currentHoverElement = el;
    if (this.isDragging) return;

    const rect = el.getBoundingClientRect();
    const tagName = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    const className = el.classList.length > 0 ? `.${Array.from(el.classList).slice(0, 1).join('.')}` : '';
    const dimensions = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
    const label = `${tagName}${id}${className} (${dimensions}) - 点击直接选取`;

    this.overlay.showHover(rect, label);
  }

  // ── Confirm Actions ─────────────────────────────────────────────

  private async confirmGrab(el: HTMLElement): Promise<void> {
    const clientRect = el.getBoundingClientRect();
    const rawPageRect: AreaPageRect = {
      left: clientRect.left + window.scrollX,
      top: clientRect.top + window.scrollY,
      width: clientRect.width,
      height: clientRect.height,
    };

    // Detect if target element or its ancestor/descendant is a scroll container
    const scrollContainer = findScrollContainer(rawPageRect, el);
    const isNestedScroll = scrollContainer !== window;
    const containerEl = isNestedScroll ? (scrollContainer as HTMLElement) : null;
    const containerScrollHeight = containerEl ? containerEl.scrollHeight : 0;
    const containerClientHeight = containerEl ? containerEl.clientHeight : 0;
    const hasInternalScroll =
      (containerEl !== null && containerScrollHeight > containerClientHeight + 10) ||
      (el.scrollHeight > el.clientHeight + 10);

    const effectiveHeight = Math.max(
      clientRect.height,
      el.scrollHeight || 0,
      el.offsetHeight || 0,
      hasInternalScroll ? containerScrollHeight : 0,
    );

    const pageRect: AreaPageRect = {
      ...rawPageRect,
      height: effectiveHeight,
    };

    // Temporarily hide overlay UI
    this.overlay.setVisible(false);

    // Only capture immediately if fully visible in current viewport without scrolling.
    // For long / cross-screen elements or internal scroll containers, defer multi-screen scrolling capture until user clicks "区域截图".
    const viewportW = window.innerWidth || document.documentElement.clientWidth || 1;
    const viewportH = window.innerHeight || document.documentElement.clientHeight || 1;
    const isFullyVisibleInViewport =
      !hasInternalScroll &&
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

    const content = extractElementContent(el, screenshot, pageRect);

    chrome.runtime.sendMessage({
      type: 'ELEMENT_GRABBED',
      payload: content,
    });
    this.stop(false);
  }

  private async confirmAreaGrab(rect: SelectionBoxRect): Promise<void> {
    const rawPageRect: AreaPageRect = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };

    const scrollContainer = findScrollContainer(rawPageRect);
    const isNestedScroll = scrollContainer !== window;
    const containerEl = isNestedScroll ? (scrollContainer as HTMLElement) : null;
    const hasInternalScroll =
      containerEl !== null && containerEl.scrollHeight > containerEl.clientHeight + 10;

    const effectiveHeight = hasInternalScroll
      ? Math.max(rect.height, containerEl.scrollHeight)
      : rect.height;

    const pageRect: AreaPageRect = {
      ...rawPageRect,
      height: effectiveHeight,
    };

    // Temporarily hide overlay UI
    this.overlay.setVisible(false);

    // Only capture immediately if fully visible in current viewport without scrolling
    const viewportW = window.innerWidth || document.documentElement.clientWidth || 1;
    const viewportH = window.innerHeight || document.documentElement.clientHeight || 1;
    const isFullyVisibleInViewport =
      !hasInternalScroll &&
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

    const content = extractBoxAreaContent(
      rect,
      (target) => this.overlay.isInternalElement(target),
      screenshot,
      pageRect,
    );

    chrome.runtime.sendMessage({
      type: 'ELEMENT_GRABBED',
      payload: content,
    });
    this.stop(false);
  }

  private async handleFullPageCapture(): Promise<void> {
    this.stop(false);
    try {
      const pageRect = { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
      const screenshot = await captureAndCropArea(pageRect, (progress) => {
        chrome.runtime.sendMessage({ type: 'SCREENSHOT_PROGRESS', payload: progress }).catch(() => {});
      });
      const content = extractFullPageContent(screenshot);
      chrome.runtime.sendMessage({ type: 'ELEMENT_GRABBED', payload: content });
    } catch (err) {
      console.error('[AI Collector] Full page capture error:', err);
    }
  }
}
