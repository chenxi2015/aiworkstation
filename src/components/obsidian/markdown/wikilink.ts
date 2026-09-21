import type { Extension } from "@codemirror/state";
import { type EditorView, ViewPlugin } from "@codemirror/view";
import {
	fetchVaultNote,
	resolveWikilinkRpc,
} from "../../../services/api/obsidianClient";
import { markdownToHtml } from "../../editor/markdown";
import type { LivePreviewOptions } from "./livePreview";
import { invalidateWikilinkSuggestions } from "./wikilinkAutocomplete";

/**
 * 双链交互（对齐 Obsidian）：
 * - 单击 [[双链]]：已存在 → 跳转；不存在 → 新建同名笔记并跳转
 * - ⌘/Ctrl + 悬停：浮层预览目标笔记内容（Markdown 渲染，含缓存）
 */

function stripFrontmatter(content: string): string {
	return content.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
}

interface CacheEntry<T> {
	data: T;
	at: number;
}

const resolveCache = new Map<string, CacheEntry<string | null>>();
const RESOLVE_CACHE_TTL_MS = 60_000;

const previewCache = new Map<string, CacheEntry<string>>();
const PREVIEW_CACHE_TTL_MS = 30_000;
const PREVIEW_MAX_CHARS = 1500;

/** Clear wikilink caches (specific path or all) */
export function clearWikilinkCaches(relPath?: string): void {
	invalidateWikilinkSuggestions();
	if (relPath) {
		previewCache.delete(relPath);
	} else {
		resolveCache.clear();
		previewCache.clear();
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

function renderWikilinksInHtml(html: string): string {
	return html.replace(/\[\[([^\]\n]+)\]\]/g, (_m, inner: string) => {
		const [rawTarget, alias] = inner.split("|");
		const target = (rawTarget ?? "").split("#")[0]?.trim() ?? "";
		const label = alias?.trim() || target;
		return `<span class="cm-live-wikilink" data-target="${target}" style="cursor: pointer; text-decoration: underline; text-underline-offset: 2px;">${label}</span>`;
	});
}

async function loadPreviewHtml(relPath: string): Promise<string> {
	const cached = previewCache.get(relPath);
	if (cached && Date.now() - cached.at < PREVIEW_CACHE_TTL_MS) {
		return cached.data;
	}
	const { note } = await fetchVaultNote(relPath);
	const body = stripFrontmatter(note?.content ?? "").slice(
		0,
		PREVIEW_MAX_CHARS,
	);
	const rawHtml = note ? markdownToHtml(body) : "";
	const html = renderWikilinksInHtml(rawHtml);
	previewCache.set(relPath, { data: html, at: Date.now() });
	return html;
}

class WikilinkInteractionPlugin {
	private previewEl: HTMLElement | null = null;
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
		if (this.previewEl) {
			this.previewEl.remove();
			this.previewEl = null;
		}
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
			if (this.previewEl) {
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
		if (this.previewEl && this.hoverKey === key) return; // Already previewing the same target
		this.clearHover();
		this.hoverKey = key;

		const card = document.createElement("div");
		card.className = "cm-live-hover-preview";

		// Keep preview open when mouse moves into card for scrolling and reading
		card.addEventListener("mouseenter", () => {
			this.isHoveringCard = true;
			this.cancelClose();
		});
		card.addEventListener("mouseleave", (e: MouseEvent) => {
			this.isHoveringCard = false;
			const toEl = e.relatedTarget as HTMLElement | null;
			if (toEl?.closest?.(".cm-live-wikilink")) {
				return;
			}
			this.scheduleClose(240);
		});

		// Allow clicking internal wikilinks inside preview card
		card.addEventListener("click", (e) => {
			const targetEl = (e.target as HTMLElement | null)?.closest?.(
				"[data-target]",
			);
			const target = targetEl?.getAttribute("data-target");
			if (target) {
				e.preventDefault();
				void this.follow(target);
			}
		});

		if (relPath) {
			const title = document.createElement("div");
			title.className = "cm-live-hover-preview-title";
			title.textContent = target;
			card.appendChild(title);
			const body = document.createElement("div");
			body.className = "cm-live-hover-preview-body";
			body.textContent = "加载中…";
			card.appendChild(body);
			void loadPreviewHtml(relPath).then((html) => {
				if (this.previewEl !== card) return;
				body.textContent = "";
				body.innerHTML = html || "<i>（空笔记）</i>";
			});
		} else {
			card.textContent = `笔记「${target}」尚未创建，点击新建`;
		}

		// Position: below cursor, constrain to viewport boundaries with flip if needed
		const cardWidth = 400;
		const cardHeight = 300;
		const left = Math.min(
			Math.max(8, x - 20),
			window.innerWidth - cardWidth - 16,
		);
		let top = y + 14;
		if (top + cardHeight > window.innerHeight - 16 && y - cardHeight - 16 > 0) {
			top = y - cardHeight - 10;
		}
		card.style.left = `${left}px`;
		card.style.top = `${top}px`;
		document.body.appendChild(card);
		this.previewEl = card;
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
