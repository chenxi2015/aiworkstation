import type { EditorDocument } from "../types";
import { MAX_DOC_CONTENT_CHARS } from "../types";

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

	// 超大文档（如长篇稿件导入）绝无可能是音视频资产文档，
	// 跳过 JSON.parse，避免侧边栏每行渲染时把数十 MB 的 JSON 解析成 GB 级对象图
	if (doc.content.length > MAX_DOC_CONTENT_CHARS) {
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

		// 2. Scan JSON content nodes to detect if the document was generated from a media asset.
		// 只有"单媒体文档"（整篇内容实质上只有一个视频/音频，没有其它正文）才识别为
		// 音视频资产文档；粘贴的富文本里即使混入了视频，也仍按普通文档处理。
		let foundAudioUrl: string | null = null;
		let foundVideoUrl: string | null = null;
		let foundFilename: string | null = null;
		let sourceMaterialId: number | undefined;
		let videoNodeCount = 0;
		let audioLinkCount = 0;
		let videoLinkCount = 0;
		let otherMediaCount = 0;
		let meaningfulTextLength = 0;

		const traverse = (node: Record<string, unknown>) => {
			if (!node || typeof node !== "object") return;

			// Check video nodes
			if (node.type === "video") {
				videoNodeCount += 1;
				const attrs = node.attrs as Record<string, unknown> | undefined;
				if (!foundVideoUrl && typeof attrs?.src === "string") {
					foundVideoUrl = attrs.src;
				}
			}

			// Images etc. count as extra media, disqualifying single-media detection
			if (node.type === "image") {
				otherMediaCount += 1;
			}

			if (node.type === "text" && typeof node.text === "string") {
				const trimmed = node.text.trim();

				// Check link marks on text for audio/video file references.
				// 指向音视频文件的链接本身就算作媒体，其链接文字不算正文内容。
				let hasMediaLink = false;
				if (Array.isArray(node.marks)) {
					for (const mark of node.marks) {
						if (mark && mark.type === "link" && mark.attrs?.href) {
							const href = String(mark.attrs.href);
							const lowerHref = href.toLowerCase();
							const lowerText = trimmed.toLowerCase();

							for (const ext of AUDIO_EXTS) {
								if (lowerHref.includes(ext) || lowerText.endsWith(ext)) {
									audioLinkCount += 1;
									hasMediaLink = true;
									if (!foundAudioUrl) foundAudioUrl = href;
									foundFilename = trimmed || doc.title;
									break;
								}
							}

							for (const ext of VIDEO_EXTS) {
								if (lowerHref.includes(ext) || lowerText.endsWith(ext)) {
									videoLinkCount += 1;
									hasMediaLink = true;
									if (!foundVideoUrl) foundVideoUrl = href;
									foundFilename = trimmed || doc.title;
									break;
								}
							}
						}
					}
				}

				// Extract source material ID if present (e.g., "来源：素材库 #318").
				// 导入素材时自动附加的来源行 / "关联素材文件" 标题不算正文内容。
				const sourceMatch = trimmed.match(/^来源：素材库\s*#(\d+)$/);
				if (sourceMatch?.[1]) {
					sourceMaterialId = Number.parseInt(sourceMatch[1], 10);
				} else if (trimmed && trimmed !== "关联素材文件" && !hasMediaLink) {
					meaningfulTextLength += trimmed.length;
				}
			}

			if (Array.isArray(node.content)) {
				for (const child of node.content) {
					traverse(child as Record<string, unknown>);
				}
			}
		};

		traverse(json);

		// 整篇文档恰好只包含一个媒体（一个视频节点/链接，或一个音频链接），
		// 且没有其它正文与媒体时，才按音视频资产文档处理
		const mediaCount = videoNodeCount + videoLinkCount + audioLinkCount;
		const isSingleMediaDoc =
			mediaCount === 1 && otherMediaCount === 0 && meaningfulTextLength === 0;

		// If it's an audio asset
		if (isSingleMediaDoc && foundAudioUrl) {
			return {
				kind: "audio",
				url: foundAudioUrl,
				filename: foundFilename || doc.title,
				materialId: sourceMaterialId,
			};
		}

		// If it's a video asset
		if (isSingleMediaDoc && foundVideoUrl) {
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
