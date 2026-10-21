import { StateEffect, StateField } from "@codemirror/state";
import { type EditorView, WidgetType } from "@codemirror/view";
import { toast } from "@heroui/react";
import { uploadVaultAsset } from "../../../services/api/obsidianClient";
import {
	downloadMedia,
	getMediaDownloadName,
} from "../../../services/mediaDownload";

export { downloadMedia, getMediaDownloadName };

/** Toggle "View Source": track the media range currently showing raw markdown */
export const toggleMediaSource = StateEffect.define<{
	from: number;
	to: number;
} | null>();

export const mediaSourceField = StateField.define<{
	from: number;
	to: number;
} | null>({
	create: () => null,
	update(value, tr) {
		for (const e of tr.effects) {
			if (e.is(toggleMediaSource)) {
				const next = e.value;
				// Clicking the same range toggles off source view
				if (next && value && value.from === next.from && value.to === next.to) {
					return null;
				}
				return next;
			}
		}
		if (value && tr.docChanged) {
			return {
				from: tr.changes.mapPos(value.from),
				to: tr.changes.mapPos(value.to),
			};
		}
		return value;
	},
});

const IMAGE_EXTS = new Set([
	"png",
	"jpg",
	"jpeg",
	"gif",
	"webp",
	"svg",
	"bmp",
	"avif",
]);
const VIDEO_EXTS = new Set(["mp4", "mov", "webm", "mkv", "m4v"]);
const AUDIO_EXTS = new Set(["mp3", "wav", "m4a", "ogg", "flac"]);

export type MediaKind = "image" | "video" | "audio";

