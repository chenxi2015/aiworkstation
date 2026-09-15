/**
 * AI 输出归一化：把"整篇被 Markdown 代码围栏包裹的 HTML"拆包还原成裸 HTML。
 *
 * 背景：让模型生成公众号排版 HTML 时，模型会概率性地把整篇输出包进
 * ```html ... ``` 围栏（并附一句导语）。一旦进入 markdownToTiptapDoc()，
 * 围栏会被 marked 解析成 <pre><code>，在编辑器里渲染成深色代码块而非排版内容。
 * 左栏文章本身含代码块时，模型模仿围栏格式的概率更高，因此问题呈间歇性。
 *
 * 这里做确定性的兜底拆包，保证无论模型是否围栏包裹，渲染结果都稳定一致。
 */

/** 围栏起始行：```html / ~~~ / ````markup 等（标记字符需 >= 3） */
const FENCE_OPEN_REGEX = /^[ \t]*(`{3,}|~{3,})([A-Za-z0-9_-]*)[ \t]*$/m;

/** 看起来像完整 HTML 文档负载的起始标签 */
const HTML_BLOCK_START_REGEX =
	/^\s*<(div|section|article|main|header|footer|p|h[1-6]|table|img|figure|figcaption|blockquote|ul|ol)\b/i;

/** 语言标记明确指向 HTML 类负载 */
const HTML_FENCE_LANGS = new Set(["html", "xhtml", "xml", "markup", "vue"]);

/** 导语/结尾说明文字超过这个长度就不认为是"附带的 meta 文字"，保守不拆包 */
const MAX_WRAPPER_META_CHARS = 200;

function countHtmlTags(text: string): number {
	const matches = text.match(/<\/?[a-zA-Z][a-zA-Z0-9]*(\s[^>]*)?>/g);
	return matches ? matches.length : 0;
}

/**
 * 判断一段文本是否像"完整 HTML 排版文档"（而非普通散文中夹带的零星标签）。
 * 要求：以块级标签开头、有一定体量、标签数量足够多。
 */
function looksLikeHtmlPayload(text: string): boolean {
	const trimmed = text.trim();
	if (trimmed.length < 80) return false;
	if (!HTML_BLOCK_START_REGEX.test(trimmed)) return false;
	return countHtmlTags(trimmed) >= 4;
}

/**
 * 归一化 AI 生成的整篇文本：
 * - Case 1：整篇（或附短导语/短结尾）被单个 ```html 类围栏包裹 → 拆包取围栏内容
 * - Case 2：短导语 + 后续以 <div>/<section> 开头的裸 HTML 主体 → 去掉导语
 * - Case 3：混排——主体已是裸 HTML 排版，个别段落被单独包进围栏 → 逐个拆包
 * 不满足条件时原样返回，绝不动正常文章（如正文里合法存在的 ```sql 代码块）。
 * 流式场景安全：围栏未闭合时按"剩余内容即围栏体"处理，随流推进自我修正。
 */

/** 一个围栏块在原文中的位置与内容（闭围栏缺失时按流式末尾处理） */
interface FenceBlock {
	start: number; // 开围栏行起始 offset
	end: number; // 闭围栏行结束 offset（未闭合时为 raw.length）
	lang: string;
	inner: string;
}

const FENCE_OPEN_LINE_REGEX = /^[ \t]*(`{3,}|~{3,})([A-Za-z0-9_-]*)[ \t]*$/;

/** 逐行扫描围栏块，支持流式场景下末尾未闭合的围栏 */
function findFenceBlocks(raw: string): FenceBlock[] {
	const blocks: FenceBlock[] = [];
	const lines = raw.split("\n");
	const lineOffsets: number[] = [];
	let offset = 0;
	for (const line of lines) {
		lineOffsets.push(offset);
		offset += line.length + 1;
	}
	let i = 0;
	while (i < lines.length) {
		const openMatch = FENCE_OPEN_LINE_REGEX.exec(lines[i]);
		if (!openMatch) {
			i++;
			continue;
		}
		const markerChar = openMatch[1][0];
		const minLen = openMatch[1].length;
		const closeRe = new RegExp(
			`^[ \\t]*${markerChar}{${minLen},}[ \\t]*$`,
		);
		let j = i + 1;
		while (j < lines.length && !closeRe.test(lines[j])) j++;
		const closed = j < lines.length;
		const innerStart = lineOffsets[i] + lines[i].length + 1;
		const innerEnd = closed ? lineOffsets[j] : raw.length;
		blocks.push({
			start: lineOffsets[i],
			end: closed ? lineOffsets[j] + lines[j].length : raw.length,
			lang: (openMatch[2] || "").toLowerCase(),
			inner: raw.slice(innerStart, innerEnd),
		});
		i = closed ? j + 1 : lines.length;
	}
	return blocks;
}

