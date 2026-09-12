import type { Editor } from "@tiptap/react";

export const IMAGE_EXTS =
	/\.(png|jpe?g|gif|webp|svg|bmp|ico|avif|heic|heif|tiff?)$/i;
export const VIDEO_EXTS = /\.(mp4|webm|mov|mkv|avi|m4v|ogg|flv|wmv)$/i;

/**
 * Common Markdown pattern heuristics
 */
export const MARKDOWN_PATTERNS: readonly RegExp[] = [
	/^#{1,6}\s+/m,
	/^\s*[-*+]\s+/m,
	/^\s*\d+\.\s+/m,
	/^\s*>\s+/m,
	/```[\s\S]*?```/,
	/\*\*[^*]+?\*\*/,
	/~~[^~]+?~~/,
	/`[^`]+`/,
	/!\[.*?\]\([^\s)]+\)/,
	/\[.+?\]\(.+?\)/,
	// GFM table: line starting and ending with |
	/^\|.+\|/m,
];

/**
 * High-confidence markdown block patterns
 */
export const STRONG_MARKDOWN_BLOCKS = {
	// Fenced code block: ```python ... ```
	codeBlock: /```[\s\S]*?```/,
	// GFM table divider: |---|---|
	tableDivider: /^\|?\s*:?-{2,}:?\s*(\|?\s*:?-{2,}:?\s*)+\|?$/m,
	// Markdown heading: # Title
	heading: /^#{1,6}\s+\S+/m,
	// Markdown image: ![alt](url)
	image: /!\[.*?\]\([^\s)]+\)/,
	// Markdown bullet/task list: - item or - [ ] item
	list: /^\s*[-*+]\s+(?:\[[ xX]\]\s+)?\S+/m,
	// Bold marker: **text**
	bold: /\*\*[^*]+?\*\*/,
};

/**
 * Determine if a file is an image or video based on MIME type and filename extension
 */
export function getMediaFileKind(file: File): "image" | "video" | null {
	if (file.type.startsWith("image/") || IMAGE_EXTS.test(file.name)) {
		return "image";
	}
	if (file.type.startsWith("video/") || VIDEO_EXTS.test(file.name)) {
		return "video";
	}
	return null;
}

/**
 * Convert file to Base64 data URL as fallback when server upload fails
 */
export function fileToDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});
}

/**
 * Extract files from clipboard or drag dataTransfer with deduplication
 */
export function extractMediaFiles(
	dataTransfer: DataTransfer | null | undefined,
): File[] {
	if (!dataTransfer) return [];
	const files: File[] = [];
	const seen = new Set<string>();

	const addFile = (file: File | null) => {
		if (!file) return;
		const key = `${file.name}_${file.size}_${file.lastModified}`;
		if (!seen.has(key)) {
			seen.add(key);
			files.push(file);
		}
	};

	if (dataTransfer.files && dataTransfer.files.length > 0) {
		for (let i = 0; i < dataTransfer.files.length; i++) {
			addFile(dataTransfer.files.item(i));
		}
	}
	if (dataTransfer.items && dataTransfer.items.length > 0) {
		for (let i = 0; i < dataTransfer.items.length; i++) {
			const item = dataTransfer.items[i];
			if (item.kind === "file") {
				addFile(item.getAsFile());
			}
		}
	}
	return files;
}

/**
 * Update media node src attribute when async upload finishes
 */
export function updateMediaSrc(editor: Editor, oldSrc: string, newSrc: string) {
	let found = false;
	editor.state.doc.descendants((node, pos) => {
		if (found) return false;
		if (
			(node.type.name === "image" || node.type.name === "video") &&
			node.attrs.src === oldSrc
		) {
			editor.view.dispatch(
				editor.state.tr.setNodeAttribute(pos, "src", newSrc),
			);
			found = true;
			return false;
		}
	});
}

/**
 * Determine whether pasted clipboard content should be treated and converted as Markdown:
 * 1. Plain text must match Markdown syntax characteristics.
 * 2. If clipboard contains HTML from a code box (<pre><code>) or plain wrapper (<div/p>),
 *    check if strong Markdown markers exist in plain text but are unrendered in HTML.
 */
export function shouldTreatAsMarkdown(
	text: string,
	html: string | undefined,
): boolean {
	if (!text || !MARKDOWN_PATTERNS.some((p) => p.test(text))) {
		return false;
	}
	if (!html || !html.trim()) {
		return true;
	}

	// If text contains strong markdown elements but HTML lacks corresponding rendered semantic tags,
	// it indicates HTML is just an unrendered container (e.g. copied from code block, IDE, or chatbox)
	if (STRONG_MARKDOWN_BLOCKS.image.test(text) && !/<img[\s>]/i.test(html)) {
		return true;
	}
	if (
		STRONG_MARKDOWN_BLOCKS.bold.test(text) &&
		!/<(strong|b)[\s>]/i.test(html)
	) {
		return true;
	}
	if (
		STRONG_MARKDOWN_BLOCKS.heading.test(text) &&
		!/<h[1-6][\s>]/i.test(html)
	) {
		return true;
	}
	if (STRONG_MARKDOWN_BLOCKS.list.test(text) && !/<li[\s>]/i.test(html)) {
		return true;
	}
	if (
		STRONG_MARKDOWN_BLOCKS.tableDivider.test(text) &&
		!/<table[\s>]/i.test(html)
	) {
		return true;
	}

	// For code fence in text: if HTML is <pre><code> but text has headings/images/lists,
	// user copied raw markdown source from a code block -> convert as Markdown
	if (
		/<pre[\s>]/i.test(html) &&
		(STRONG_MARKDOWN_BLOCKS.heading.test(text) ||
			STRONG_MARKDOWN_BLOCKS.image.test(text) ||
			STRONG_MARKDOWN_BLOCKS.bold.test(text) ||
			STRONG_MARKDOWN_BLOCKS.list.test(text))
	) {
		return true;
	}

	// For general markdown, only block conversion if HTML contains actual rendered semantic blocks
	const hasRenderedSemanticBlocks =
		/<(h[1-6]|ul|ol|blockquote|table|img|strong|b)[\s>]/i.test(html);
	return !hasRenderedSemanticBlocks;
}
