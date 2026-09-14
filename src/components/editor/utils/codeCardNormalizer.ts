import type { JSONContent } from "@tiptap/core";

/**
 * 「优化样式 / 公众号排版」类 HTML 常把代码块包进一张自定义深色卡片：
 *   <section style="background:#1C2B27;...">
 *     <pre><code>第一行</code></pre>
 *     <p>剩余代码<br>剩余代码<br>...</p>
 *   </section>
 * 解析进 TipTap 后会变成 styledContainer(深色卡片) > codeBlock(仅首行) + paragraph(剩余代码)，
 * 与编辑器自带的代码块卡片（NodeView：圆点 + 语言 + 复制 + 深色背景）叠加，出现"卡片套卡片、
 * 代码溢出到卡片外"的破碎渲染。
 *
 * 归一化策略：保留外层自定义卡片的视觉样式（用户要的就是这个自定义 HTML 效果），
 * 只做一件事——把 codeBlock 紧随其后、由 hardBreak 拼行的段落视为代码延续，
 * 合并回 codeBlock 文本，让代码完整落在卡片内部。
 * 卡片套卡片问题由 CodeBlockComponent 的裸渲染模式解决：
 * codeBlock 位于深色 styledContainer 内时不再渲染自带的 mac 卡片外壳。
 */

/** 从 style 字符串中提取 background / background-color 声明值 */
function extractBackground(style: string): string {
	const match = style.match(/background(?:-color)?\s*:\s*([^;]+)/i);
	return match?.[1] ?? "";
}

