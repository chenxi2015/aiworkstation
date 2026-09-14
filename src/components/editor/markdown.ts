import { marked, type Tokens } from "marked";
import { extractVideoUrl } from "./importers.ts";

/**
 * TipTap JSON ↔ Markdown 转换器（基于 marked AST 保证标准 Markdown/GFM 解析保真度）
 */

export interface JSONContent {
	type?: string;
	text?: string;
	attrs?: Record<string, unknown>;
	marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
	content?: JSONContent[];
}

function renderInline(node: JSONContent): string {
	if (node.type === "hardBreak") return "  \n";
	if (node.type === "image") {
		const src = String(node.attrs?.src ?? "");
		const alt = String(node.attrs?.alt ?? "");
		return `![${alt}](${src})`;
	}
	if (node.type === "video") {
		const src = String(node.attrs?.src ?? "");
		return `[▶ 视频](${src})`;
	}
	if (node.type !== "text") return "";

	let text = node.text ?? "";
	const marks = node.marks ?? [];
	// code 最内层（内容不再套其他标记语义），link 最外层
	if (marks.some((m) => m.type === "code")) text = `\`${text}\``;
	if (marks.some((m) => m.type === "bold")) text = `**${text}**`;
	if (marks.some((m) => m.type === "italic")) text = `*${text}*`;
	if (marks.some((m) => m.type === "underline")) text = `<u>${text}</u>`;
	if (marks.some((m) => m.type === "strike")) text = `~~${text}~~`;
	const link = marks.find((m) => m.type === "link");
	if (link) text = `[${text}](${String(link.attrs?.href ?? "")})`;
	return text;
}

function renderInlineGroup(children: JSONContent[] | undefined): string {
	return (children ?? []).map(renderInline).join("");
}

export function renderBlock(node: JSONContent, indent: string): string {
	switch (node.type) {
		case "paragraph":
			return `${indent}${renderInlineGroup(node.content)}`;
		case "heading": {
			const level = Math.min(Math.max(Number(node.attrs?.level ?? 1), 1), 6);
			return `${indent}${"#".repeat(level)} ${renderInlineGroup(node.content)}`;
		}
		case "blockquote": {
			const inner = renderBlocks(node.content ?? [], "");
			return inner
				.split("\n")
				.map((line) => `${indent}> ${line}`.trimEnd())
				.join("\n");
		}
		case "taskList":
			return (node.content ?? [])
				.map((item) => {
					const checked = Boolean(item.attrs?.checked);
					return renderListItem(
						item,
						`${indent}- [${checked ? "x" : " "}] `,
						indent,
					);
				})
				.join("\n");
		case "bulletList":
			return (node.content ?? [])
				.map((item) => renderListItem(item, `${indent}- `, indent))
				.join("\n");
		case "orderedList":
			return (node.content ?? [])
				.map((item, i) => renderListItem(item, `${indent}${i + 1}. `, indent))
				.join("\n");
		case "codeBlock": {
			const lang = String(node.attrs?.language ?? "");
			const code = renderInlineGroup(node.content);
			return `${indent}\`\`\`${lang}\n${code}\n${indent}\`\`\``;
		}
		case "table": {
			// Render GFM table; first row = header, rest = body
			const rows = node.content ?? [];
			if (rows.length === 0) return "";
			const renderCell = (cell: JSONContent) => {
				const children = cell.content ?? [];
				const cellText = children
					.map((c) =>
						c.type === "paragraph"
							? renderInlineGroup(c.content)
							: renderInline(c),
					)
					.join("<br/>")
					.replace(/\|/g, "\\|");
				return cellText || " ";
			};
			const renderRow = (row: JSONContent) =>
				`| ${(row.content ?? []).map(renderCell).join(" | ")} |`;
			const [headerRow, ...bodyRows] = rows;
			if (!headerRow) return "";
			const colCount = (headerRow.content ?? []).length || 1;
			const separator = `| ${Array(colCount).fill("---").join(" | ")} |`;
			const parts = [
				renderRow(headerRow),
				separator,
				...bodyRows.map(renderRow),
			];
			return parts.join("\n");
		}
		case "horizontalRule":
			return `${indent}---`;
		case "image":
			return `${indent}${renderInline(node)}`;
		case "video":
			return `${indent}${renderInline(node)}`;
		default:
			return node.content ? renderBlocks(node.content, indent) : "";
	}
}

