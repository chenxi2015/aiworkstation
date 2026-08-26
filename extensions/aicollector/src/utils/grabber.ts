import type { GrabbedContent } from '../types';
import { extractPageTDK } from './tdk';
import { extractImagesFromElement } from './imageExtractor';
import { normalizeHtml } from './htmlNormalizer';

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
 * - Hover: mouse movement highlights elements
 * - Click: immediately grabs the highlighted element
 * - Drag: hold mouse and drag to draw a selection box, grabs area content on release
 * - Arrow keys: ↑ expand to parent, ↓ shrink to child
 * - Esc: exit grab mode
 */
export class VisualGrabber {
  private active = false;
  private currentElement: HTMLElement | null = null;
  private container: HTMLDivElement | null = null;
  private overlayBox: HTMLDivElement | null = null;
  private badge: HTMLDivElement | null = null;
  private banner: HTMLDivElement | null = null;
  private dragBox: HTMLDivElement | null = null;
  private dragBadge: HTMLDivElement | null = null;

  // Drag state
  private isMouseDown = false;
  private isDragging = false;
  private dragStart = { x: 0, y: 0 };
  private dragCurrent = { x: 0, y: 0 };

  constructor() {
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleScroll = this.handleScroll.bind(this);
  }

  public start(): void {
    if (this.active) return;
    this.active = true;
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
    this.active = false;
    this.detachEvents();
    this.removeOverlay();
    this.currentElement = null;
    this.isMouseDown = false;
    this.isDragging = false;
    document.body.style.userSelect = '';

    if (notifyCancel) {
      chrome.runtime.sendMessage({ type: 'VISUAL_GRAB_CANCELLED' }).catch(() => {});
    }
  }

  public isActive(): boolean {
    return this.active;
  }

  // ── Overlay ─────────────────────────────────────────────────────

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

    // Highlight bounding box
    this.overlayBox = document.createElement('div');
    this.overlayBox.style.cssText = `
      position: absolute;
      border: 2px solid #6366f1;
      background-color: rgba(99, 102, 241, 0.10);
      border-radius: 4px;
      transition: all 0.08s ease-out;
      pointer-events: none;
      box-shadow: 0 0 0 1px rgba(255,255,255,0.6), 0 4px 20px rgba(99,102,241,0.25);
      display: none;
    `;

    this.badge = document.createElement('div');
    this.badge.style.cssText = `
      position: absolute; top: -28px; left: 0;
      background: #4f46e5; color: #fff;
      padding: 3px 8px; border-radius: 4px;
      font-size: 11px; font-weight: 600;
      white-space: nowrap; pointer-events: none;
      box-shadow: 0 2px 6px rgba(0,0,0,0.2);
    `;
    this.overlayBox.appendChild(this.badge);

    // Drag rubberband box
    this.dragBox = document.createElement('div');
    this.dragBox.style.cssText = `
      position: absolute;
      border: 2px dashed #6366f1;
      background-color: rgba(99, 102, 241, 0.15);
      border-radius: 6px;
      pointer-events: none;
      box-shadow: 0 0 0 1px rgba(255,255,255,0.7), 0 8px 30px rgba(99,102,241,0.3);
      display: none;
      z-index: 2147483647;
    `;
    this.dragBadge = document.createElement('div');
    this.dragBadge.style.cssText = `
      position: absolute; top: -28px; left: 0;
      background: #4338ca; color: #fff;
      padding: 3px 10px; border-radius: 4px;
      font-size: 11px; font-weight: 600;
      white-space: nowrap; pointer-events: none;
      box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    `;
    this.dragBox.appendChild(this.dragBadge);

