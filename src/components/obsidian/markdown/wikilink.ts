import type { Extension } from "@codemirror/state";
import { type EditorView, ViewPlugin } from "@codemirror/view";
import {
	fetchVaultNote,
	resolveWikilinkRpc,
} from "../../../services/api/obsidianClient";
import { markdownToHtml } from "../../editor/markdown";
import type { LivePreviewOptions } from "./livePreview";

/**
 * 双链交互（对齐 Obsidian）：
 * - ⌘/Ctrl + 点击 [[双链]]：已存在 → 跳转；不存在 → 新建同名笔记并跳转
 * - ⌘/Ctrl + 悬停：浮层预览目标笔记内容（Markdown 渲染，含缓存）
 */

interface WikilinkHit {
	from: number;
	to: number;
	target: string;
}

/** 命中检测：pos 是否落在本行某个 [[双链]] 内（排除 ![[嵌入]]） */
function findWikilinkAt(view: EditorView, pos: number): WikilinkHit | null {
	const line = view.state.doc.lineAt(pos);
	const re = /(?<!!)\[\[([^\]\n]+)\]\]/g;
	let match = re.exec(line.text);
	while (match) {
		const from = line.from + match.index;
		const to = from + match[0].length;
		if (pos >= from && pos <= to) {
			const target =
				(match[1] ?? "").split("|")[0]?.split("#")[0]?.trim() ?? "";
			if (target) return { from, to, target };
		}
		match = re.exec(line.text);
	}
	return null;
}

function stripFrontmatter(content: string): string {
	return content.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
}

const previewCache = new Map<string, string>();
const PREVIEW_MAX_CHARS = 1500;

async function loadPreviewHtml(relPath: string): Promise<string> {
	const cached = previewCache.get(relPath);
	if (cached !== undefined) return cached;
	const { note } = await fetchVaultNote(relPath);
	const body = stripFrontmatter(note?.content ?? "").slice(
		0,
		PREVIEW_MAX_CHARS,
	);
	const html = note ? markdownToHtml(body) : "";
	previewCache.set(relPath, html);
	return html;
}

class WikilinkInteractionPlugin {
	private previewEl: HTMLElement | null = null;
	private hoverTimer = 0;
	private hoverKey = "";

	constructor(
		private readonly view: EditorView,
		private readonly options: LivePreviewOptions,
	) {}

	destroy() {
		this.clearHover();
	}

	private clearHover() {
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

	handleClick = (event: MouseEvent): boolean => {
		if (!(event.metaKey || event.ctrlKey)) return false;
		const pos = this.view.posAtCoords({
			x: event.clientX,
			y: event.clientY,
		});
		if (pos == null) return false;
		const hit = findWikilinkAt(this.view, pos);
		if (!hit) return false;
		event.preventDefault();
		void this.follow(hit.target);
		return true;
	};

	private async follow(target: string) {
		const relPath = await resolveWikilinkRpc(target);
		if (relPath) {
			this.options.onNavigateNote?.(relPath);
		} else {
			this.options.onCreateNote?.(target);
		}
	}

	handleMouseMove = (event: MouseEvent) => {
		if (!(event.metaKey || event.ctrlKey)) {
			if (this.previewEl || this.hoverTimer) this.clearHover();
			return;
		}
		const { clientX, clientY } = event;
		if (this.hoverTimer) clearTimeout(this.hoverTimer);
		this.hoverTimer = window.setTimeout(() => {
			void this.maybeShowPreview(clientX, clientY);
		}, 300);
	};

	private async maybeShowPreview(x: number, y: number) {
		const pos = this.view.posAtCoords({ x, y });
		const hit = pos != null ? findWikilinkAt(this.view, pos) : null;
		if (!hit) {
			this.clearHover();
			return;
		}
		const relPath = await resolveWikilinkRpc(hit.target);
		const key = relPath ?? `missing:${hit.target}`;
		if (this.previewEl && this.hoverKey === key) return; // 已在预览同一目标
		this.clearHover();
		this.hoverKey = key;

		const card = document.createElement("div");
		card.className = "cm-live-hover-preview";
		if (relPath) {
			const title = document.createElement("div");
			title.className = "cm-live-hover-preview-title";
			title.textContent = hit.target;
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
			card.textContent = `笔记「${hit.target}」尚未创建，⌘+点击新建`;
		}
		// 定位：光标下方，出屏则收回
		const left = Math.min(x, window.innerWidth - 420);
		const top = Math.min(y + 16, window.innerHeight - 220);
		card.style.left = `${Math.max(8, left)}px`;
		card.style.top = `${Math.max(8, top)}px`;
		document.body.appendChild(card);
		this.previewEl = card;
	}
}

export function wikilinkInteractions(options: LivePreviewOptions): Extension {
	return ViewPlugin.define(
		(view) => new WikilinkInteractionPlugin(view, options),
		{
			eventHandlers: {
				click(event) {
					this.handleClick(event);
				},
				mousemove(event) {
					this.handleMouseMove(event);
				},
			},
		},
	);
}
