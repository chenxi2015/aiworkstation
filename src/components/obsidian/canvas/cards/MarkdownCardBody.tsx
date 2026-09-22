import { memo, useEffect, useMemo, useState } from "react";
import {
	fetchVaultNote,
	getCachedVaultNote,
} from "../../../../services/api/obsidianClient";
import { markdownToHtml } from "../../../editor/markdown";
import { cardClass } from "./cardShared";

// In-memory LRU cache for rendered Markdown HTML strings to avoid expensive re-parsing
const MAX_MARKDOWN_CACHE_SIZE = 150;
const markdownCache = new Map<string, string>();

function getRenderedMarkdownHtml(raw: string): string {
	if (!raw) return "";
	const cached = markdownCache.get(raw);
	if (cached !== undefined) return cached;

	// Strip YAML frontmatter
	const body = raw.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
	const html = markdownToHtml(body);

	if (markdownCache.size >= MAX_MARKDOWN_CACHE_SIZE) {
		const firstKey = markdownCache.keys().next().value;
		if (firstKey !== undefined) markdownCache.delete(firstKey);
	}
	markdownCache.set(raw, html);
	return html;
}

export interface MarkdownCardBodyProps {
	file: string;
	borderStyle: React.CSSProperties;
}

export const MarkdownCardBody = memo(function MarkdownCardBody({
	file,
	borderStyle,
}: MarkdownCardBodyProps) {
	const [content, setContent] = useState<string>(() => {
		const cached = getCachedVaultNote(file);
		return cached?.content ?? "";
	});
	const [loading, setLoading] = useState(!content);

	useEffect(() => {
		let active = true;
		void fetchVaultNote(file).then(({ note }) => {
			if (!active) return;
			if (note?.content !== undefined) {
				setContent(note.content);
			}
			setLoading(false);
		});
		return () => {
			active = false;
		};
	}, [file]);

	const html = useMemo(() => getRenderedMarkdownHtml(content), [content]);
	const displayName = file.split("/").pop()?.replace(/\.md$/i, "") ?? file;

	return (
		<div className="relative w-full h-full flex flex-col">
			{/* Top note title bar / badge */}
			<div
				className="absolute -top-5 left-1 text-[11px] text-muted truncate max-w-[95%] select-none pointer-events-none font-medium"
				title={displayName}
			>
				{displayName}
			</div>
			<div
				className={`${cardClass} nowheel p-4 overflow-y-auto text-xs text-foreground/90 leading-relaxed cursor-default`}
				style={borderStyle}
			>
				{loading && !html ? (
					<div className="flex items-center justify-center h-full text-xs text-muted">
						加载笔记中...
					</div>
				) : html ? (
					<div
						className="canvas-markdown-preview prose prose-sm dark:prose-invert max-w-none break-words"
						// biome-ignore lint/security/noDangerouslySetInnerHtml: rendered markdown HTML
						dangerouslySetInnerHTML={{ __html: html }}
					/>
				) : (
					<div className="text-muted italic text-center py-4">（空笔记）</div>
				)}
			</div>
		</div>
	);
});
