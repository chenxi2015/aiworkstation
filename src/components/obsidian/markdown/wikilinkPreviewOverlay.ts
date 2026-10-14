import React from "react";
import { createRoot, type Root } from "react-dom/client";
import {
	WikilinkPreviewCard,
	type WikilinkPreviewCardProps,
} from "./WikilinkPreviewCard";

interface CacheEntry<T> {
	data: T;
	at: number;
}

const previewCache = new Map<string, CacheEntry<string>>();
const PREVIEW_CACHE_TTL_MS = 30_000;

/** Retrieve cached preview HTML if not expired */
export function getCachedWikilinkPreview(relPath: string): string | null {
	const cached = previewCache.get(relPath);
	if (cached && Date.now() - cached.at < PREVIEW_CACHE_TTL_MS) {
		return cached.data;
	}
	return null;
}

/** Store rendered HTML into preview cache */
export function setCachedWikilinkPreview(relPath: string, html: string): void {
	previewCache.set(relPath, { data: html, at: Date.now() });
}

/** Invalidate preview cache for a specific file or all */
export function clearWikilinkPreviewCache(relPath?: string): void {
	if (relPath) {
		previewCache.delete(relPath);
	} else {
		previewCache.clear();
	}
}

let containerEl: HTMLDivElement | null = null;
let rootInstance: Root | null = null;

/** Mount or update the floating wikilink preview card */
export function mountWikilinkPreview(props: WikilinkPreviewCardProps): void {
	if (!containerEl) {
		containerEl = document.createElement("div");
		containerEl.id = "cm-wikilink-preview-root";
		document.body.appendChild(containerEl);
		rootInstance = createRoot(containerEl);
	}
	rootInstance?.render(React.createElement(WikilinkPreviewCard, props));
}

/** Unmount and clean up floating wikilink preview card */
export function unmountWikilinkPreview(): void {
	if (containerEl) {
		if (rootInstance) {
			rootInstance.unmount();
			rootInstance = null;
		}
		containerEl.remove();
		containerEl = null;
	}
}
