import type { Extension } from "@codemirror/state";
import { type EditorView, ViewPlugin } from "@codemirror/view";
import { resolveWikilinkRpc } from "../../../services/api/obsidianClient";
import type { LivePreviewOptions } from "./livePreview";
import {
	clearWikilinkPreviewCache,
	mountWikilinkPreview,
	unmountWikilinkPreview,
} from "./WikilinkPreviewCard";
import { invalidateWikilinkSuggestions } from "./wikilinkAutocomplete";

/**
 * 双链交互（对齐 Obsidian）：
 * - 单击 [[双链]]：已存在 → 跳转；不存在 → 新建同名笔记并跳转
 * - ⌘/Ctrl + 悬停：浮层预览目标笔记内容（由 WikilinkPreviewCard 独立组件渲染）
 */

interface CacheEntry<T> {
	data: T;
	at: number;
}

const resolveCache = new Map<string, CacheEntry<string | null>>();
const RESOLVE_CACHE_TTL_MS = 60_000;

/** Clear wikilink caches (specific path or all) */
export function clearWikilinkCaches(relPath?: string): void {
	invalidateWikilinkSuggestions();
	clearWikilinkPreviewCache(relPath);
	if (!relPath) {
		resolveCache.clear();
	}
}

/** Resolve wikilink target with client-side cache */
export async function resolveWikilinkWithCache(
	target: string,
): Promise<string | null> {
	const cached = resolveCache.get(target);
	if (cached && Date.now() - cached.at < RESOLVE_CACHE_TTL_MS) {
		return cached.data;
	}
	const relPath = await resolveWikilinkRpc(target);
	resolveCache.set(target, { data: relPath, at: Date.now() });
	return relPath;
}

/** 解析并跳转双链目标：已存在 → 跳转；不存在 → 新建同名笔记并跳转 */
export async function followWikilinkTarget(
	target: string,
	options: LivePreviewOptions,
): Promise<void> {
	const relPath = await resolveWikilinkWithCache(target);
	if (relPath) {
		options.onNavigateNote?.(relPath);
	} else {
		options.onCreateNote?.(target);
	}
}

class WikilinkInteractionPlugin {
	private hoverTimer = 0;
	private closeTimer = 0;
	private isHoveringCard = false;
	private hoverKey = "";
	private lastFollowTarget = "";
	private lastFollowTime = 0;

	constructor(
		_view: EditorView,
		private readonly options: LivePreviewOptions,
	) {
		window.addEventListener("keyup", this.handleWindowKeyUp);
	}

	destroy() {
		window.removeEventListener("keyup", this.handleWindowKeyUp);
		this.clearHover();
	}

	private handleWindowKeyUp = (event: KeyboardEvent) => {
		if (event.key === "Meta" || event.key === "Control") {
			// If cursor has moved into the card to scroll/read, keep it open even if keys are released
			if (this.isHoveringCard) return;
			if (!this.options.readingMode) {
				this.scheduleClose(150);
			}
		}
	};

	private scheduleClose(delayMs = 260) {
		if (this.closeTimer) clearTimeout(this.closeTimer);
		this.closeTimer = window.setTimeout(() => {
			this.closeTimer = 0;
			if (!this.isHoveringCard) {
				this.clearHover();
			}
		}, delayMs);
	}

	private cancelClose() {
		if (this.closeTimer) {
			clearTimeout(this.closeTimer);
			this.closeTimer = 0;
		}
	}

	private clearHover() {
		this.cancelClose();
		this.isHoveringCard = false;
		if (this.hoverTimer) {
			clearTimeout(this.hoverTimer);
			this.hoverTimer = 0;
		}
		this.hoverKey = "";
		unmountWikilinkPreview();
	}

	handleMouseLeave = () => {
		// When mouse leaves editor viewport, give safe time to bridge onto the floating card
		if (this.isHoveringCard) return;
		this.scheduleClose(260);
	};

