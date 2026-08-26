import type { GrabbedContent } from '../types';
import { extractPageTDK } from './tdk';

/**
 * Visual Element Grabber (inspired by react-grab)
 * Manages overlay inspection, hierarchy navigation, and content extraction
 */
export class VisualGrabber {
  private active = false;
  private currentElement: HTMLElement | null = null;
  private container: HTMLDivElement | null = null;
  private overlayBox: HTMLDivElement | null = null;
  private badge: HTMLDivElement | null = null;
  private banner: HTMLDivElement | null = null;

  constructor() {
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleScroll = this.handleScroll.bind(this);
  }

  /**
   * Start visual grab mode
   */
  public start(): void {
    if (this.active) return;
    this.active = true;
    this.createOverlay();
    this.attachEvents();
  }

  /**
   * Stop visual grab mode and cleanup DOM
   */
  public stop(): void {
    if (!this.active) return;
    this.active = false;
    this.detachEvents();
    this.removeOverlay();
    this.currentElement = null;
  }

  public isActive(): boolean {
    return this.active;
  }

  private createOverlay(): void {
    this.container = document.createElement('div');
    this.container.id = 'ai-workstation-grabber-container';
    this.container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      z-index: 2147483646;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;

    // Highlight bounding box
    this.overlayBox = document.createElement('div');
    this.overlayBox.style.cssText = `
      position: absolute;
      border: 2px solid #6366f1;
      background-color: rgba(99, 102, 241, 0.12);
      border-radius: 4px;
      transition: all 0.08s ease-out;
      pointer-events: none;
      box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.6), 0 4px 20px rgba(99, 102, 241, 0.25);
      display: none;
    `;

    // Floating tag and dimensions badge
    this.badge = document.createElement('div');
    this.badge.style.cssText = `
      position: absolute;
      top: -28px;
      left: 0;
      background: #4f46e5;
      color: #ffffff;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
      pointer-events: none;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
    `;
    this.overlayBox.appendChild(this.badge);

    // Top instruction banner
    this.banner = document.createElement('div');
    this.banner.style.cssText = `
      position: fixed;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(15, 23, 42, 0.92);
      backdrop-filter: blur(8px);
      color: #f8fafc;
      padding: 8px 18px;
      border-radius: 30px;
      font-size: 13px;
      font-weight: 500;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.1);
      display: flex;
      align-items: center;
      gap: 12px;
      pointer-events: auto;
      z-index: 2147483647;
    `;
    this.banner.innerHTML = `
      <span style="display:inline-flex;align-items:center;gap:6px;">
        <span style="width:8px;height:8px;background:#22c55e;border-radius:50%;display:inline-block;"></span>
        <strong>选择网页区域</strong>
      </span>
      <span style="color:#94a3b8;">|</span>
      <span style="color:#cbd5e1;">点击确认</span>
      <span style="color:#94a3b8;">|</span>
      <span style="color:#cbd5e1;"><kbd style="background:#334155;padding:1px 5px;border-radius:3px;font-size:11px;">↑</kbd> 扩大</span>
      <span style="color:#cbd5e1;"><kbd style="background:#334155;padding:1px 5px;border-radius:3px;font-size:11px;">↓</kbd> 缩小</span>
      <span style="color:#cbd5e1;"><kbd style="background:#334155;padding:1px 5px;border-radius:3px;font-size:11px;">Esc</kbd> 退出</span>
    `;

    this.container.appendChild(this.overlayBox);
    this.container.appendChild(this.banner);
    document.documentElement.appendChild(this.container);
  }

  private removeOverlay(): void {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.container = null;
    this.overlayBox = null;
    this.badge = null;
    this.banner = null;
  }

  private attachEvents(): void {
    window.addEventListener('mousemove', this.handleMouseMove, true);
    window.addEventListener('click', this.handleClick, true);
    window.addEventListener('keydown', this.handleKeyDown, true);
    window.addEventListener('scroll', this.handleScroll, true);
  }

  private detachEvents(): void {
    window.removeEventListener('mousemove', this.handleMouseMove, true);
    window.removeEventListener('click', this.handleClick, true);
    window.removeEventListener('keydown', this.handleKeyDown, true);
    window.removeEventListener('scroll', this.handleScroll, true);
  }

  private handleMouseMove(e: MouseEvent): void {
    if (!this.active) return;
    const target = e.target as HTMLElement;
    if (!target || this.isInternalElement(target)) return;

    this.highlightElement(target);
  }

  private highlightElement(el: HTMLElement): void {
    this.currentElement = el;
    if (!this.overlayBox || !this.badge) return;

    const rect = el.getBoundingClientRect();
    this.overlayBox.style.display = 'block';
    this.overlayBox.style.top = `${rect.top}px`;
    this.overlayBox.style.left = `${rect.left}px`;
    this.overlayBox.style.width = `${rect.width}px`;
    this.overlayBox.style.height = `${rect.height}px`;

    // Format badge text
    const tagName = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    const className = el.classList.length > 0 ? `.${Array.from(el.classList).slice(0, 2).join('.')}` : '';
    const dimensions = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;

    this.badge.textContent = `${tagName}${id}${className} (${dimensions})`;

    // Prevent badge overflowing top of viewport
    if (rect.top < 32) {
      this.badge.style.top = '4px';
      this.badge.style.left = '4px';
    } else {
      this.badge.style.top = '-26px';
      this.badge.style.left = '0px';
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.active) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.stop();
      return;
    }

    if (e.key === 'ArrowUp' && this.currentElement) {
      e.preventDefault();
      e.stopPropagation();
      const parent = this.currentElement.parentElement;
      if (parent && parent !== document.body && parent !== document.documentElement) {
        this.highlightElement(parent);
      }
      return;
    }

    if (e.key === 'ArrowDown' && this.currentElement) {
      e.preventDefault();
      e.stopPropagation();
      const firstChild = this.currentElement.firstElementChild as HTMLElement;
      if (firstChild) {
        this.highlightElement(firstChild);
      }
      return;
    }
  }

  private handleClick(e: MouseEvent): void {
    if (!this.active) return;
    e.preventDefault();
    e.stopPropagation();

    if (this.currentElement) {
      const grabbed = this.extractContent(this.currentElement);
      
      // Notify background / sidepanel
      chrome.runtime.sendMessage({
        type: 'ELEMENT_GRABBED',
        payload: grabbed,
      });

      this.stop();
    }
  }

  private handleScroll(): void {
    if (this.active && this.currentElement) {
      this.highlightElement(this.currentElement);
    }
  }

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

  private extractContent(el: HTMLElement): GrabbedContent {
    const rect = el.getBoundingClientRect();
    const tdk = extractPageTDK(document);

    // Extract images inside element
    const images: string[] = [];
    el.querySelectorAll('img').forEach((img) => {
      if (img.src && !images.includes(img.src)) {
        images.push(img.src);
      }
    });

    // Extract links inside element
    const links: string[] = [];
    el.querySelectorAll('a').forEach((a) => {
      if (a.href && !links.includes(a.href)) {
        links.push(a.href);
      }
    });

    return {
      id: `grab_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      url: window.location.href,
      tdk,
      selectedHtml: el.outerHTML,
      selectedText: el.innerText || el.textContent || '',
      selector: this.generateSelector(el),
      tag: el.tagName.toLowerCase(),
      dimensions: {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      images,
      links,
      createdAt: Date.now(),
    };
  }
}