export function mediaKindOf(src: string): MediaKind | null {
	const ext = src.split(/[?#]/)[0].split(".").pop()?.toLowerCase() ?? "";
	if (IMAGE_EXTS.has(ext)) return "image";
	if (VIDEO_EXTS.has(ext)) return "video";
	if (AUDIO_EXTS.has(ext)) return "audio";
	return null;
}

/** Resolve vault relative note asset link to playable / readable URL */
export function resolveAssetUrl(src: string, noteRelPath?: string): string {
	if (/^(https?:|data:|blob:|\/api\/)/i.test(src)) return src;
	const cleaned = src.replace(/^\.\//, "").replace(/^\//, "");
	const noteDir = noteRelPath?.includes("/")
		? noteRelPath.split("/").slice(0, -1).join("/")
		: "";
	const pathParam = noteDir ? `${noteDir}/${cleaned}` : cleaned;
	const basename = cleaned.split("/").pop() ?? cleaned;
	return `/api/obsidian/asset?path=${encodeURIComponent(pathParam)}&name=${encodeURIComponent(basename)}`;
}

const ICON_SVGS = {
	zoom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M11 8v6"/><path d="M8 11h6"/></svg>',
	replace:
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7"/><line x1="16" x2="22" y1="5" y2="5"/><line x1="19" x2="19" y1="2" y2="8"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>',
	code: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
	download:
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
};

/** Image / video lightbox modal (close on click / Esc) */
export function openMediaLightbox(src: string, kind: MediaKind, alt: string) {
	const overlay = document.createElement("div");
	overlay.className = "cm-media-lightbox";
	Object.assign(overlay.style, {
		position: "fixed",
		inset: "0",
		zIndex: "9999",
		backgroundColor: "rgb(0 0 0 / 0.75)",
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		cursor: "zoom-out",
		backdropFilter: "blur(4px)",
	});
	const el =
		kind === "video"
			? Object.assign(document.createElement("video"), {
					src,
					controls: true,
					autoplay: true,
				})
			: Object.assign(document.createElement("img"), { src, alt });
	Object.assign(el.style, {
		maxWidth: "92vw",
		maxHeight: "92vh",
		borderRadius: "8px",
		boxShadow: "0 8px 40px rgb(0 0 0 / 0.4)",
	});
	overlay.appendChild(el);
	const close = () => overlay.remove();
	overlay.addEventListener("click", close);
	const onKey = (e: KeyboardEvent) => {
		if (e.key === "Escape") {
			close();
			document.removeEventListener("keydown", onKey);
		}
	};
	document.addEventListener("keydown", onKey);
	document.body.appendChild(overlay);
}

export interface MediaWidgetProps {
	src: string;
	alt: string;
	kind: MediaKind;
	from: number;
	to: number;
	syntax: "markdown" | "wiki";
	width?: number | string;
	noteRelPath?: string;
	onPreviewImage?: (data: { src: string; alt: string }) => void;
}

/** Media widget for images, videos, and audio (with hover toolbar) */
export class MediaWidget extends WidgetType {
	private dom: HTMLElement | null = null;

	constructor(readonly props: MediaWidgetProps) {
		super();
	}

	override eq(other: MediaWidget) {
		return (
			other.props.src === this.props.src &&
			other.props.alt === this.props.alt &&
			other.props.from === this.props.from &&
			other.props.to === this.props.to &&
			other.props.width === this.props.width
		);
	}

	/** Find current accurate range of the media node in document (handles content offsets) */
	private findCurrentRange(
		view: EditorView,
	): { from: number; to: number } | null {
		const doc = view.state.doc;
		// 1. Fast check if props range still points to the same media syntax
		if (this.props.from >= 0 && this.props.to <= doc.length) {
			const textAtRange = doc.sliceString(this.props.from, this.props.to);
			if (
				(this.props.syntax === "wiki" &&
					textAtRange.startsWith("![[") &&
					textAtRange.endsWith("]]")) ||
				(this.props.syntax === "markdown" &&
					textAtRange.startsWith("![") &&
					textAtRange.endsWith(")"))
			) {
				return { from: this.props.from, to: this.props.to };
			}
		}

		if (!this.dom) return null;
		try {
			const pos = view.posAtDOM(this.dom);
			if (typeof pos !== "number" || pos < 0) return null;

			const startScan = Math.max(0, pos - 300);
			const endScan = Math.min(doc.length, pos + 300);
			const snippet = doc.sliceString(startScan, endScan);

			if (this.props.syntax === "wiki") {
				const wikiRegex = /!\[\[([^\]\n]+)\]\]/g;
				let bestMatch: { from: number; to: number } | null = null;
				let minDistance = Infinity;
				for (const m of snippet.matchAll(wikiRegex)) {
					const matchFrom = startScan + m.index;
					const matchTo = matchFrom + m[0].length;
					const dist = Math.abs(pos - matchFrom);
					if (dist < minDistance) {
						minDistance = dist;
						bestMatch = { from: matchFrom, to: matchTo };
					}
				}
				if (bestMatch) return bestMatch;
			} else {
				const mdRegex = /!\[(.*?)\]\((?:<([^>]+)>|([^)]+))\)/g;
				let bestMatch: { from: number; to: number } | null = null;
				let minDistance = Infinity;
				for (const m of snippet.matchAll(mdRegex)) {
					const matchFrom = startScan + m.index;
					const matchTo = matchFrom + m[0].length;
					const dist = Math.abs(pos - matchFrom);
					if (dist < minDistance) {
						minDistance = dist;
						bestMatch = { from: matchFrom, to: matchTo };
					}
				}
				if (bestMatch) return bestMatch;
			}
		} catch {}
		return null;
	}

	/** Persist resized image width to Markdown source */
	private updateMediaWidth(view: EditorView, width: number) {
		const range = this.findCurrentRange(view) ?? {
			from: this.props.from,
			to: this.props.to,
		};
		const currentText = view.state.doc.sliceString(range.from, range.to);

		let insert: string;
		if (this.props.syntax === "wiki") {
			const innerMatch = currentText.match(/!\[\[([^\]\n]+)\]\]/);
			if (innerMatch) {
				const inner = innerMatch[1];
				const target = inner.split("|")[0].trim();
				insert = `![[${target}|${width}]]`;
			} else {
				insert = `![[${this.props.alt || "image"}|${width}]]`;
			}
		} else {
			const mdMatch = currentText.match(/!\[(.*?)\]\(([^)\n]+)\)/);
			if (mdMatch) {
				const rawAlt = mdMatch[1];
				const url = mdMatch[2];
				const cleanAlt = rawAlt.split("|")[0].trim();
				insert = cleanAlt
					? `![${cleanAlt}|${width}](${url})`
					: `![${width}](${url})`;
			} else {
				insert = `![${width}](${this.props.src})`;
			}
		}

		view.dispatch({
			changes: { from: range.from, to: range.to, insert },
		});
	}

	/** Setup interactive corner resizer for dragging to change image size (Top-Left or Bottom-Right) */
	private setupCornerResizer(
		resizer: HTMLElement,
		corner: "tl" | "br",
		targetEl: HTMLElement,
		wrap: HTMLElement,
		view: EditorView,
	) {
		resizer.addEventListener("mousedown", (e) => {
			e.preventDefault();
			e.stopPropagation();

			const startX = e.clientX;
			const startWidth = targetEl.getBoundingClientRect().width;
			const maxAllowedWidth = wrap.parentElement?.clientWidth || 900;
			let lastWidth = startWidth;

			const onMouseMove = (moveEvent: MouseEvent) => {
				const delta =
					corner === "br"
						? moveEvent.clientX - startX
						: startX - moveEvent.clientX;
				const newWidth = Math.round(
					Math.max(100, Math.min(maxAllowedWidth, startWidth + delta)),
				);
				lastWidth = newWidth;
				targetEl.style.width = `${newWidth}px`;
				targetEl.style.maxWidth = "100%";
			};

			const onMouseUp = () => {
				document.removeEventListener("mousemove", onMouseMove);
				document.removeEventListener("mouseup", onMouseUp);
				if (Math.abs(lastWidth - startWidth) > 3) {
					this.updateMediaWidth(view, lastWidth);
				}
				view.focus();
			};

			document.addEventListener("mousemove", onMouseMove);
			document.addEventListener("mouseup", onMouseUp);
		});
	}

	/** Mark this media widget as selected and select it in CodeMirror */
	private selectMedia(view: EditorView) {
		if (!this.dom) return;
		document.querySelectorAll(".cm-live-media-selected").forEach((el) => {
			if (el !== this.dom) el.classList.remove("cm-live-media-selected");
		});
		this.dom.classList.add("cm-live-media-selected");

		const range = this.findCurrentRange(view) ?? {
			from: this.props.from,
			to: this.props.to,
		};
		view.dispatch({
			selection: { anchor: range.from, head: range.to },
		});
		view.focus();
	}

	private pickReplacement(view: EditorView) {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = "image/*";
		input.style.position = "fixed";
		input.style.left = "-9999px";
		input.style.top = "-9999px";
		input.style.opacity = "0";
		document.body.appendChild(input);

		const cleanup = () => {
			input.remove();
		};

		input.addEventListener("change", () => {
			const file = input.files?.[0];
			cleanup();
			if (!file) return;

			void (async () => {
				try {
					const { name } = await uploadVaultAsset(file, this.props.noteRelPath);
					const range = this.findCurrentRange(view) ?? {
						from: this.props.from,
						to: this.props.to,
					};

					let insert: string;
					if (this.props.syntax === "wiki") {
						// Preserve original size and label piping (e.g. |300)
						const currentText = view.state.doc.sliceString(
							range.from,
							range.to,
						);
						const pipeMatch = currentText.match(/\|[^\]]+/);
						const pipeSuffix = pipeMatch ? pipeMatch[0] : "";
						insert = `![[${name}${pipeSuffix}]]`;
					} else {
						// For standard markdown syntax, wrap in <...> if filename contains spaces
						const target = name.includes(" ") ? `<${name}>` : name;
						insert = `![${this.props.alt || file.name}](${target})`;
					}

					view.dispatch({
						changes: { from: range.from, to: range.to, insert },
					});
					toast.success("已替换图片");
				} catch (err) {
					toast.danger(err instanceof Error ? err.message : "图片上传失败");
				}
			})();
		});

		// Directly trigger native file upload dialog
		input.click();
	}

	override toDOM(view: EditorView) {
		const { src, alt, kind, width } = this.props;
		const wrap = document.createElement("span");
		wrap.className = `cm-live-media cm-live-media-${kind}`;
		this.dom = wrap;
		let el: HTMLElement;
		if (kind === "video") {
			const video = document.createElement("video");
			video.controls = true;
			video.src = src;
			if (width) {
				video.style.width =
					typeof width === "number" ? `${width}px` : String(width);
				video.style.maxWidth = "100%";
			}
			el = video;
		} else if (kind === "audio") {
			const audio = document.createElement("audio");
			audio.controls = true;
			audio.src = src;
			el = audio;
		} else {
			const img = document.createElement("img");
			img.src = src;
			img.alt = alt;
			img.loading = "lazy";
			img.draggable = true;
			if (width) {
				img.style.width =
					typeof width === "number" ? `${width}px` : String(width);
				img.style.maxWidth = "100%";
			}
			img.addEventListener("dragstart", (e) => {
				if (e.dataTransfer) {
					e.dataTransfer.setData("text/plain", src);
					e.dataTransfer.setData("text/uri-list", src);
					try {
						e.dataTransfer.setData(
							"application/x-obsidian-image",
							JSON.stringify({
								src,
								alt: alt || "笔记图片",
								relPath: this.props.noteRelPath,
							}),
						);
					} catch {}
					e.dataTransfer.effectAllowed = "copy";
				}
			});
			img.onerror = () => {
				wrap.textContent = `🖼 无法加载：${alt || src}`;
				wrap.classList.add("cm-live-media-error");
				toolbar.remove();
			};
			el = img;
		}
		wrap.appendChild(el);

		// Click to select image node in CodeMirror
		wrap.addEventListener("click", (e) => {
			const target = e.target as HTMLElement;
			if (
				target.closest(".cm-live-media-toolbar") ||
				target.closest(".cm-live-media-resizer")
			) {
				return;
			}
			e.preventDefault();
			e.stopPropagation();
			this.selectMedia(view);
		});

		// Diagonal corner resizers: Top-Left and Bottom-Right for images (with rounded corner icons)
		if (kind === "image") {
			// Top-Left corner resizer with rounded corner icon
			const resizerTl = document.createElement("span");
			resizerTl.className = "cm-live-media-resizer cm-live-media-resizer-tl";
			resizerTl.title = "拖拽调整图片大小";
			resizerTl.innerHTML =
				'<svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor"><path d="M2 9.5V5a3 3 0 0 1 3-3h4.5" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
			wrap.appendChild(resizerTl);
			this.setupCornerResizer(resizerTl, "tl", el, wrap, view);

			// Bottom-Right corner resizer with rounded corner icon
			const resizerBr = document.createElement("span");
			resizerBr.className = "cm-live-media-resizer cm-live-media-resizer-br";
			resizerBr.title = "拖拽调整图片大小";
			resizerBr.innerHTML =
				'<svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor"><path d="M10 2.5V7a3 3 0 0 1-3 3H2.5" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
			wrap.appendChild(resizerBr);
			this.setupCornerResizer(resizerBr, "br", el, wrap, view);
		}

		// Hover toolbar
		const toolbar = document.createElement("span");
		toolbar.className = "cm-live-media-toolbar";
		const actions: Array<{
			icon: keyof typeof ICON_SVGS;
			title: string;
			onClick: () => void;
		}> = [];
		if (kind !== "audio") {
			actions.push({
				icon: "zoom",
				title: "放大查看",
				onClick: () => {
					if (kind === "image" && this.props.onPreviewImage) {
						this.props.onPreviewImage({ src, alt });
					} else {
						openMediaLightbox(src, kind, alt);
					}
				},
			});
		}
		if (kind === "image") {
			actions.push({
				icon: "replace",
				title: "替换图片",
				onClick: () => this.pickReplacement(view),
			});
		}
		actions.push({
			icon: "code",
			title: "查看源码",
			onClick: () => {
				view.dispatch({
					effects: toggleMediaSource.of({
						from: this.props.from,
						to: this.props.to,
					}),
				});
			},
		});
		actions.push({
			icon: "download",
			title: "下载",
			onClick: () => void downloadMedia(src, alt),
		});
		for (const action of actions) {
			const btn = document.createElement("button");
			btn.type = "button";
			btn.className = "cm-live-media-btn";
			btn.title = action.title;
			btn.innerHTML = ICON_SVGS[action.icon];
			btn.addEventListener("click", (e) => {
				e.preventDefault();
				e.stopPropagation();
				action.onClick();
			});
			toolbar.appendChild(btn);
		}
		wrap.appendChild(toolbar);
		return wrap;
	}

	override ignoreEvent(event: Event) {
		const target = event.target as HTMLElement | null;
		// Toolbar buttons and corner resizer handle their own mouse events
		if (
			target?.closest(".cm-live-media-toolbar") ||
			target?.closest(".cm-live-media-resizer")
		) {
			return true;
		}
		if (event.type === "contextmenu") return false;
		return true;
	}
}
