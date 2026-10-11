import type { Editor } from "@tiptap/react";
import { type RefObject, useRef, useState } from "react";
import {
	importMaterialAssetToDocumentRpc,
	uploadAssetRpc,
} from "../../../services/api/editorClient";
import { getAssetMediaUrl, isVideoAsset } from "../../creator/materials/utils";
import type { PickedMaterialAsset } from "../components/MaterialPickerDialog";
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

	const insertImageFromUrl = (url: string) => {
		const currentEditor = editorRef.current;
		if (!currentEditor) return;
		const src = url.trim();
		if (!src) return;
		currentEditor.chain().focus().setImage({ src }).run();
	};

	const insertVideoFromUrl = (url: string) => {
		const currentEditor = editorRef.current;
		if (!currentEditor) return;
		const src = url.trim();
		if (!src) return;
		currentEditor
			.chain()
			.focus()
			.insertContent({ type: "video", attrs: { src } })
			.run();
	};

	/**
	 * 从素材库插入媒体资产（docs/studio-materials-link-plan.md）：
	 * 先用 /api/assets/stream 预览 URL 立即插入节点（无需等待复制），
	 * 再并发复制资产到当前文档目录并替换为 /api/files/ 自有 URL（文档自包含）；
	 * 复制失败的项保留素材流 URL 并告警，不阻塞其他项。
	 */
	const insertMaterialAssets = async (items: PickedMaterialAsset[]) => {
		const currentEditor = editorRef.current;
		if (!currentEditor || items.length === 0) return;

		const mediaItems = items.map(({ asset, materialTitle }) => {
			const nodeType =
				asset.kind === "audio"
					? "audio"
					: asset.kind === "image"
						? "image"
						: isVideoAsset(asset)
							? "video"
							: null;
			return nodeType
				? {
						asset,
						nodeType,
						tempUrl: getAssetMediaUrl(asset),
						title: asset.filename || materialTitle,
					}
				: null;
		});
		const validItems = mediaItems.filter(
			(item): item is NonNullable<typeof item> => item !== null,
		);
		if (validItems.length === 0) return;

		// 1. 批量插入节点（src 先指向素材流，立即可见可播）
		const nodesToInsert = validItems.map(({ nodeType, tempUrl, title }) => ({
			type: nodeType,
			attrs: nodeType === "audio" ? { src: tempUrl, title } : { src: tempUrl },
		}));
		currentEditor.chain().focus().insertContent(nodesToInsert).run();

		// 2. 并发复制资产到文档目录，成功后替换为文档自有 URL
		setUploading(true);
		try {
			await Promise.allSettled(
				validItems.map(async ({ asset, tempUrl }) => {
					try {
						const { url } = await importMaterialAssetToDocumentRpc(
							docId,
							asset.id,
						);
						updateMediaSrc(currentEditor, tempUrl, url);
					} catch (err) {
						console.warn(
							`[insertMaterialAssets] 资产 ${asset.id} 复制到文档失败，保留素材库流地址:`,
							err,
						);
					}
				}),
			);
		} finally {
			setUploading(false);
		}
	};

	return {
		uploading,
		imageInputRef,
		videoInputRef,
		insertAndUploadMediaFiles,
		insertMaterialAssets,
		triggerSelectLocalImages,
		triggerSelectLocalVideos,
		insertImageFromUrl,
		insertVideoFromUrl,
	};
}