function renderListItem(
	item: JSONContent,
	prefix: string,
	indent: string,
): string {
	const childIndent = `${indent}${" ".repeat(prefix.length - indent.length)}`;
	const parts = (item.content ?? []).map((child, i) =>
		i === 0 ? renderBlock(child, prefix) : renderBlock(child, childIndent),
	);
	return parts.join("\n");
}

function renderBlocks(nodes: JSONContent[], indent: string): string {
	return nodes
		.map((n) => renderBlock(n, indent))
		.filter((s) => s.trim().length > 0)
		.join("\n\n");
}

/** TipTap doc JSON → Markdown 字符串 */
export function tiptapJsonToMarkdown(doc: JSONContent): string {
	return renderBlocks(doc.content ?? [], "");
}

/**
 * Parses inline markdown tokens (bold, italic, code, strike, link) into TipTap inline text nodes with marks.
 */
export function parseInlineMarkdownToNodes(
	tokensOrText: Tokens.Generic[] | string,
	activeMarks: Array<{ type: string; attrs?: Record<string, unknown> }> = [],
): JSONContent[] {
	const tokens =
		typeof tokensOrText === "string"
			? (marked.lexer(tokensOrText)[0] as Tokens.Paragraph | undefined)
					?.tokens || []
			: tokensOrText;

	const result: JSONContent[] = [];

	for (const token of tokens) {
		switch (token.type) {
			case "text":
				if (token.tokens && token.tokens.length > 0) {
					result.push(...parseInlineMarkdownToNodes(token.tokens, activeMarks));
				} else if (token.text) {
					result.push({
						type: "text",
						text: token.text,
						...(activeMarks.length > 0 ? { marks: [...activeMarks] } : {}),
					});
				}
				break;
			case "strong":
				result.push(
					...parseInlineMarkdownToNodes(token.tokens || [], [
						...activeMarks,
						{ type: "bold" },
					]),
				);
				break;
			case "em":
				result.push(
					...parseInlineMarkdownToNodes(token.tokens || [], [
						...activeMarks,
						{ type: "italic" },
					]),
				);
				break;
			case "codespan":
				if (token.text) {
					// In ProseMirror/TipTap schema, code mark specifies `excludes: "_"` and cannot be combined with any other marks
					result.push({
						type: "text",
						text: token.text,
						marks: [{ type: "code" }],
					});
				}
				break;
			case "del":
				result.push(
					...parseInlineMarkdownToNodes(token.tokens || [], [
						...activeMarks,
						{ type: "strike" },
					]),
				);
				break;
			case "link":
				result.push(
					...parseInlineMarkdownToNodes(token.tokens || [], [
						...activeMarks,
						{ type: "link", attrs: { href: token.href || "" } },
					]),
				);
				break;
			case "escape":
				if (token.text) {
					result.push({
						type: "text",
						text: token.text,
						...(activeMarks.length > 0 ? { marks: [...activeMarks] } : {}),
					});
				}
				break;
			case "br":
				result.push({ type: "hardBreak" });
				break;
			default:
				if (
					"text" in token &&
					typeof (token as { text?: unknown }).text === "string" &&
					(token as { text: string }).text
				) {
					result.push({
						type: "text",
						text: (token as { text: string }).text,
						...(activeMarks.length > 0 ? { marks: [...activeMarks] } : {}),
					});
				}
				break;
		}
	}
	return result;
}

