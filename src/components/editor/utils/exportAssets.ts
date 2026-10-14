import { zipSync } from "fflate";

export interface AssetBinary {
	bytes: Uint8Array;
	mimeType: string;
	extension: string;
}

const MIME_EXT_MAP: Record<string, string> = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/jpg": "jpg",
	"image/webp": "webp",
	"image/gif": "gif",
	"image/svg+xml": "svg",
	"image/avif": "avif",
};

/** Convert Uint8Array to base64 string safely */
export function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	const len = bytes.byteLength;
	const chunkSize = 0x8000;
	for (let i = 0; i < len; i += chunkSize) {
		binary += String.fromCharCode(
			...bytes.subarray(i, Math.min(i + chunkSize, len)),
		);
	}
	return btoa(binary);
}

/** Check if a URL is a local or self-hosted media resource */
export function isLocalOrDataUrl(url?: string | null): boolean {
	if (!url) return false;
	const trimmed = url.trim();
	if (
		trimmed.startsWith("/") ||
		trimmed.startsWith("./") ||
		trimmed.startsWith("data:") ||
		trimmed.startsWith("blob:")
	) {
		return true;
	}
	if (typeof window !== "undefined" && /^https?:\/\//i.test(trimmed)) {
		try {
			const parsed = new URL(trimmed);
			return (
				parsed.origin === window.location.origin &&
				parsed.pathname.startsWith("/api/files/")
			);
		} catch {
			return false;
		}
	}
	return false;
}

/** Infer file extension from URL or mime type */
function inferExtension(url: string, mimeType: string): string {
	const mapped = MIME_EXT_MAP[mimeType.toLowerCase()];
	if (mapped) return mapped;

	try {
		const cleanUrl = url.split("?")[0].split("#")[0];
		const extMatch = cleanUrl.match(/\.([a-zA-Z0-9]+)$/);
		if (extMatch && extMatch[1].length <= 5) {
			return extMatch[1].toLowerCase();
		}
	} catch {
		// Ignore parsing errors and fallback
	}

	return "png";
}

/** Fetch image data and return as binary with mime info */
export async function fetchImageBinary(
	url: string,
): Promise<AssetBinary | null> {
	if (!url) return null;

	// Handle Data URLs directly
	if (url.startsWith("data:")) {
		try {
			const match = url.match(/^data:([^;]+);base64,(.+)$/);
			if (match) {
				const mimeType = match[1] || "image/png";
				const binaryStr = atob(match[2]);
				const len = binaryStr.length;
				const bytes = new Uint8Array(len);
				for (let i = 0; i < len; i++) {
					bytes[i] = binaryStr.charCodeAt(i);
				}
				return {
					bytes,
					mimeType,
					extension: inferExtension(url, mimeType),
				};
			}
		} catch (err) {
			console.warn("[exportAssets] Failed to parse Data URL:", err);
			return null;
		}
	}

	// Fetch via network / blob / local endpoint
	try {
		const response = await fetch(url);
		if (!response.ok) return null;
		const buffer = await response.arrayBuffer();
		const mimeType = response.headers.get("content-type") || "image/png";
		return {
			bytes: new Uint8Array(buffer),
			mimeType,
			extension: inferExtension(url, mimeType),
		};
	} catch (err) {
		console.warn(`[exportAssets] Failed to fetch image ${url}:`, err);
		return null;
	}
}

/**
 * Replace all images in HTML with inline Base64 data URLs.
 * Used for Word (.docx) embedding and PDF snapshot preparation.
 */
export async function inlineHtmlImages(htmlContent: string): Promise<string> {
	if (!htmlContent.includes("<img")) return htmlContent;

	const parser = new DOMParser();
	const docDom = parser.parseFromString(
		`<div>${htmlContent}</div>`,
		"text/html",
	);
	const container = docDom.body.firstElementChild;
	if (!container) return htmlContent;

	const imgElements = Array.from(container.querySelectorAll("img"));
	if (imgElements.length === 0) return htmlContent;

	await Promise.all(
		imgElements.map(async (img) => {
			const src = img.getAttribute("src");
			if (!src || src.startsWith("data:")) return;

			const binary = await fetchImageBinary(src);
			if (binary) {
				const base64 = bytesToBase64(binary.bytes);
				img.setAttribute("src", `data:${binary.mimeType};base64,${base64}`);
			}
		}),
	);

	return container.innerHTML;
}

export interface ExportBundleResult {
	isZip: boolean;
	blob: Blob;
	filename: string;
}

/**
 * Package Markdown with its local images into a zip file,
 * or return single .md blob if no local images present.
 */
