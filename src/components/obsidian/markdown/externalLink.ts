import { syntaxTree } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { type EditorView, ViewPlugin } from "@codemirror/view";

type SyntaxNode = ReturnType<typeof syntaxTree>["topNode"];

/**
 * 外部链接交互（对齐 Obsidian）：
 * - 外部链接（http/https/mailto）渲染时带 ↗ 角标（样式见 editorTheme `.cm-live-external-link`）
 * - 鼠标点击直接在新标签页打开（Obsidian 阅读模式行为；编辑链接文本可用键盘移入）
 */

const EXTERNAL_URL_RE = /^(?:https?:\/\/|mailto:)/i;

/** 从 Link/Autolink/URL 节点文本中提取外链 URL；非外链返回 null */
export function parseExternalUrl(
	text: string,
	nodeName: string,
): string | null {
	let url: string | undefined;
	if (nodeName === "Link") {
		const m = text.match(/\]\(\s*<([^>]+)>|\]\(\s*([^\s)]+)/);
		url = m?.[1] ?? m?.[2];
	} else {
		url = text.replace(/^<|>$/g, "");
	}
	if (url && /^www\./i.test(url)) return `https://${url}`;
	return url && EXTERNAL_URL_RE.test(url) ? url : null;
}

/** 命中检测：pos 是否落在某个外链节点内（排除 ![图片](url)） */
function findExternalUrlAt(view: EditorView, pos: number): string | null {
	let node: SyntaxNode | null = syntaxTree(view.state).resolveInner(pos, 0);
	while (node) {
		switch (node.name) {
			case "Image":
				return null;
			case "Link":
			case "Autolink":
			case "URL":
				return parseExternalUrl(
					view.state.doc.sliceString(node.from, node.to),
					node.name,
				);
		}
		node = node.parent;
	}
	return null;
}

class ExternalLinkInteractionPlugin {
	constructor(private readonly view: EditorView) {}

	handleMouseDown = (event: MouseEvent): boolean => {
		if (event.button !== 0 || event.detail > 1) return false;
		const pos = this.view.posAtCoords({
			x: event.clientX,
			y: event.clientY,
		});
		if (pos == null) return false;
		const url = findExternalUrlAt(this.view, pos);
		if (!url) return false;
		event.preventDefault();
		window.open(url, "_blank", "noopener,noreferrer");
		return true;
	};
}

export function externalLinkInteractions(): Extension {
	return ViewPlugin.define((view) => new ExternalLinkInteractionPlugin(view), {
		eventHandlers: {
			mousedown(event) {
				this.handleMouseDown(event);
			},
		},
	});
}