/**
 * Recursively filters out any invalid text nodes (e.g. empty string text)
 * and ensures ProseMirror schema conformity to prevent "RangeError: Empty text nodes are not allowed".
 */
export function sanitizeTiptapJson(node: JSONContent): JSONContent | null {
	if (node.type === "text") {
		if (!node.text || node.text.length === 0) {
			return null;
		}
		// Code marks in ProseMirror exclude all other marks. Enforce singularity to prevent schema validation errors.
		if (node.marks?.some((m) => m.type === "code")) {
			return {
				...node,
				marks: [{ type: "code" }],
			};
		}
		return node;
	}

	if (Array.isArray(node.content)) {
		const cleanContent: JSONContent[] = [];
		for (const child of node.content) {
			const cleaned = sanitizeTiptapJson(child);
			if (cleaned) {
				cleanContent.push(cleaned);
			}
		}

		// Ensure tableCell and tableHeader meet ProseMirror's `block+` requirement
		if (
			cleanContent.length === 0 &&
			(node.type === "tableCell" || node.type === "tableHeader")
		) {
			cleanContent.push({ type: "paragraph" });
		}

		return {
			...node,
			...(cleanContent.length > 0
				? { content: cleanContent }
				: { content: undefined }),
		};
	}

	return node;
}

function convertTokenToBlocks(token: Tokens.Generic): JSONContent[] {
	switch (token.type) {
		case "heading": {
			const inlineContent = parseInlineMarkdownToNodes(token.tokens || []);
			const content: JSONContent[] =
				inlineContent.length > 0
					? inlineContent
					: token.text
						? [{ type: "text", text: token.text }]
						: [];
			return [
				{
					type: "heading",
					attrs: { level: Math.min(Math.max(token.depth, 1), 3) },
					...(content.length > 0 ? { content } : {}),
				},
			];
		}
		case "paragraph": {
			const subTokens = token.tokens || [];
			const blocks: JSONContent[] = [];
			let pendingInline: Tokens.Generic[] = [];

			const flushInline = () => {
				if (pendingInline.length > 0) {
					const content = parseInlineMarkdownToNodes(pendingInline);
					if (content.length > 0) {
						blocks.push({ type: "paragraph", content });
					}
					pendingInline = [];
				}
			};

			for (const t of subTokens) {
				if (t.type === "image") {
					flushInline();
					blocks.push({
						type: "image",
						attrs: {
							src: t.href,
							alt: t.text || "",
						},
					});
				} else if (
					t.type === "link" &&
					(extractVideoUrl(t.href) ||
						(t.text && /▶\s*视频|视频|video/i.test(t.text)))
				) {
					flushInline();
					blocks.push({
						type: "video",
						attrs: {
							src: t.href,
						},
					});
				} else {
					pendingInline.push(t);
				}
			}
			flushInline();

			if (blocks.length === 0) {
				const content = parseInlineMarkdownToNodes(subTokens);
				const finalContent: JSONContent[] =
					content.length > 0
						? content
						: token.text
							? [{ type: "text", text: token.text }]
							: [];
				return [
					{
						type: "paragraph",
						...(finalContent.length > 0 ? { content: finalContent } : {}),
					},
				];
			}
			return blocks;
		}
		case "list": {
			const items = token.items || [];
			const isTask = items.some((i: { task?: boolean }) => Boolean(i.task));
			const listType = isTask
				? "taskList"
				: token.ordered
					? "orderedList"
					: "bulletList";
			const itemType = isTask ? "taskItem" : "listItem";

			const content = items.map(
				(item: {
					task?: boolean;
					checked?: boolean;
					tokens?: Tokens.Generic[];
					text: string;
				}) => {
					const itemBlocks: JSONContent[] = [];
					for (const it of item.tokens || []) {
						itemBlocks.push(...convertTokenToBlocks(it));
					}
					return {
						type: itemType,
						...(isTask ? { attrs: { checked: Boolean(item.checked) } } : {}),
						content:
							itemBlocks.length > 0
								? itemBlocks
								: [
										{
											type: "paragraph",
											...(item.text
												? { content: [{ type: "text", text: item.text }] }
												: {}),
										},
									],
					};
				},
			);

			return [{ type: listType, content }];
		}
		case "blockquote": {
			const quoteBlocks: JSONContent[] = [];
			for (const t of token.tokens || []) {
				quoteBlocks.push(...convertTokenToBlocks(t));
			}
			return [
				{
					type: "blockquote",
					content:
						quoteBlocks.length > 0 ? quoteBlocks : [{ type: "paragraph" }],
				},
			];
		}
		case "code":
			return [
				{
					type: "codeBlock",
					attrs: {
						language: token.lang ? token.lang.trim().split(/\s+/)[0] : "",
					},
					...(token.text
						? { content: [{ type: "text", text: token.text }] }
						: {}),
				},
			];
		case "table": {
			const rows: JSONContent[] = [];
			if (token.header && token.header.length > 0) {
				rows.push({
					type: "tableRow",
					content: token.header.map(
						(cell: { tokens?: Tokens.Generic[]; text: string }) => {
							const cellInline = parseInlineMarkdownToNodes(cell.tokens || []);
							const cellContent: JSONContent[] =
								cellInline.length > 0
									? cellInline
									: cell.text
										? [{ type: "text", text: cell.text }]
										: [];
							return {
								type: "tableHeader",
								content: [
									{
										type: "paragraph",
										...(cellContent.length > 0 ? { content: cellContent } : {}),
									},
								],
							};
						},
					),
				});
			}
			for (const row of token.rows || []) {
				rows.push({
					type: "tableRow",
					content: row.map(
						(cell: { tokens?: Tokens.Generic[]; text: string }) => {
							const cellInline = parseInlineMarkdownToNodes(cell.tokens || []);
							const cellContent: JSONContent[] =
								cellInline.length > 0
									? cellInline
									: cell.text
										? [{ type: "text", text: cell.text }]
										: [];
							return {
								type: "tableCell",
								content: [
									{
										type: "paragraph",
										...(cellContent.length > 0 ? { content: cellContent } : {}),
									},
								],
							};
						},
					),
				});
			}
			return [{ type: "table", content: rows }];
		}
		case "hr":
			return [{ type: "horizontalRule" }];
		case "space":
			return [];
		default:
			if (token.tokens) {
				const inner: JSONContent[] = [];
				for (const t of token.tokens) {
					inner.push(...convertTokenToBlocks(t));
				}
				return inner;
			}
			return [];
	}
}