	handleMouseDown = (event: MouseEvent): boolean => {
		if (event.button !== 0 || event.detail > 1) return false;
		const targetEl = (event.target as HTMLElement | null)?.closest?.(
			".cm-live-wikilink",
		);
		if (!targetEl) return false;

		const target = targetEl.getAttribute("data-target");
		if (!target) return false;

		const isEditing = targetEl.classList.contains("cm-live-wikilink-active");
		if (isEditing) {
			// When source code is revealed, regular click lets editor place caret; Cmd/Ctrl+click follows link
			if (event.metaKey || event.ctrlKey) {
				event.preventDefault();
				void this.follow(target);
				return true;
			}
			return false;
		}

		// When rendered (not active), clicking follows link immediately without revealing markdown syntax
		event.preventDefault();
		void this.follow(target);
		return true;
	};

	handleClick = (event: MouseEvent): boolean => {
		if (event.button !== 0 || event.detail > 1) return false;
		const targetEl = (event.target as HTMLElement | null)?.closest?.(
			".cm-live-wikilink",
		);
		if (!targetEl) return false;

		const target = targetEl.getAttribute("data-target");
		if (!target) return false;

		const isEditing = targetEl.classList.contains("cm-live-wikilink-active");
		if (isEditing && !(event.metaKey || event.ctrlKey)) {
			return false;
		}

		event.preventDefault();
		void this.follow(target);
		return true;
	};

	private async follow(target: string) {
		const now = Date.now();
		if (this.lastFollowTarget === target && now - this.lastFollowTime < 400) {
			return;
		}
		this.lastFollowTarget = target;
		this.lastFollowTime = now;
		this.clearHover();
		await followWikilinkTarget(target, this.options);
	}

	handleMouseMove = (event: MouseEvent) => {
		// If user is already hovering/scrolling inside the preview card, keep it intact
		if (this.isHoveringCard) return;

		const targetEl = (event.target as HTMLElement | null)?.closest?.(
			".cm-live-wikilink",
		);
		if (!targetEl) {
			if (this.hoverTimer) {
				clearTimeout(this.hoverTimer);
				this.hoverTimer = 0;
			}
			if (this.hoverKey) {
				this.scheduleClose(260);
			}
			return;
		}

		// Currently on a wikilink: cancel any scheduled close
		this.cancelClose();

		// 阅读视图下无需修饰键直接悬停预览；编辑视图下需按住 Cmd/Ctrl 键
		const needModifier = !this.options.readingMode;
		if (needModifier && !(event.metaKey || event.ctrlKey)) {
			this.scheduleClose(150);
			return;
		}

		const target = targetEl.getAttribute("data-target");
		if (!target) {
			this.scheduleClose(150);
			return;
		}

		const { clientX, clientY } = event;
		if (this.hoverTimer) clearTimeout(this.hoverTimer);
		this.hoverTimer = window.setTimeout(() => {
			void this.maybeShowPreview(target, clientX, clientY);
		}, 180);
	};

	private async maybeShowPreview(target: string, x: number, y: number) {
		const relPath = await resolveWikilinkWithCache(target);
		const key = relPath ?? `missing:${target}`;
		if (this.hoverKey === key) return; // Already previewing the same target
		this.clearHover();
		this.hoverKey = key;

		mountWikilinkPreview({
			target,
			relPath,
			x,
			y,
			onFollow: (hitTarget) => {
				this.clearHover();
				void this.follow(hitTarget);
			},
			onMouseEnter: () => {
				this.isHoveringCard = true;
				this.cancelClose();
			},
			onMouseLeave: () => {
				this.isHoveringCard = false;
				this.scheduleClose(240);
			},
		});
	}
}

export function wikilinkInteractions(options: LivePreviewOptions): Extension {
	return ViewPlugin.define(
		(view) => new WikilinkInteractionPlugin(view, options),
		{
			eventHandlers: {
				mousedown(event) {
					return this.handleMouseDown(event);
				},
				click(event) {
					return this.handleClick(event);
				},
				mousemove(event) {
					this.handleMouseMove(event);
				},
				mouseleave() {
					this.handleMouseLeave();
				},
			},
		},
	);
}
