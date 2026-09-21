import { Maximize2 } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { fetchVaultNote } from "../../../services/api/obsidianClient";
import { markdownToHtml } from "../../editor/markdown";

interface CacheEntry<T> {
	data: T;
	at: number;
}

const previewCache = new Map<string, CacheEntry<string>>();
const PREVIEW_CACHE_TTL_MS = 30_000;

export function clearWikilinkPreviewCache(relPath?: string): void {
	if (relPath) {
		previewCache.delete(relPath);
	} else {
		previewCache.clear();
	}
}

function stripFrontmatter(content: string): string {
	return content.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
}

function renderWikilinksInHtml(html: string): string {
	return html.replace(/\[\[([^\]\n]+)\]\]/g, (_m, inner: string) => {
		const [rawTarget, alias] = inner.split("|");
		const target = (rawTarget ?? "").split("#")[0]?.trim() ?? "";
		const label = alias?.trim() || target;
		return `<span class="cm-live-wikilink" data-target="${target}" style="cursor: pointer; text-decoration: underline; text-underline-offset: 2px;">${label}</span>`;
	});
}

export interface WikilinkPreviewCardProps {
	target: string;
	relPath: string | null;
	x: number;
	y: number;
	onFollow: (target: string) => void;
	onMouseEnter: () => void;
	onMouseLeave: () => void;
}

/**
 * Obsidian-style wikilink hover preview card component:
 * - Displays complete markdown content of the target note
 * - Shows sticky header with title and expand button to navigate into the note
 * - Handles internal wikilink clicks inside preview content
 */
export function WikilinkPreviewCard({
	target,
	relPath,
	x,
	y,
	onFollow,
	onMouseEnter,
	onMouseLeave,
}: WikilinkPreviewCardProps) {
	const [loading, setLoading] = useState(Boolean(relPath));
	const [html, setHtml] = useState("");

	useEffect(() => {
		if (!relPath) return;

		let cancelled = false;
		const cached = previewCache.get(relPath);
		if (cached && Date.now() - cached.at < PREVIEW_CACHE_TTL_MS) {
			setHtml(cached.data);
			setLoading(false);
			return;
		}

		setLoading(true);
		void fetchVaultNote(relPath).then(({ note }) => {
			if (cancelled) return;
			const body = stripFrontmatter(note?.content ?? "");
			const rawHtml = note ? markdownToHtml(body) : "";
			const parsed = renderWikilinksInHtml(rawHtml);
			previewCache.set(relPath, { data: parsed, at: Date.now() });
			setHtml(parsed);
			setLoading(false);
		});

		return () => {
			cancelled = true;
		};
	}, [relPath]);

	// Position calculation with viewport boundaries flip
	const cardWidth = 440;
	const cardHeight = 360;
	const left = Math.min(
		Math.max(8, x - 20),
		window.innerWidth - cardWidth - 16,
	);
	let top = y + 14;
	if (top + cardHeight > window.innerHeight - 16 && y - cardHeight - 16 > 0) {
		top = y - cardHeight - 10;
	}

	const handleBodyClick = (e: React.MouseEvent) => {
		const targetEl = (e.target as HTMLElement | null)?.closest?.(
			"[data-target]",
		);
		const hitTarget = targetEl?.getAttribute("data-target");
		if (hitTarget) {
			e.preventDefault();
			onFollow(hitTarget);
		}
	};

	const handleCardMouseLeave = (e: React.MouseEvent) => {
		const toEl = e.relatedTarget as HTMLElement | null;
		if (toEl?.closest?.(".cm-live-wikilink")) {
			return;
		}
		onMouseLeave();
	};

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: tooltip card mouse bridge tracking
		<div
			className="cm-live-hover-preview"
			style={{ left: `${left}px`, top: `${top}px` }}
			onMouseEnter={onMouseEnter}
			onMouseLeave={handleCardMouseLeave}
		>
			{relPath ? (
				<>
					<div className="cm-live-hover-preview-header">
						<div className="cm-live-hover-preview-title">{target}</div>
						<button
							type="button"
							className="cm-live-hover-preview-expand-btn"
							title="进入笔记"
							aria-label="进入笔记"
							onClick={(e) => {
								e.stopPropagation();
								e.preventDefault();
								onFollow(target);
							}}
						>
							<Maximize2 size={14} />
						</button>
					</div>
					{/* biome-ignore lint/a11y/useKeyWithClickEvents: internal wikilinks clicking support */}
					{/* biome-ignore lint/a11y/noStaticElementInteractions: internal wikilinks clicking support */}
					<div className="cm-live-hover-preview-body" onClick={handleBodyClick}>
						{loading ? (
							"加载中…"
						) : html ? (
							/* biome-ignore lint/security/noDangerouslySetInnerHtml: preview rendered markdown HTML */
							<div dangerouslySetInnerHTML={{ __html: html }} />
						) : (
							<i>（空笔记）</i>
						)}
					</div>
				</>
			) : (
				<button
					type="button"
					className="cm-live-hover-preview-empty"
					onClick={(e) => {
						e.preventDefault();
						onFollow(target);
					}}
				>
					笔记「{target}」尚未创建，点击新建
				</button>
			)}
		</div>
	);
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
	rootInstance?.render(<WikilinkPreviewCard {...props} />);
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
