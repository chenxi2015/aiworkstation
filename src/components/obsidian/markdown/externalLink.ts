import { syntaxTree } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { type EditorView, ViewPlugin } from "@codemirror/view";
import {
	type LivePreviewOptions,
	lineTouchesSelection,
} from "./dialectDecorations";
import { followWikilinkTarget } from "./wikilink";

type SyntaxNode = ReturnType<typeof syntaxTree>["topNode"];

/**
 * 链接交互（对齐 Obsidian）：
 * - 外部链接（http/https/mailto）渲染时带 ↗ 角标（样式见 editorTheme `.cm-live-external-link`）
 * - 渲染态下鼠标点击直接跳转（外链新标签页打开，相对内链跳转笔记）
 * - 源码编辑态下普通点击定位光标编辑，⌘/Ctrl+点击触发跳转
 */

const EXTERNAL_URL_RE = /^(?:https?:\/\/|mailto:)/i;

export interface LinkTarget {
	url: string;
	isExternal: boolean;
	nodeRange: { from: number; to: number };
}

/** 从 Link/Autolink/URL 节点文本中提取链接信息 */
export function parseLinkInfo(
	text: string,
	nodeName: string,
): { url: string; isExternal: boolean } | null {
	let rawUrl: string | undefined;
	if (nodeName === "Link") {
		const m = text.match(/\]\(\s*<([^>]+)>|\]\(\s*([^\s)]+)/);
		rawUrl = m?.[1] ?? m?.[2];
	} else {
		rawUrl = text.replace(/^<|>$/g, "");
	}
	if (!rawUrl) return null;
	if (/^www\./i.test(rawUrl)) {
		return { url: `https://${rawUrl}`, isExternal: true };
	}
	if (EXTERNAL_URL_RE.test(rawUrl)) {
		return { url: rawUrl, isExternal: true };
	}
	return { url: rawUrl, isExternal: false };
}

/** 从 Link/Autolink/URL 节点文本中提取外链 URL；非外链返回 null */
export function parseExternalUrl(
	text: string,
	nodeName: string,
): string | null {
	const info = parseLinkInfo(text, nodeName);
	return info?.isExternal ? info.url : null;
}

/** 命中检测：pos 是否落在某个链接节点内（排除 ![图片](url)） */
function findLinkAt(view: EditorView, pos: number): LinkTarget | null {
	let node: SyntaxNode | null = syntaxTree(view.state).resolveInner(pos, 0);
	while (node) {
		switch (node.name) {
			case "Image":
				return null;
			case "Link":
			case "Autolink":
			case "URL": {
				const info = parseLinkInfo(
					view.state.doc.sliceString(node.from, node.to),
					node.name,
				);
				if (info) {
					return { ...info, nodeRange: { from: node.from, to: node.to } };
				}
				return null;
			}
		}
		node = node.parent;
	}
	return null;
}

class ExternalLinkInteractionPlugin {
	private lastFollowUrl = "";
	private lastFollowTime = 0;

	constructor(
		private readonly view: EditorView,
		private readonly options: LivePreviewOptions,
	) {}

	private getLinkFromEvent(event: MouseEvent): {
		url: string;
		isExternal: boolean;
		isActive: boolean;
	} | null {
		// Prefer direct DOM hit: works reliably whether user clicks text or the ::after arrow icon
		const targetEl = (event.target as HTMLElement | null)?.closest?.(
			".cm-live-link",
		);
		if (targetEl) {
			const url = targetEl.getAttribute("data-url");
			if (url) {
				const isExternal = targetEl.getAttribute("data-external") === "true";
				const isActive = targetEl.classList.contains("cm-live-link-active");
				return { url, isExternal, isActive };
			}
		}

		// Fallback via coordinates and syntax tree
		const pos = this.view.posAtCoords({
			x: event.clientX,
			y: event.clientY,
		});
		if (pos != null) {
			const link = findLinkAt(this.view, pos);
			if (link) {
				const isLineActive =
					!this.options.readingMode &&
					lineTouchesSelection(
						this.view.state,
						link.nodeRange.from,
						link.nodeRange.to,
					);
				return {
					url: link.url,
					isExternal: link.isExternal,
					isActive: isLineActive,
				};
			}
		}
		return null;
	}

	handleMouseDown = (event: MouseEvent): boolean => {
		if (event.button !== 0 || event.detail > 1) return false;
		const link = this.getLinkFromEvent(event);
		if (!link) return false;

		if (link.isActive) {
			// When source code is revealed, regular click lets editor place caret; Cmd/Ctrl+click follows link
			if (event.metaKey || event.ctrlKey) {
				event.preventDefault();
				this.follow(link.url, link.isExternal);
				return true;
			}
			return false;
		}

		// When rendered (not active), clicking follows link immediately
		event.preventDefault();
		this.follow(link.url, link.isExternal);
		return true;
	};

	handleClick = (event: MouseEvent): boolean => {
		if (event.button !== 0 || event.detail > 1) return false;
		const link = this.getLinkFromEvent(event);
		if (!link) return false;

		if (link.isActive && !(event.metaKey || event.ctrlKey)) {
			return false;
		}

		event.preventDefault();
		this.follow(link.url, link.isExternal);
		return true;
	};

	private follow(url: string, isExternal: boolean) {
		const now = Date.now();
		if (this.lastFollowUrl === url && now - this.lastFollowTime < 400) {
			return;
		}
		this.lastFollowUrl = url;
		this.lastFollowTime = now;
		if (isExternal) {
			window.open(url, "_blank", "noopener,noreferrer");
		} else {
			void followWikilinkTarget(url, this.options);
		}
	}
}

export function externalLinkInteractions(
	options: LivePreviewOptions = {},
): Extension {
	return ViewPlugin.define(
		(view) => new ExternalLinkInteractionPlugin(view, options),
		{
			eventHandlers: {
				mousedown(event) {
					return this.handleMouseDown(event);
				},
				click(event) {
					return this.handleClick(event);
				},
			},
		},
	);
}
