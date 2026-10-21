import { toast } from "@heroui/react";

/**
 * Extract clean, descriptive filename with valid extension from URL or fallback
 */
export function getMediaDownloadName(src: string, alt?: string): string {
	// 1. If it's an obsidian asset API link: /api/obsidian/asset?path=...&name=...
	if (src.includes("/api/obsidian/asset")) {
		try {
			const parsed = new URL(src, window.location.origin);
			const nameParam = parsed.searchParams.get("name");
			if (nameParam) return nameParam;
			const pathParam = parsed.searchParams.get("path");
			if (pathParam) {
				const base = pathParam.split("/").pop();
				if (base) return base;
			}
		} catch {}
	}

	// 2. Parse from general URL pathname
	try {
		const parsed = new URL(src, window.location.origin);
		const rawBase = parsed.pathname.split("/").pop() ?? "";
		const cleanBase = decodeURIComponent(rawBase.split("?")[0].split("#")[0]);
		const ext = cleanBase.split(".").pop()?.toLowerCase() ?? "";
		if (/^[a-z0-9]{2,5}$/.test(ext)) {
			return cleanBase;
		}
	} catch {}

	// 3. Fallback with alt or timestamp
	const cleanAlt = (alt || "").replace(/[\\/:*?"<>|]/g, "_").trim();
	const ext = src.split(/[?#]/)[0].split(".").pop()?.toLowerCase() ?? "";
	const safeExt = /^[a-z0-9]{2,5}$/.test(ext) ? ext : "png";
	return cleanAlt ? `${cleanAlt}.${safeExt}` : `image_${Date.now()}.${safeExt}`;
}

/**
 * Universally download a media resource (local or remote).
 * Handles CORS and anti-hotlinking by falling back to backend proxy, never navigates current window.
 */
export async function downloadMedia(src: string, alt?: string): Promise<void> {
	const filename = getMediaDownloadName(src, alt);
	const isExternal = /^https?:\/\//i.test(src);

	// For local or same-origin assets: direct fetch & blob download
	if (!isExternal) {
		try {
			const res = await fetch(src);
			if (!res.ok) throw new Error(String(res.status));
			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			a.remove();
			setTimeout(() => URL.revokeObjectURL(url), 5000);
			toast.success("已开始下载");
			return;
		} catch (err) {
			console.warn("Direct asset fetch failed:", err);
		}
	}

	// For external media: use backend proxy download endpoint to bypass CORS & anti-hotlinking
	try {
		const proxyUrl = `/api/obsidian/asset?url=${encodeURIComponent(src)}&download=1&filename=${encodeURIComponent(filename)}`;
		const res = await fetch(proxyUrl);
		if (res.ok) {
			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			a.remove();
			setTimeout(() => URL.revokeObjectURL(url), 5000);
			toast.success("已开始下载");
			return;
		}
	} catch (err) {
		console.warn("Proxy download failed:", err);
	}

	// Safe fallback: open in new tab (never navigate in the current window!)
	window.open(src, "_blank", "noopener,noreferrer");
}

