import { type ChangeEvent, type FormEvent, useRef, useState } from "react";
import {
	downloadExternalAssetRpc,
	uploadAssetRpc,
} from "../../../../services/api/editorClient";
import { downloadFileToDisk, isExternalMedia } from "./mediaUtils";

interface UseMediaOperationsOptions {
	src: string;
	originalSrc: string;
	isVideo: boolean;
	docId: number;
	updateAttributes: (attrs: Record<string, unknown>) => void;
}

/**
 * Hook for media operations: persistence, re-download, local download backup, and asset replacement
 */
export function useMediaOperations({
	src,
	originalSrc,
	isVideo,
	docId,
	updateAttributes,
}: UseMediaOperationsOptions) {
	const isExternal = isExternalMedia(src);

	const [downloading, setDownloading] = useState(false);
	const [downloadSuccess, setDownloadSuccess] = useState(false);
	const [showReplaceModal, setShowReplaceModal] = useState(false);
	const [replaceUrlInput, setReplaceUrlInput] = useState("");
	const [uploading, setUploading] = useState(false);
	const [uploadError, setUploadError] = useState<string | null>(null);
	const [mediaLoadError, setMediaLoadError] = useState(false);

	const fileInputRef = useRef<HTMLInputElement>(null);

	// Primary download action handler
	const handleDownloadAction = async (e: React.MouseEvent) => {
		e.stopPropagation();
		if (downloading) return;

		// Case 1: External media -> Download and persist to local document directory
		if (isExternal) {
			if (!src) return;
			if (!docId) {
				window.alert("缺少稿件 ID，无法转存到本地目录");
				return;
			}
			setDownloading(true);
			try {
				const { url: localUrl } = await downloadExternalAssetRpc(docId, src);
				// Update src to local URL and preserve original external URL
				updateAttributes({
					src: localUrl,
					originalSrc: originalSrc || src,
				});
				setDownloadSuccess(true);
				setMediaLoadError(false);
				setTimeout(() => setDownloadSuccess(false), 2500);
			} catch (err) {
				console.error("Failed to download external asset to document:", err);
				window.alert(
					err instanceof Error
						? `转存失败: ${err.message}`
						: "转存到本地稿件目录失败",
				);
			} finally {
				setDownloading(false);
			}
			return;
		}

		// Case 2: Local media with original external URL recorded -> Re-fetch from original source
		if (originalSrc && isExternalMedia(originalSrc)) {
			if (!docId) {
				window.alert("缺少稿件 ID，无法重新下载");
				return;
			}
			setDownloading(true);
			try {
				const { url: localUrl } = await downloadExternalAssetRpc(
					docId,
					originalSrc,
				);
				updateAttributes({ src: localUrl });
				setDownloadSuccess(true);
				setMediaLoadError(false);
				setTimeout(() => setDownloadSuccess(false), 2500);
			} catch (err) {
				console.error("Failed to re-download from original URL:", err);
				window.alert(
					err instanceof Error
						? `重新拉取失败: ${err.message}`
						: "从原外链重新拉取失败",
				);
			} finally {
				setDownloading(false);
			}
			return;
		}

		// Case 3: Standard local media -> Download to computer disk as backup
		let filename = "";
		try {
			filename =
				new URL(src, window.location.href).pathname.split("/").pop() || "";
		} catch {
			// Ignore URL parse error
		}
		if (!filename) {
			filename = `${isVideo ? "video" : "image"}-${Date.now()}.${isVideo ? "mp4" : "png"}`;
		}
		downloadFileToDisk(src, filename);
		setDownloadSuccess(true);
		setTimeout(() => setDownloadSuccess(false), 2000);
	};

	// Open replace popup
	const handleOpenReplace = (e: React.MouseEvent) => {
		e.stopPropagation();
		setShowReplaceModal((prev) => !prev);
		setReplaceUrlInput("");
		setUploadError(null);
	};

	// Replace with new URL
	const handleConfirmUrlReplace = (e: FormEvent) => {
		e.preventDefault();
		e.stopPropagation();
		if (!replaceUrlInput.trim()) return;
		const nextUrl = replaceUrlInput.trim();
		updateAttributes({
			src: nextUrl,
			originalSrc: isExternalMedia(nextUrl) ? nextUrl : null,
		});
		setShowReplaceModal(false);
		setReplaceUrlInput("");
		setMediaLoadError(false);
	};

	// Revert to original external URL
	const handleRestoreOriginalSrc = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (!originalSrc) return;
		updateAttributes({ src: originalSrc });
		setShowReplaceModal(false);
		setMediaLoadError(false);
	};

	// Replace with local file upload
	const handleFileSelected = async (e: ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		setUploading(true);
		setUploadError(null);
		try {
			if (!docId) {
				throw new Error("缺少文档 ID，无法上传替换");
			}
			const { url } = await uploadAssetRpc(docId, file);
			updateAttributes({ src: url });
			setShowReplaceModal(false);
			setMediaLoadError(false);
		} catch (err) {
			console.error("Failed to replace media:", err);
			setUploadError(err instanceof Error ? err.message : "上传失败");
		} finally {
			setUploading(false);
			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
		}
	};

	// Determine button label and tooltip
	const downloadButtonText = downloading
		? isExternal
			? "转存中..."
			: "拉取中..."
		: downloadSuccess
			? isExternal
				? "已转存本地"
				: "已重新拉取"
			: isExternal
				? "下载"
				: originalSrc
					? "重新拉取"
					: "下载备份";

	const downloadTooltip = isExternal
		? "下载并转存到当前稿件所在的本地目录"
		: originalSrc
			? "本地文件被删或损坏时，点击重新从网络原链接拉取转存"
			: "下载当前媒体文件到电脑本地磁盘备份";

	return {
		isExternal,
		downloading,
		downloadSuccess,
		showReplaceModal,
		setShowReplaceModal,
		replaceUrlInput,
		setReplaceUrlInput,
		uploading,
		uploadError,
		mediaLoadError,
		setMediaLoadError,
		fileInputRef,
		downloadButtonText,
		downloadTooltip,
		handleDownloadAction,
		handleOpenReplace,
		handleConfirmUrlReplace,
		handleRestoreOriginalSrc,
		handleFileSelected,
	};
}
