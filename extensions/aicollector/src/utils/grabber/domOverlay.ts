/**
 * DOM Overlay and Visual Feedback Manager for Visual Grabber
 */

import type { GrabberOverlayCallbacks } from './types';

export class GrabberOverlay {
  private container: HTMLDivElement | null = null;
  private hoverOverlayBox: HTMLDivElement | null = null;
  private hoverBadge: HTMLDivElement | null = null;
  private selectionBox: HTMLDivElement | null = null;
  private selectionBadge: HTMLDivElement | null = null;
  private banner: HTMLDivElement | null = null;
  private autoScrollTimer: number | null = null;

  public create(callbacks: GrabberOverlayCallbacks): void {
    if (this.container) return;

    this.container = document.createElement('div');
    this.container.id = 'ai-workstation-grabber-container';
    this.container.style.cssText = `
      position: fixed; top: 0; left: 0;
      width: 100vw; height: 100vh;
      pointer-events: none;
      z-index: 2147483646;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;

    // 1. Hover Highlight Box
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

    // 2. Drag Selection Box
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

    this.renderBanner(callbacks);

    this.container.appendChild(this.hoverOverlayBox);
    this.container.appendChild(this.selectionBox);
    this.container.appendChild(this.banner);
    document.documentElement.appendChild(this.container);
  }

  public destroy(): void {
    this.stopAutoScroll();
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

  public setVisible(visible: boolean): void {
    if (this.container) {
      this.container.style.display = visible ? 'block' : 'none';
    }
  }

  public isInternalElement(el: HTMLElement): boolean {
    return !!el.closest('#ai-workstation-grabber-container');
  }

  public showHover(rect: DOMRect, label: string): void {
    if (!this.hoverOverlayBox || !this.hoverBadge) return;

    this.hoverOverlayBox.style.display = 'block';
    this.hoverOverlayBox.style.top = `${rect.top}px`;
    this.hoverOverlayBox.style.left = `${rect.left}px`;
    this.hoverOverlayBox.style.width = `${rect.width}px`;
    this.hoverOverlayBox.style.height = `${rect.height}px`;

    this.hoverBadge.textContent = label;
    if (rect.top < 32) {
      this.hoverBadge.style.top = '4px';
      this.hoverBadge.style.left = '4px';
    } else {
      this.hoverBadge.style.top = '-26px';
      this.hoverBadge.style.left = '0px';
    }
  }

  public hideHover(): void {
    if (this.hoverOverlayBox) {
      this.hoverOverlayBox.style.display = 'none';
    }
  }

  public showSelection(p1: { x: number; y: number }, p2: { x: number; y: number }): void {
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

  public hideSelection(): void {
    if (this.selectionBox) {
      this.selectionBox.style.display = 'none';
    }
  }

  public checkAutoScroll(
    clientY: number,
    isDragging: boolean,
    onScrollStep: () => void,
  ): void {
    const edgeThreshold = 50;
    const viewHeight = window.innerHeight;

    if (clientY < edgeThreshold) {
      const speed = Math.max(3, Math.round((edgeThreshold - clientY) / 3));
      this.startAutoScroll(-speed, isDragging, onScrollStep);
    } else if (clientY > viewHeight - edgeThreshold) {
      const speed = Math.max(3, Math.round((clientY - (viewHeight - edgeThreshold)) / 3));
      this.startAutoScroll(speed, isDragging, onScrollStep);
    } else {
      this.stopAutoScroll();
    }
  }

  public startAutoScroll(
    speed: number,
    isDragging: boolean,
    onScrollStep: () => void,
  ): void {
    if (this.autoScrollTimer !== null) return;
    const step = () => {
      if (!isDragging) {
        this.stopAutoScroll();
        return;
      }
      window.scrollBy(0, speed);
      onScrollStep();
      this.autoScrollTimer = requestAnimationFrame(step);
    };
    this.autoScrollTimer = requestAnimationFrame(step);
  }

  public stopAutoScroll(): void {
    if (this.autoScrollTimer !== null) {
      cancelAnimationFrame(this.autoScrollTimer);
      this.autoScrollTimer = null;
    }
  }

  private renderBanner(callbacks: GrabberOverlayCallbacks): void {
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
      callbacks.onExit();
    });

    this.banner.querySelector('#ai-banner-fullpage-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      callbacks.onFullPageCapture();
    });
  }
}
