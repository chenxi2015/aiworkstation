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
 * 内联排版样式特征：带 style="..." 的块级/内联标签。
 * 「美化排版」产物几乎必带内联样式，而技术文章里合法的 HTML 代码示例几乎不带，
 * 是区分"排版片段"与"代码示例"的确定性特征。
 */
const INLINE_STYLE_TAG_REGEX =
	/<(div|section|article|main|header|footer|p|h[1-6]|table|img|figure|figcaption|blockquote|ul|ol|li|span)\b[^>]*?\sstyle\s*=/i;

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
 * - Case 4：散文混排——Markdown 散文正文中散落带内联样式的排版片段围栏 → 逐个拆包
 *   （可用原文对照保护正文里合法存在的代码示例块）
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
		const closeRe = new RegExp(`^[ \\t]*${markerChar}{${minLen},}[ \\t]*$`);
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
 * 定位"裸 HTML 主体"的起始匹配：跳过落在 ``` 围栏内部的 <div>/<section> 行。
 * 围栏内的 HTML 行属于代码块（或待 Case 4 拆包的排版片段），不能作为
 * "整篇是裸 HTML 文档"的判据，否则会把散文+围栏混排误判成 Case 2 并误拆代码块。
 */
function findBareHtmlStart(raw: string): RegExpExecArray | null {
	const fences = findFenceBlocks(raw);
	const bareHtmlRegex = /^[ \t]*<(div|section)\b/gim;
	let match: RegExpExecArray | null;
	// biome-ignore lint/suspicious/noAssignInExpressions: 标准的正则迭代写法
	while ((match = bareHtmlRegex.exec(raw)) !== null) {
		const matchIndex = match.index;
		const insideFence = fences.some(
			(block) => matchIndex >= block.start && matchIndex < block.end,
		);
		if (!insideFence) return match;
	}
	return null;
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
			result =
				result.slice(0, block.start) +
				block.inner.trim() +
				result.slice(block.end);
		}
	}
	return result;
}

/** 折叠空白，用于围栏内容的同源比对（容忍改写时的重排/缩进差异） */
function collapseWhitespace(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

/**
 * 判断输出中的围栏块是否与原文中某个已有围栏块同源。
 * 同源块是原文自带的代码示例（如技术教程中的 HTML 代码），改写时应保留围栏。
 * 用首/尾特征片段比对，容忍模型对代码块的轻度重排。
 */
function isPreExistingFence(inner: string, originalInners: string[]): boolean {
	if (originalInners.length === 0) return false;
	const probe = collapseWhitespace(inner);
	if (!probe) return false;
	const head = probe.slice(0, 60);
	const tail = probe.slice(-60);
	return originalInners.some(
		(original) =>
			original.includes(head) ||
			original.includes(tail) ||
			probe.includes(collapseWhitespace(original).slice(0, 60)),
	);
}

/**
 * Case 4 散文混排拆包：Markdown 散文正文中散落着被 ``` 围栏包裹的 HTML 排版片段
 * （用户要求"美化样式/网页排版"时模型的典型违规形态：散文用 Markdown 改写，
 * 需要视觉样式的卡片/封面/数据区却被单独包进了围栏）。
 * 与 Case 3 的区别：围栏之外是纯散文而非 HTML 排版主体，因此换用两个更严格的
 * 判据，避免误伤技术文章里合法的 HTML 代码示例：
 * 1. 片段必须带内联排版样式（style="..."）——代码示例几乎不会带；
 * 2. 若提供了原文，片段不得与原文中任何已有围栏块同源。
 * 流式场景安全：未闭合围栏按"剩余内容即围栏体"处理，随流推进逐帧自我修正。
 */
function unwrapProseEmbeddedHtmlFences(
	raw: string,
	originalContent?: string,
): string {
	const blocks = findFenceBlocks(raw);
	if (blocks.length === 0) return raw;

	const originalInners = originalContent
		? findFenceBlocks(originalContent).map((block) =>
				collapseWhitespace(block.inner),
			)
		: [];

	let result = raw;
	for (let k = blocks.length - 1; k >= 0; k--) {
		const block = blocks[k];
		const langOk = block.lang === "" || HTML_FENCE_LANGS.has(block.lang);
		if (!langOk) continue;
		const inner = block.inner.trim();
		if (!looksLikeHtmlFragment(inner)) continue;
		if (!INLINE_STYLE_TAG_REGEX.test(inner)) continue;
		if (isPreExistingFence(inner, originalInners)) continue;
		result = result.slice(0, block.start) + inner + result.slice(block.end);
	}
	return result;
}

/**
 * @param raw AI 输出的原始文本
 * @param originalContent 可选，改写任务的原文（Markdown）。提供后用于区分
 * 「原文自带的代码块」（保留围栏）与「模型新增的排版片段围栏」（拆包还原）。
 */
export function normalizeAiGeneratedDocument(
	raw: string,
	originalContent?: string,
): string {
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

	// Case 2: 短导语 + 裸 HTML 主体（未使用围栏；围栏内的 <div> 行不算）
	const bareHtmlMatch = findBareHtmlStart(raw);
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

	return unwrapProseEmbeddedHtmlFences(
		unwrapMixedHtmlFences(raw),
		originalContent,
	);
}