/**
 * 判断围栏内部是否像 HTML 片段（混排模式专用，阈值比 looksLikeHtmlPayload 宽松：
 * 前提已经是"围栏之外的主体是 HTML 排版"，此时以块级标签开头的围栏内容几乎
 * 可以断定是被误包裹的排版片段，单段落（2 个标签）也要拆）。
 */
function looksLikeHtmlFragment(text: string): boolean {
	const trimmed = text.trim();
	if (trimmed.length < 20) return false;
	if (!HTML_BLOCK_START_REGEX.test(trimmed)) return false;
	return countHtmlTags(trimmed) >= 2;
}

/**
 * Case 3 混排拆包：AI 排版输出主体已是裸 HTML，但个别段落被单独包进 ``` 围栏。
 * 仅当"围栏之外的内容本身就像 HTML 排版"时才拆，避免误伤正文里合法的 HTML 代码示例。
 */
function unwrapMixedHtmlFences(raw: string): string {
	const blocks = findFenceBlocks(raw);
	if (blocks.length === 0) return raw;

	let remainder = "";
	let cursor = 0;
	for (const block of blocks) {
		remainder += raw.slice(cursor, block.start);
		cursor = block.end;
	}
	remainder += raw.slice(cursor);

	const remainderIsHtmlTypeset =
		HTML_BLOCK_START_REGEX.test(remainder.trim()) ||
		(/<(div|section|article|main|header|footer|p|h[1-6]|table|figure|blockquote|ul|ol)\b/i.test(
			remainder,
		) &&
			countHtmlTags(remainder) >= 4);
	if (!remainderIsHtmlTypeset) return raw;

	let result = raw;
	for (let k = blocks.length - 1; k >= 0; k--) {
		const block = blocks[k];
		const langOk = block.lang === "" || HTML_FENCE_LANGS.has(block.lang);
		if (langOk && looksLikeHtmlFragment(block.inner)) {
			result = result.slice(0, block.start) + block.inner.trim() + result.slice(block.end);
		}
	}
	return result;
}

export function normalizeAiGeneratedDocument(raw: string): string {
	if (!raw) return raw;

	// Case 1: 围栏包裹
	const openMatch = FENCE_OPEN_REGEX.exec(raw);
	if (openMatch) {
		const fenceMarker = openMatch[1][0];
		const lang = (openMatch[2] || "").toLowerCase();
		const openEnd = openMatch.index + openMatch[0].length;
		const before = raw.slice(0, openMatch.index).trim();
		const rest = raw.slice(openEnd);
		const closeRegex = new RegExp(
			`^[ \\t]*${fenceMarker}{${openMatch[1].length},}[ \\t]*$`,
			"m",
		);
		const closeMatch = closeRegex.exec(rest);
		const inner = (closeMatch ? rest.slice(0, closeMatch.index) : rest).trim();
		const after = closeMatch
			? rest.slice(closeMatch.index + closeMatch[0].length).trim()
			: "";

		const langSuggestsHtml = HTML_FENCE_LANGS.has(lang);
		if (
			(langSuggestsHtml || lang === "") &&
			looksLikeHtmlPayload(inner) &&
			before.length <= MAX_WRAPPER_META_CHARS &&
			after.length <= MAX_WRAPPER_META_CHARS &&
			inner.length > before.length + after.length
		) {
			return unwrapMixedHtmlFences(inner);
		}
	}

	// Case 2: 短导语 + 裸 HTML 主体（未使用围栏）
	const bareHtmlMatch = /^[ \t]*<(div|section)\b/im.exec(raw);
	if (bareHtmlMatch && bareHtmlMatch.index > 0) {
		const before = raw.slice(0, bareHtmlMatch.index).trim();
		const htmlPart = raw.slice(bareHtmlMatch.index);
		if (
			before.length > 0 &&
			before.length <= MAX_WRAPPER_META_CHARS &&
			looksLikeHtmlPayload(htmlPart) &&
			htmlPart.length > before.length * 2
		) {
			return unwrapMixedHtmlFences(htmlPart.trim());
		}
	}

	return unwrapMixedHtmlFences(raw);
}