/**
 * Converts Markdown text into a TipTap document structure (ProseMirror JSON nodes)
 * Powered by marked AST lexer for standard Markdown and GFM compliance.
 */
export function markdownToTiptapDoc(markdownText: string): {
	nodes: JSONContent[];
	jsonString: string;
	contentText: string;
} {
	if (!markdownText || !markdownText.trim()) {
		const emptyNodes = [{ type: "paragraph" }];
		return {
			nodes: emptyNodes,
			jsonString: JSON.stringify({ type: "doc", content: emptyNodes }),
			contentText: "",
		};
	}

	const normalized = markdownText.replace(/\r\n/g, "\n");
	const tokens = marked.lexer(normalized);
	const rawNodes: JSONContent[] = [];

	for (const token of tokens) {
		rawNodes.push(...convertTokenToBlocks(token));
	}

	// Sanitize nodes recursively to eliminate empty text nodes or malformed table cells
	const cleanedNodes = rawNodes
		.map(sanitizeTiptapJson)
		.filter((n): n is JSONContent => Boolean(n));

	const finalNodes =
		cleanedNodes.length > 0 ? cleanedNodes : [{ type: "paragraph" }];
	const jsonString = JSON.stringify({
		type: "doc",
		content: finalNodes,
	});

	return { nodes: finalNodes, jsonString, contentText: markdownText };
}
