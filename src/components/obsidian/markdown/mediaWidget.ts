import { StateEffect, StateField } from "@codemirror/state";
import { EditorView, WidgetType } from "@codemirror/view";
import { toast } from "@heroui/react";
import { uploadVaultAsset } from "../../../services/api/obsidianClient";

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

function mediaDownloadName(src: string): string {
	const ext = src.split(/[?#]/)[0].split(".").pop()?.toLowerCase() ?? "";
	return `image_${Date.now()}.${/^[a-z0-9]{2,5}$/.test(ext) ? ext : "png"}`;
}

export async function downloadMedia(src: string) {
	const filename = mediaDownloadName(src);
	try {
		const res = await fetch(src);
		if (!res.ok) throw new Error(String(res.status));
		const blob = await res.blob();
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = filename;
		a.click();
		setTimeout(() => URL.revokeObjectURL(url), 5000);
	} catch {
		const a = document.createElement("a");
		a.href = src;
		a.download = filename;
		a.rel = "noopener";
		a.click();
	}
}

export interface MediaWidgetProps {
	src: string;
	alt: string;
	kind: MediaKind;
	from: number;
	to: number;
	syntax: "markdown" | "wiki";
	noteRelPath?: string;
	onPreviewImage?: (data: { src: string; alt: string }) => void;
}

/** Media widget for images, videos, and audio (with hover toolbar) */
export class MediaWidget extends WidgetType {
	constructor(readonly props: MediaWidgetProps) {
		super();
	}

	override eq(other: MediaWidget) {
		return (
			other.props.src === this.props.src &&
			other.props.alt === this.props.alt &&
			other.props.from === this.props.from &&
			other.props.to === this.props.to
		);
	}

	private pickReplacement(view: EditorView) {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = "image/*";
		input.addEventListener("change", () => {
			const file = input.files?.[0];
			if (!file) return;
			void (async () => {
				try {
					const { name } = await uploadVaultAsset(file, this.props.noteRelPath);
					const insert =
						this.props.syntax === "wiki"
							? `![[${name}]]`
							: `![${this.props.alt}](${name})`;
					view.dispatch({
						changes: { from: this.props.from, to: this.props.to, insert },
					});
					toast.success("已替换图片");
				} catch (err) {
					toast.danger(err instanceof Error ? err.message : "图片上传失败");
				}
			})();
		});
		input.click();
	}

	override toDOM(view: EditorView) {
		const { src, alt, kind } = this.props;
		const wrap = document.createElement("span");
		wrap.className = `cm-live-media cm-live-media-${kind}`;
		let el: HTMLElement;
		if (kind === "video") {
			const video = document.createElement("video");
			video.controls = true;
			video.src = src;
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
			img.onerror = () => {
				wrap.textContent = `🖼 无法加载：${alt || src}`;
				wrap.classList.add("cm-live-media-error");
				toolbar.remove();
			};
			el = img;
		}
		wrap.appendChild(el);

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
			onClick: () => void downloadMedia(src),
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

	override ignoreEvent() {
		return true;
	}
}
