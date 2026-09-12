import type {
	DocumentVersion,
	DocumentVersionOrigin,
	EditorDocument,
} from "../../components/editor/types";
import {
	createDocument,
	deleteDocument,
	downloadExternalAssetToDocument,
	generateAiBarText,
	listDocuments,
	listDocumentVersions,
	openDocumentDirectory,
	snapshotDocumentVersion,
	updateDocument,
	uploadDocumentAsset,
} from "../../server/functions/editor";

export async function fetchDocuments(): Promise<EditorDocument[]> {
	try {
		return (await listDocuments()) ?? [];
	} catch (err) {
		console.warn("[editorClient] listDocuments error:", err);
		return [];
	}
}

export async function createDocumentRpc(params: {
	title?: string;
	stylePreset?: string;
}): Promise<EditorDocument> {
	return await createDocument({ data: params });
}

export async function updateDocumentRpc(params: {
	id: number;
	title?: string;
	content?: string;
	contentText?: string;
	stylePreset?: string;
	status?: EditorDocument["status"];
}): Promise<void> {
	await updateDocument({ data: params });
}

export async function deleteDocumentRpc(
	id: number,
	deleteLocalAssets = false,
): Promise<void> {
	await deleteDocument({ data: { id, deleteLocalAssets } });
}

export async function openDocumentDirectoryRpc(
	id: number,
): Promise<{ success: boolean; path: string }> {
	return await openDocumentDirectory({ data: { id } });
}

export async function fetchDocumentVersions(
	documentId: number,
): Promise<DocumentVersion[]> {
	try {
		return (await listDocumentVersions({ data: { documentId } })) ?? [];
	} catch (err) {
		console.warn("[editorClient] listDocumentVersions error:", err);
		return [];
	}
}

export async function snapshotVersionRpc(params: {
	documentId: number;
	origin?: DocumentVersionOrigin;
	note?: string;
}): Promise<DocumentVersion> {
	return await snapshotDocumentVersion({ data: params });
}

/** 上传图片/视频，返回可插入文档的 URL（/api/files/...） */
export async function uploadAssetRpc(
	documentId: number,
	file: File,
): Promise<{ url: string; filename: string }> {
	const formData = new FormData();
	formData.append("documentId", String(documentId));
	formData.append("file", file);
	return await uploadDocumentAsset({ data: formData });
}

/** 下载外链图片/视频并转存到当前稿件本地资产目录（免跨域，微信防盗链可破） */
export async function downloadExternalAssetRpc(
	documentId: number,
	url: string,
	referer?: string,
): Promise<{ url: string; filename: string }> {
	return await downloadExternalAssetToDocument({
		data: { documentId, url, referer },
	});
}

import {
	importWebpageToEditor,
	listObsidianNotes,
	type ObsidianNoteItem,
	readObsidianNote,
} from "../../server/functions/editorImports";

export type { ObsidianNoteItem };

/** 导入网页内容 */
export async function importWebpageRpc(url: string): Promise<{
	success: boolean;
	title: string;
	markdown: string;
	error?: string;
}> {
	return await importWebpageToEditor({ data: { url } });
}

/** 获取指定本地 Obsidian 路径下的 Markdown 笔记 */
export async function listObsidianNotesRpc(
	vaultPath: string,
): Promise<{ success: boolean; notes: ObsidianNoteItem[]; error?: string }> {
	return await listObsidianNotes({ data: { vaultPath } });
}

/** 读取指定 Obsidian Markdown 笔记 */
export async function readObsidianNoteRpc(
	vaultPath: string,
	relativePath: string,
): Promise<{
	success: boolean;
	title: string;
	content: string;
	error?: string;
}> {
	return await readObsidianNote({ data: { vaultPath, relativePath } });
}

/** AI bar 文本生成（划词改写/扩写/缩写等） */
export async function generateAiBarTextRpc(
	prompt: string,
	systemHint?: string,
	stylePreset?: string,
): Promise<string> {
	const { text } = await generateAiBarText({
		data: { prompt, systemHint, stylePreset },
	});
	return text;
}

/**
 * 流式请求 AI 改写内容并通过 SSE 实时逐块回调
 */
export async function streamRewriteText(
	params: {
		prompt: string;
		systemHint?: string;
		stylePreset?: string;
		articleTitle?: string;
		fullArticleContext?: string;
		paragraphIndex?: number;
		totalParagraphs?: number;
		precedingText?: string;
		followingText?: string;
	},
	handlers: {
		onChunk: (delta: string, fullText: string) => void;
		onDone: (fullText: string) => void;
		onError?: (error: string) => void;
	},
	signal?: AbortSignal,
): Promise<void> {
	const response = await fetch("/api/editor/rewrite/stream", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify(params),
		signal,
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(text || `HTTP error ${response.status}`);
	}

	if (!response.body) {
		throw new Error("No response body received from stream");
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder("utf-8");
	let buffer = "";
	let fullText = "";

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split("\n");
			buffer = lines.pop() || "";

			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed || trimmed.startsWith(":")) continue;

				if (trimmed.startsWith("data: ")) {
					try {
						const event = JSON.parse(trimmed.slice(6));
						if (event.type === "chunk") {
							fullText = event.fullText;
							handlers.onChunk(event.delta, fullText);
						} else if (event.type === "done") {
							fullText = event.fullText;
							handlers.onDone(fullText);
						} else if (event.type === "error") {
							handlers.onError?.(event.message);
						}
					} catch (e) {
						console.warn(
							"[streamRewriteText] Failed to parse SSE line:",
							trimmed,
							e,
						);
					}
				}
			}
		}

		if (fullText) {
			handlers.onDone(fullText);
		}
	} catch (err: unknown) {
		if (signal?.aborted) return;
		const errMsg = err instanceof Error ? err.message : String(err);
		handlers.onError?.(errMsg);
		throw err;
	}
}