    // Top banner
    this.banner = document.createElement('div');
    this.banner.style.cssText = `
      position: fixed; top: 16px; left: 50%;
      transform: translateX(-50%);
      background: rgba(15, 23, 42, 0.94);
      backdrop-filter: blur(12px);
      color: #f8fafc;
      padding: 7px 18px;
      border-radius: 30px;
      font-size: 13px; font-weight: 500;
      box-shadow: 0 12px 30px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.12);
      display: flex; align-items: center; gap: 10px;
      pointer-events: auto;
      z-index: 2147483647;
      user-select: none;
    `;
    this.banner.innerHTML = `
      <span style="display:inline-flex;align-items:center;gap:6px;">
        <span style="width:8px;height:8px;background:#22c55e;border-radius:50%;display:inline-block;"></span>
        <strong>选择网页区域</strong>
      </span>
      <span style="color:#475569;">|</span>
      <span style="color:#cbd5e1;font-size:12px;">点击选取</span>
      <span style="color:#475569;">|</span>
      <span style="color:#cbd5e1;font-size:12px;">拖拽框选</span>
      <span style="color:#475569;">|</span>
      <button id="ai-banner-exit-btn" style="background:rgba(239, 68, 68, 0.12);color:#fca5a5;border:1px solid rgba(239, 68, 68, 0.35);padding:3px 10px;border-radius:16px;font-size:12px;cursor:pointer;font-weight:500;transition:all 0.15s ease;display:inline-flex;align-items:center;gap:4px;">
        <kbd style="background:rgba(0,0,0,0.3);padding:1px 5px;border-radius:3px;font-size:10px;color:#fecaca;">Esc</kbd> 退出
      </button>
    `;
    this.banner.querySelector('#ai-banner-exit-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.stop();
    });

    this.container.appendChild(this.overlayBox);
    this.container.appendChild(this.dragBox);
    this.container.appendChild(this.banner);
    document.documentElement.appendChild(this.container);
  }

  private removeOverlay(): void {
    if (this.container?.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.container = null;
    this.overlayBox = null;
    this.badge = null;
    this.banner = null;
    this.dragBox = null;
    this.dragBadge = null;
  }

  // ── Events ──────────────────────────────────────────────────────

  private attachEvents(): void {
    window.addEventListener('mousemove', this.handleMouseMove, true);
    window.addEventListener('mousedown', this.handleMouseDown, true);
    window.addEventListener('mouseup', this.handleMouseUp, true);
    window.addEventListener('click', this.handleClick, true);
    window.addEventListener('keydown', this.handleKeyDown, true);
    window.addEventListener('scroll', this.handleScroll, true);
  }

  private detachEvents(): void {
    window.removeEventListener('mousemove', this.handleMouseMove, true);
    window.removeEventListener('mousedown', this.handleMouseDown, true);
    window.removeEventListener('mouseup', this.handleMouseUp, true);
    window.removeEventListener('click', this.handleClick, true);
    window.removeEventListener('keydown', this.handleKeyDown, true);
    window.removeEventListener('scroll', this.handleScroll, true);
  }

  private handleMouseDown(e: MouseEvent): void {
    if (!this.active || e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (this.isInternalElement(target)) return;

    this.isMouseDown = true;
    this.isDragging = false;
    this.dragStart = { x: e.clientX, y: e.clientY };
    this.dragCurrent = { x: e.clientX, y: e.clientY };
  }

  private handleMouseMove(e: MouseEvent): void {
    if (!this.active) return;

    if (this.isMouseDown) {
      this.dragCurrent = { x: e.clientX, y: e.clientY };
      const dx = Math.abs(this.dragCurrent.x - this.dragStart.x);
      const dy = Math.abs(this.dragCurrent.y - this.dragStart.y);

      if (!this.isDragging && (dx > 5 || dy > 5)) {
        this.isDragging = true;
        document.body.style.userSelect = 'none';
        if (this.overlayBox) this.overlayBox.style.display = 'none';
      }

      if (this.isDragging) {
        this.updateDragBox();
        return;
      }
    }

    // Normal hover highlight
    const target = e.target as HTMLElement;
    if (!target || this.isInternalElement(target)) return;
    this.highlightElement(target);
  }

  private handleMouseUp(e: MouseEvent): void {
    if (!this.active) return;
    document.body.style.userSelect = '';

    if (this.isDragging) {
      e.preventDefault();
      e.stopPropagation();

      const left = Math.min(this.dragStart.x, this.dragCurrent.x);
      const top = Math.min(this.dragStart.y, this.dragCurrent.y);
      const width = Math.abs(this.dragCurrent.x - this.dragStart.x);
      const height = Math.abs(this.dragCurrent.y - this.dragStart.y);

      this.isMouseDown = false;
      this.isDragging = false;
      if (this.dragBox) this.dragBox.style.display = 'none';

      if (width >= 12 && height >= 12) {
        this.confirmAreaGrab({ left, top, right: left + width, bottom: top + height, width, height });
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
    if (this.isDragging) return;

    if (this.currentElement) {
      this.confirmGrab(this.currentElement);
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
  }

  private handleScroll(): void {
    if (this.active && this.currentElement && !this.isDragging) {
      this.highlightElement(this.currentElement);
    }
  }

  // ── UI helpers ──────────────────────────────────────────────────

  private highlightElement(el: HTMLElement): void {
    this.currentElement = el;
    if (!this.overlayBox || !this.badge) return;

    const rect = el.getBoundingClientRect();
    this.overlayBox.style.display = 'block';
    this.overlayBox.style.top = `${rect.top}px`;
    this.overlayBox.style.left = `${rect.left}px`;
    this.overlayBox.style.width = `${rect.width}px`;
    this.overlayBox.style.height = `${rect.height}px`;

    const tagName = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    const className = el.classList.length > 0 ? `.${Array.from(el.classList).slice(0, 2).join('.')}` : '';
    const dimensions = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
    this.badge.textContent = `${tagName}${id}${className} (${dimensions})`;

    if (rect.top < 32) {
      this.badge.style.top = '4px';
      this.badge.style.left = '4px';
    } else {
      this.badge.style.top = '-26px';
      this.badge.style.left = '0px';
    }
  }

  private updateDragBox(): void {
    if (!this.dragBox || !this.dragBadge) return;

    const left = Math.min(this.dragStart.x, this.dragCurrent.x);
    const top = Math.min(this.dragStart.y, this.dragCurrent.y);
    const width = Math.abs(this.dragCurrent.x - this.dragStart.x);
    const height = Math.abs(this.dragCurrent.y - this.dragStart.y);

    this.dragBox.style.display = 'block';
    this.dragBox.style.left = `${left}px`;
    this.dragBox.style.top = `${top}px`;
    this.dragBox.style.width = `${width}px`;
    this.dragBox.style.height = `${height}px`;

    this.dragBadge.textContent = `${Math.round(width)} × ${Math.round(height)} px`;
    if (top < 32) {
      this.dragBadge.style.top = '4px';
      this.dragBadge.style.left = '4px';
    } else {
      this.dragBadge.style.top = '-26px';
      this.dragBadge.style.left = '0px';
    }
  }

  // ── Confirm & Submit ────────────────────────────────────────────

  private confirmGrab(el: HTMLElement): void {
    chrome.runtime.sendMessage({
      type: 'ELEMENT_GRABBED',
      payload: this.extractContent(el),
    });
    this.stop(false);
  }

  private confirmAreaGrab(rect: SelectionBoxRect): void {
    chrome.runtime.sendMessage({
      type: 'ELEMENT_GRABBED',
      payload: this.extractAreaContent(rect),
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

  // ── Content extraction ──────────────────────────────────────────

  private extractContent(el: HTMLElement): GrabbedContent {
    const rect = el.getBoundingClientRect();
    const tdk = extractPageTDK(document);
    const images = extractImagesFromElement(el, window.location.href);

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
      links,
      createdAt: Date.now(),
    };
  }

  /**
   * Extract content from drag-selected bounding box.
   *
   * Algorithm: collect leaf-ish elements whose CENTER POINT falls inside the
   * selection box. This avoids the problem where large wrapper containers
   * (whose bounding rect spans the entire page) get incorrectly included.
   */
  private extractAreaContent(rect: SelectionBoxRect): GrabbedContent {
    const tdk = extractPageTDK(document);
    const allElements = document.querySelectorAll('body *');
    const candidates: HTMLElement[] = [];

    for (let i = 0; i < allElements.length; i++) {
      const el = allElements[i] as HTMLElement;
      if (this.isInternalElement(el)) continue;

      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;

      // Use center-point containment: the element's center must be inside the selection box
      const centerX = r.left + r.width / 2;
      const centerY = r.top + r.height / 2;
      const centerInBox =
        centerX >= rect.left && centerX <= rect.right &&
        centerY >= rect.top && centerY <= rect.bottom;

      if (!centerInBox) continue;

      // Skip elements significantly larger than selection box (wrapper containers)
      const selectionArea = rect.width * rect.height;
      const elArea = r.width * r.height;
      if (elArea > selectionArea * 3) continue;

      candidates.push(el);
    }

    // Keep only top-level elements to avoid nested duplication
    const topLevel = candidates.filter((el) => {
      let p = el.parentElement;
      while (p && p !== document.body) {
        if (candidates.includes(p)) return false;
        p = p.parentElement;
      }
      return true;
    });

    // If no candidates found via center-point, fall back to finding the
    // smallest element that intersects with the selection box
    if (topLevel.length === 0) {
      let bestEl: HTMLElement | null = null;
      let bestArea = Infinity;

      for (let i = 0; i < allElements.length; i++) {
        const el = allElements[i] as HTMLElement;
        if (this.isInternalElement(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;

        const isIntersecting = !(
          r.right < rect.left || r.left > rect.right ||
          r.bottom < rect.top || r.top > rect.bottom
        );

        if (isIntersecting) {
          const area = r.width * r.height;
          if (area < bestArea) {
            bestArea = area;
            bestEl = el;
          }
        }
      }

      if (bestEl) {
        return this.extractContent(bestEl);
      }
    }

    // Aggregate text, HTML, images and links from selected elements
    const textPieces: string[] = [];
    const htmlPieces: string[] = [];
    const allImages: GrabbedContent['images'] = [];
    const allLinks: string[] = [];

    const elements = topLevel.length > 0 ? topLevel : candidates;

    elements.forEach((el) => {
      const text = (el.innerText || el.textContent || '').trim();
      if (text) textPieces.push(text);
      htmlPieces.push(normalizeHtml(el, window.location.href));

      extractImagesFromElement(el, window.location.href).forEach((img) => {
        if (!allImages.includes(img)) allImages.push(img);
      });

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
      selector: topLevel.length === 1 ? this.generateSelector(topLevel[0]!) : 'box-selection',
      tag: topLevel.length === 1 ? topLevel[0]!.tagName.toLowerCase() : 'selection-area',
      dimensions: { width: Math.round(rect.width), height: Math.round(rect.height) },
      images: allImages,
      links: allLinks,
      createdAt: Date.now(),
    };
  }
}
