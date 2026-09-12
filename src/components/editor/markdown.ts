/**
 * TipTap JSON → Markdown 导出（editor-plan.md Editor-α：导出走受控序列化器，
 * 只覆盖本编辑器 schema 内的节点/标记，行为确定性优于通用转换器）。
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

function renderBlock(node: JSONContent, indent: string): string {
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
			const renderRow = (row: JSONContent) =>
				`| ${(row.content ?? []).map((cell) => renderInlineGroup(cell.content).replace(/\|/g, "\\|")).join(" | ")} |`;
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
 * Converts Markdown text into a TipTap document structure (ProseMirror JSON nodes)
 */
export function markdownToTiptapDoc(markdownText: string): {
	nodes: Array<Record<string, unknown>>;
	jsonString: string;
	contentText: string;
} {
	const lines = markdownText.split("\n").filter((l) => l.trim().length > 0);
	const nodes = lines.map((line) => {
		const trimmed = line.trim();
		// 1. Image: ![alt](url)
		const imgMatch = trimmed.match(
			/^!\[(.*?)\]\((https?:\/\/[^\s)]+|\/api\/files\/[^\s)]+)\)$/,
		);
		if (imgMatch) {
			return {
				type: "image",
				attrs: { src: imgMatch[2], alt: imgMatch[1] || "" },
			};
		}
		// 2. Video: [▶ 视频](url) or similar
		const videoMatch = trimmed.match(
			/^\[(?:▶\s*|🎥\s*)?(?:.*?视频|video).*?\]\((https?:\/\/[^\s)]+|\/api\/files\/[^\s)]+)\)$/,
		);
		if (videoMatch) {
			return {
				type: "video",
				attrs: { src: videoMatch[1] },
			};
		}
		// 3. Heading: # Heading
		const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
		if (headingMatch) {
			return {
				type: "heading",
				attrs: { level: headingMatch[1].length },
				content: [{ type: "text", text: headingMatch[2] }],
			};
		}
		// 4. Default paragraph
		return {
			type: "paragraph",
			content: [{ type: "text", text: trimmed }],
		};
	});

	const jsonString = JSON.stringify({
		type: "doc",
		content: nodes.length > 0 ? nodes : [{ type: "paragraph" }],
	});

	return { nodes, jsonString, contentText: markdownText };
}
