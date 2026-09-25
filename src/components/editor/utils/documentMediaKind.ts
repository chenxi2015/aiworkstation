import type { EditorDocument } from "../types";

export interface DocumentMediaInfo {
	kind: "doc" | "audio" | "video";
	url?: string;
	filename?: string;
	size?: number | string;
	materialId?: number;
}

const AUDIO_EXTS = new Set([
	".mp3",
	".wav",
	".m4a",
	".aac",
	".flac",
	".ogg",
	".wma",
	".opus",
]);

const VIDEO_EXTS = new Set([
	".mp4",
	".mov",
	".webm",
	".mkv",
	".avi",
	".m4v",
	".flv",
]);

/**
 * Detect whether a document represents a dedicated audio/video asset
 * or a standard rich-text document.
 */
export function detectDocumentMediaInfo(
	doc: EditorDocument | null | undefined,
): DocumentMediaInfo {
	if (!doc || !doc.content) {
		return { kind: "doc" };
	}

	try {
		const json = JSON.parse(doc.content);

		// 1. Direct explicit media metadata
		if (json.mediaMeta && typeof json.mediaMeta === "object") {
			const meta = json.mediaMeta;
			if (meta.kind === "audio" || meta.kind === "video") {
				return {
					kind: meta.kind,
					url: meta.url,
					filename: meta.filename || doc.title,
					size: meta.size,
					materialId: meta.materialId,
				};
			}
		}

		// 2. Scan JSON content nodes to detect if the document was generated from a media asset
		let foundAudioUrl: string | null = null;
		let foundVideoUrl: string | null = null;
		let foundFilename: string | null = null;
		let sourceMaterialId: number | undefined;

		const traverse = (node: Record<string, unknown>) => {
			if (!node || typeof node !== "object") return;

			// Extract source material ID if present (e.g., "来源：素材库 #318")
			if (node.type === "text" && typeof node.text === "string") {
				const match = node.text.match(/来源：素材库\s*#(\d+)/);
				if (match && match[1]) {
					sourceMaterialId = Number.parseInt(match[1], 10);
				}
			}

			// Check video nodes
			if (node.type === "video") {
				const attrs = node.attrs as Record<string, unknown> | undefined;
				if (typeof attrs?.src === "string") {
					foundVideoUrl = attrs.src;
				}
			}

			// Check link marks on text
			if (Array.isArray(node.marks)) {
				for (const mark of node.marks) {
					if (mark && mark.type === "link" && mark.attrs?.href) {
						const href = String(mark.attrs.href);
						const text = typeof node.text === "string" ? node.text.trim() : "";
						const lowerHref = href.toLowerCase();
						const lowerText = text.toLowerCase();

						for (const ext of AUDIO_EXTS) {
							if (lowerHref.includes(ext) || lowerText.endsWith(ext)) {
								foundAudioUrl = href;
								foundFilename = text || doc.title;
								break;
							}
						}

						for (const ext of VIDEO_EXTS) {
							if (lowerHref.includes(ext) || lowerText.endsWith(ext)) {
								foundVideoUrl = href;
								foundFilename = text || doc.title;
								break;
							}
						}
					}
				}
			}

			if (Array.isArray(node.content)) {
				for (const child of node.content) {
					traverse(child as Record<string, unknown>);
				}
			}
		};

		traverse(json);

		// If it's an audio asset
		if (foundAudioUrl) {
			return {
				kind: "audio",
				url: foundAudioUrl,
				filename: foundFilename || doc.title,
				materialId: sourceMaterialId,
			};
		}

		// If it's a video asset
		if (foundVideoUrl) {
			return {
				kind: "video",
				url: foundVideoUrl,
				filename: foundFilename || doc.title,
				materialId: sourceMaterialId,
			};
		}
	} catch {
		// Not a JSON document, treat as normal doc
	}

	return { kind: "doc" };
}
