import { markdownToHtml } from "../../../editor/markdown";

export const cardClass =
	"w-full h-full rounded-lg border border-border bg-surface shadow-sm overflow-hidden transition-[border-color,box-shadow] duration-150";

export function autoFocus(el: HTMLTextAreaElement | HTMLInputElement | null) {
	if (!el) return;
	el.focus();
	el.select();
}

// In-memory LRU cache for rendered Markdown HTML strings to avoid expensive re-parsing
const MAX_MARKDOWN_CACHE_SIZE = 150;
const markdownCache = new Map<string, string>();

/**
 * Parses markdown into HTML with LRU caching for canvas cards.
 */
export function getRenderedMarkdownHtml(raw: string): string {
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