export async function packageMarkdownWithAssets(
	title: string,
	markdown: string,
): Promise<ExportBundleResult> {
	const safeTitle = (title || "未命名文档").replace(/[\\/:*?"<>|]/g, "_");

	// Find markdown image links: ![alt](url)
	const mdImageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
	const htmlImgRegex = /<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi;

	const targetUrls = new Set<string>();
	let match: RegExpExecArray | null;

	// biome-ignore lint/suspicious/noAssignInExpressions: regex exec iteration
	while ((match = mdImageRegex.exec(markdown)) !== null) {
		const url = match[2].trim();
		if (isLocalOrDataUrl(url)) {
			targetUrls.add(url);
		}
	}

	// biome-ignore lint/suspicious/noAssignInExpressions: regex exec iteration
	while ((match = htmlImgRegex.exec(markdown)) !== null) {
		const url = match[1].trim();
		if (isLocalOrDataUrl(url)) {
			targetUrls.add(url);
		}
	}

	if (targetUrls.size === 0) {
		return {
			isZip: false,
			blob: new Blob([markdown], { type: "text/markdown;charset=utf-8" }),
			filename: `${safeTitle}.md`,
		};
	}

	const files: Record<string, Uint8Array> = {};
	const urlToRelPath = new Map<string, string>();
	let imageIndex = 1;

	for (const url of targetUrls) {
		const binary = await fetchImageBinary(url);
		if (binary) {
			const imageName = `image_${String(imageIndex).padStart(2, "0")}.${binary.extension}`;
			files[`images/${imageName}`] = binary.bytes;
			urlToRelPath.set(url, `./images/${imageName}`);
			imageIndex++;
		}
	}

	// Replace image paths in markdown with relative zip paths
	let updatedMarkdown = markdown;
	for (const [url, relPath] of urlToRelPath.entries()) {
		updatedMarkdown = updatedMarkdown.split(url).join(relPath);
	}

	files[`${safeTitle}.md`] = new TextEncoder().encode(updatedMarkdown);
	const zipped = zipSync(files, { level: 6 });

	return {
		isZip: true,
		blob: new Blob([zipped], { type: "application/zip" }),
		filename: `${safeTitle}.zip`,
	};
}

/**
 * Package HTML document with its local images into a zip file,
 * or return single .html blob if no local images present.
 */
export async function packageHtmlWithAssets(
	title: string,
	htmlContent: string,
): Promise<ExportBundleResult> {
	const safeTitle = (title || "未命名文档").replace(/[\\/:*?"<>|]/g, "_");
	const isFullDoc = /<!doctype\s+html|<html[\s>]/i.test(htmlContent);

	const parser = new DOMParser();
	const docDom = parser.parseFromString(
		isFullDoc ? htmlContent : `<div>${htmlContent}</div>`,
		"text/html",
	);

	const root = isFullDoc
		? docDom.documentElement
		: docDom.body.firstElementChild;
	if (!root) {
		return {
			isZip: false,
			blob: new Blob([htmlContent], { type: "text/html;charset=utf-8" }),
			filename: `${safeTitle}.html`,
		};
	}

	const imgElements = Array.from(root.querySelectorAll("img"));
	const targetImages = imgElements.filter((img) =>
		isLocalOrDataUrl(img.getAttribute("src")),
	);

	if (targetImages.length === 0) {
		return {
			isZip: false,
			blob: new Blob([htmlContent], { type: "text/html;charset=utf-8" }),
			filename: `${safeTitle}.html`,
		};
	}

	const files: Record<string, Uint8Array> = {};
	const urlToRelPath = new Map<string, string>();
	let imageIndex = 1;

	for (const img of targetImages) {
		const src = img.getAttribute("src") || "";
		if (!src) continue;

		if (!urlToRelPath.has(src)) {
			const binary = await fetchImageBinary(src);
			if (binary) {
				const imageName = `image_${String(imageIndex).padStart(2, "0")}.${binary.extension}`;
				files[`images/${imageName}`] = binary.bytes;
				urlToRelPath.set(src, `./images/${imageName}`);
				imageIndex++;
			}
		}

		const newPath = urlToRelPath.get(src);
		if (newPath) {
			img.setAttribute("src", newPath);
		}
	}

	const serializedHtml = isFullDoc
		? `<!DOCTYPE html>\n${docDom.documentElement.outerHTML}`
		: (root as HTMLElement).innerHTML;

	files[`${safeTitle}.html`] = new TextEncoder().encode(serializedHtml);
	const zipped = zipSync(files, { level: 6 });

	return {
		isZip: true,
		blob: new Blob([zipped], { type: "application/zip" }),
		filename: `${safeTitle}.zip`,
	};
}
