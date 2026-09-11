import type { Editor } from "@tiptap/react";
import { type RefObject, useRef, useState } from "react";
import { uploadAssetRpc } from "../../../services/api/editorClient";
import {
	fileToDataUrl,
	getMediaFileKind,
	updateMediaSrc,
} from "../utils/clipboard";

export interface UseEditorMediaUploadOptions {
	docId: number;
	editorRef: RefObject<Editor | null>;
}

/**
 * Hook for managing media upload, batch insertion, and file input triggers
 */
export function useEditorMediaUpload({
	docId,
	editorRef,
}: UseEditorMediaUploadOptions) {
	const [uploading, setUploading] = useState(false);
	const imageInputRef = useRef<HTMLInputElement>(null);
	const videoInputRef = useRef<HTMLInputElement>(null);

	const insertAndUploadMediaFiles = async (files: File[]) => {
		const currentEditor = editorRef.current;
		if (!currentEditor || files.length === 0) return;

		// 1. Filter and prepare media items with preview blob URLs
		const mediaItems: Array<{
			file: File;
			kind: "image" | "video";
			tempUrl: string;
		}> = [];

		for (const file of files) {
			const kind = getMediaFileKind(file);
			if (kind) {
				mediaItems.push({
					file,
					kind,
					tempUrl: URL.createObjectURL(file),
				});
			}
		}

		if (mediaItems.length === 0) return;

		// 2. Batch insert preview nodes into editor in one transaction
		const nodesToInsert = mediaItems.map((item) => ({
			type: item.kind,
			attrs: { src: item.tempUrl },
		}));

		currentEditor.chain().focus().insertContent(nodesToInsert).run();

		// 3. Concurrently upload assets and update their URLs
		setUploading(true);
		try {
			await Promise.allSettled(
				mediaItems.map(async ({ file, tempUrl }) => {
					try {
						const { url } = await uploadAssetRpc(docId, file);
						updateMediaSrc(currentEditor, tempUrl, url);
					} catch (err) {
						console.error(
							"Failed to upload asset, falling back to base64:",
							err,
						);
						try {
							const base64 = await fileToDataUrl(file);
							updateMediaSrc(currentEditor, tempUrl, base64);
						} catch (fallbackErr) {
							console.error(
								"Failed to convert to base64 fallback:",
								fallbackErr,
							);
						}
					} finally {
						// Delay revoking blob URL so DOM smoothly switches to uploaded asset
						setTimeout(() => URL.revokeObjectURL(tempUrl), 10000);
					}
				}),
			);
		} finally {
			setUploading(false);
		}
	};

	const triggerSelectLocalImages = () => {
		imageInputRef.current?.click();
	};

	const triggerSelectLocalVideos = () => {
		videoInputRef.current?.click();
	};

	const promptInsertImageUrl = () => {
		const currentEditor = editorRef.current;
		if (!currentEditor) return;
		const url = window.prompt("图片 URL");
		if (url?.trim()) {
			currentEditor.chain().focus().setImage({ src: url.trim() }).run();
		}
	};

	const promptInsertVideoUrl = () => {
		const currentEditor = editorRef.current;
		if (!currentEditor) return;
		const url = window.prompt("视频 URL");
		if (url?.trim()) {
			currentEditor
				.chain()
				.focus()
				.insertContent({ type: "video", attrs: { src: url.trim() } })
				.run();
		}
	};

	return {
		uploading,
		imageInputRef,
		videoInputRef,
		insertAndUploadMediaFiles,
		triggerSelectLocalImages,
		triggerSelectLocalVideos,
		promptInsertImageUrl,
		promptInsertVideoUrl,
	};
}
