/**
 * Utilities for recognizing and handling Obsidian vault file extensions.
 */

const IMAGE_EXTS = new Set([
	"png",
	"jpg",
	"jpeg",
	"gif",
	"webp",
	"svg",
	"bmp",
	"avif",
	"ico",
]);

const BOOK_EXTS = new Set(["epub", "mobi", "azw3", "djvu"]);
const AUDIO_EXTS = new Set(["mp3", "wav", "m4a", "ogg", "flac", "aac"]);
const VIDEO_EXTS = new Set(["mp4", "webm", "mov", "mkv", "m4v"]);

/** Check if path/target ends with .md */
export function isMarkdownFile(pathOrTarget: string): boolean {
	return /\.md$/i.test(pathOrTarget.trim());
}

/** Check if path represents an image asset */
export function isImageFile(pathOrTarget: string): boolean {
	const ext = getExtension(pathOrTarget);
	return IMAGE_EXTS.has(ext);
}

/**
 * Determine whether a wikilink target/path supports inline hover preview.
 * As per product rule: only markdown notes and images can be previewed on hover.
 * Binary documents like epub, video, audio, etc. are filtered out from hover previews.
 */
export function canPreviewHover(pathOrTarget: string): boolean {
	const cleaned = pathOrTarget.trim();
	if (!cleaned) return false;
	return isMarkdownFile(cleaned) || isImageFile(cleaned);
}

/** Check if a target string contains a non-markdown file extension (e.g. "book.epub", "doc.pdf") */
export function hasNonMarkdownExtension(target: string): boolean {
	const trimmed = target.trim();
	const match = trimmed.match(/\.([a-zA-Z0-9_-]+)$/);
	if (!match) return false;
	const ext = match[1].toLowerCase();
	return ext !== "md";
}

/** Extract lowercase extension without leading dot */
export function getExtension(pathOrTarget: string): string {
	const trimmed = pathOrTarget.trim();
	const dotIdx = trimmed.lastIndexOf(".");
	if (dotIdx < 0 || dotIdx === trimmed.length - 1) return "";
	return trimmed.slice(dotIdx + 1).toLowerCase();
}

export type VaultFileCategory =
	| "markdown"
	| "book"
	| "pdf"
	| "image"
	| "audio"
	| "video"
	| "file";

/** Classify file type category */
export function getVaultFileCategory(pathOrTarget: string): VaultFileCategory {
	if (isMarkdownFile(pathOrTarget)) return "markdown";
	const ext = getExtension(pathOrTarget);
	if (BOOK_EXTS.has(ext)) return "book";
	if (ext === "pdf") return "pdf";
	if (IMAGE_EXTS.has(ext)) return "image";
	if (AUDIO_EXTS.has(ext)) return "audio";
	if (VIDEO_EXTS.has(ext)) return "video";
	return "file";
}
