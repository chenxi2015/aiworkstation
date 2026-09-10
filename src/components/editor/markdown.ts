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