function parseColorToRgb(color: string): [number, number, number] | null {
	const hex = color.match(/#([0-9a-f]{3}|[0-9a-f]{6})\b/i);
	if (hex) {
		let h = hex[1];
		if (h.length === 3) {
			h = h
				.split("")
				.map((c) => c + c)
				.join("");
		}
		return [
			parseInt(h.slice(0, 2), 16),
			parseInt(h.slice(2, 4), 16),
			parseInt(h.slice(4, 6), 16),
		];
	}
	const rgb = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
	if (rgb) {
		return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
	}
	return null;
}

/** 判断 style 是否声明了深色背景（代码卡片的典型特征） */
export function hasDarkBackgroundStyle(style?: string | null): boolean {
	if (!style) return false;
	const bg = extractBackground(style);
	if (!bg) return false;
	for (const token of bg.split(/\s+(?=#|rgb)/i)) {
		const rgb = parseColorToRgb(token);
		if (!rgb) continue;
		const luminance =
			(0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
		if (luminance < 0.45) return true;
	}
	return false;
}

/** 段落是否由 text + hardBreak 组成（代码被拆行后的典型形态），返回拼回的代码文本 */
function paragraphToCodeText(para: JSONContent): {
	text: string;
	hardBreaks: number;
} | null {
	if (para.type !== "paragraph" || !para.content || para.content.length === 0) {
		return null;
	}
	let text = "";
	let hardBreaks = 0;
	for (const child of para.content) {
		if (child.type === "text") {
			text += child.text ?? "";
		} else if (child.type === "hardBreak") {
			text += "\n";
			hardBreaks += 1;
		} else {
			return null;
		}
	}
	return hardBreaks > 0 ? { text, hardBreaks } : null;
}

function codeBlockText(node: JSONContent): string {
	return (node.content ?? [])
		.map((c) => (c.type === "text" ? (c.text ?? "") : ""))
		.join("");
}

/**
 * 归一化 TipTap JSON 中的"代码卡片"破碎结构（纯函数，不改动入参）。
 */
export function normalizeCodeCardDoc(doc: JSONContent): JSONContent {
	const walk = (node: JSONContent, insideDarkCard: boolean): JSONContent => {
		const nodeIsDarkCard =
			node.type === "styledContainer" &&
			hasDarkBackgroundStyle(node.attrs?.style as string | null);
		const childDark = insideDarkCard || nodeIsDarkCard;

		let children = (node.content ?? []).map((c) => walk(c, childDark));

		// 1. 合并：codeBlock 后面紧跟的 hardBreak 段落并回代码块
		const merged: JSONContent[] = [];
		for (const child of children) {
			const prev = merged[merged.length - 1];
			if (prev?.type === "codeBlock" && child.type === "paragraph") {
				const code = paragraphToCodeText(child);
				// 深色卡片内 1 个换行即可判定为代码延续；卡片外要求 ≥2 个换行，避免误吞正文
				if (code && (childDark || code.hardBreaks >= 2)) {
					const prevText = codeBlockText(prev);
					merged[merged.length - 1] = {
						...prev,
						content: [
							{
								type: "text",
								text: `${prevText}\n${code.text.replace(/\n+$/, "")}`,
							},
						],
					};
					continue;
				}
			}
			merged.push(child);
		}
		children = merged;

		if (!node.content) return node;
		return { ...node, content: children };
	};

	return walk(doc, false);
}

/** 把 <p>内嵌 <br> 的 DOM 节点提取为多行文本 */
function domNodeToCodeText(el: Element): string {
	let text = "";
	const visit = (node: Node) => {
		if (node.nodeType === 3) {
			text += node.nodeValue ?? "";
		} else if (node.nodeType === 1) {
			if ((node as Element).tagName === "BR") {
				text += "\n";
				return;
			}
			node.childNodes.forEach(visit);
		}
	};
	el.childNodes.forEach(visit);
	return text;
}

/**
 * 归一化待粘贴 / 导入的 HTML：保留深色自定义卡片外壳，
 * 只把被拆进 <p><br> 的代码行并回 <pre>，让代码完整落在卡片内部。
 * 仅在浏览器环境（DOMParser 可用）下生效，其余环境原样返回。
 */
export function normalizeCodeCardHtml(html: string): string {
	if (typeof DOMParser === "undefined") return html;
	if (!/<pre[\s>]/i.test(html)) return html;

	const parsed = new DOMParser().parseFromString(html, "text/html");
	let changed = false;

	// 静态快照，避免遍历中改动 DOM 造成遗漏
	const wrappers = Array.from(parsed.body.querySelectorAll("section, div"));
	for (const wrapper of wrappers) {
		if (!wrapper.isConnected) continue;
		const elements = Array.from(wrapper.children);
		const pres = elements.filter((el) => el.tagName === "PRE");
		if (pres.length !== 1) continue;

		const others = elements.filter((el) => el.tagName !== "PRE");
		const codeParas: Element[] = [];
		let bailsOut = false;
		for (const el of others) {
			const isEmpty = !(el.textContent ?? "").trim();
			if (el.tagName === "P" && (isEmpty || el.querySelector("br"))) {
				codeParas.push(el);
			} else {
				bailsOut = true;
				break;
			}
		}
		if (bailsOut) continue;

		if (codeParas.length === 0) continue;
		// 带 p 拼行：需深色卡片佐证这些段落是代码延续，避免误并正文
		if (!hasDarkBackgroundStyle(wrapper.getAttribute("style"))) continue;

		// 保留外层自定义卡片（视觉样式原样保留），只把 p 拼行的代码并回 pre
		const pre = pres[0];
		let text = pre.textContent ?? "";
		for (const para of codeParas) {
			const paraText = domNodeToCodeText(para).replace(/\n+$/, "");
			if (paraText.trim()) text += `\n${paraText}`;
		}

		const code = parsed.createElement("code");
		const langClass = (
			pre.querySelector("code")?.className ||
			pre.className ||
			""
		)
			.split(/\s+/)
			.find((c) => c.startsWith("language-"));
		if (langClass) code.className = langClass;
		code.textContent = text;
		pre.replaceChildren(code);

		for (const para of codeParas) para.remove();
		changed = true;
	}

	return changed ? parsed.body.innerHTML : html;
}
