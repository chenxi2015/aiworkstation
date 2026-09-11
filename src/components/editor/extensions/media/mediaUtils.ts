import { createContext } from "react";

/** Context for passing editor document ID to media node views */
export const EditorMediaContext = createContext<{ docId: number }>({
	docId: 0,
});

/**
 * Determine if a URL points to an external media resource (not local or self-hosted)
 */
export function isExternalMedia(url?: string | null): boolean {
	if (!url) return false;
	const trimmed = url.trim();
	if (
		trimmed.startsWith("data:") ||
		trimmed.startsWith("blob:") ||
		trimmed.startsWith("/")
	) {
		return false;
	}

	if (/^https?:\/\//i.test(trimmed)) {
		try {
			const parsed = new URL(trimmed);
			if (typeof window !== "undefined") {
				if (
					parsed.origin === window.location.origin &&
					parsed.pathname.startsWith("/api/files/")
				) {
					return false;
				}
			}
			return true;
		} catch {
			return true;
		}
	}
	return false;
}

/**
 * Download local media file to browser's download folder
 */
export function downloadFileToDisk(url: string, filename: string): void {
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	a.target = "_blank";
	a.rel = "noopener noreferrer";
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
}
