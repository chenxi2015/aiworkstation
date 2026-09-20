import { syntaxTree } from "@codemirror/language";
import {
	type EditorState,
	type Extension,
	RangeSetBuilder,
	StateField,
	type Transaction,
} from "@codemirror/state";
import {
	Decoration,
	type DecorationSet,
	EditorView,
	WidgetType,
} from "@codemirror/view";
import { markdownToHtml } from "../../editor/markdown";

/**
 * Obsidian 风格 Live Preview：
 * 底层仍是纯 Markdown 文本（零失真），通过装饰层实时渲染样式；
 * 光标进入的区域临时露出语法标记符，离开即隐藏。
 * 表格等复杂块级结构在光标离开时整体渲染为 HTML（marked，复用创作模块链路）。
 */

export interface LivePreviewOptions {
	/** 当前笔记相对 Vault 根目录路径（用于解析相对路径图片等资源） */
	noteRelPath?: string;
}

/** 判断选区是否与区间相交（相交则显示语法标记 / 原文） */
function selectionTouches(
	state: EditorState,
	from: number,
	to: number,
): boolean {
	return state.selection.ranges.some((r) => from <= r.to && to >= r.from);
}

const HIDE = Decoration.replace({});
const HEADING_CLASSES: Record<string, string> = {
	ATXHeading1: "cm-live-h1",
	ATXHeading2: "cm-live-h2",
	ATXHeading3: "cm-live-h3",
	ATXHeading4: "cm-live-h4",
	ATXHeading5: "cm-live-h5",
	ATXHeading6: "cm-live-h6",
	SetextHeading1: "cm-live-h1",
	SetextHeading2: "cm-live-h2",
};

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

type MediaKind = "image" | "video" | "audio";

function mediaKindOf(src: string): MediaKind | null {
	const ext = src.split(/[?#]/)[0].split(".").pop()?.toLowerCase() ?? "";
	if (IMAGE_EXTS.has(ext)) return "image";
	if (VIDEO_EXTS.has(ext)) return "video";
	if (AUDIO_EXTS.has(ext)) return "audio";
	return null;
}

/** 把笔记内的资源引用解析为可加载的 URL */
function resolveAssetUrl(src: string, noteRelPath?: string): string {
	if (/^(https?:|data:|blob:|\/api\/)/i.test(src)) return src;
	const cleaned = src.replace(/^\.\//, "").replace(/^\//, "");
	const noteDir = noteRelPath?.includes("/")
		? noteRelPath.split("/").slice(0, -1).join("/")
		: "";
	const pathParam = noteDir ? `${noteDir}/${cleaned}` : cleaned;
	const basename = cleaned.split("/").pop() ?? cleaned;
	return `/api/obsidian/asset?path=${encodeURIComponent(pathParam)}&name=${encodeURIComponent(basename)}`;
}

/** 表格块：整体渲染为 HTML（marked GFM），光标进入时还原为 Markdown 原文 */
class TableWidget extends WidgetType {
	constructor(readonly source: string) {
		super();
	}
	override eq(other: TableWidget) {
		return other.source === this.source;
	}
	toDOM() {
		const div = document.createElement("div");
		div.className = "cm-live-table";
		div.innerHTML = markdownToHtml(this.source);
		return div;
	}
}

const ICON_SVGS = {
	zoom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M11 8v6"/><path d="M8 11h6"/></svg>',
	code: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
	download:
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
};

/** 图片放大查看浮层（点击 / Esc 关闭） */
function openMediaLightbox(src: string, kind: MediaKind, alt: string) {
	const overlay = document.createElement("div");
	overlay.className = "cm-media-lightbox";
	// 挂在 body 上（编辑器主题样式 scoped 不到这里），用内联样式
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

/** 下载资源（fetch → blob 强制下载，跨域失败时降级新开标签页） */
async function downloadMedia(src: string, filename: string) {
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
		window.open(src, "_blank");
	}
}

/** 图片 / 音视频资源 widget（悬停显示操作条：放大 / 查看源码 / 下载） */
class MediaWidget extends WidgetType {
	constructor(
		readonly src: string,
		readonly alt: string,
		readonly kind: MediaKind,
	) {
		super();
	}
	override eq(other: MediaWidget) {
		return other.src === this.src && other.alt === this.alt;
	}
	override toDOM(view: EditorView) {
		const wrap = document.createElement("span");
		wrap.className = `cm-live-media cm-live-media-${this.kind}`;
		let el: HTMLElement;
		if (this.kind === "video") {
			const video = document.createElement("video");
			video.controls = true;
			video.src = this.src;
			el = video;
		} else if (this.kind === "audio") {
			const audio = document.createElement("audio");
			audio.controls = true;
			audio.src = this.src;
			el = audio;
		} else {
			const img = document.createElement("img");
			img.src = this.src;
			img.alt = this.alt;
			img.loading = "lazy";
			img.onerror = () => {
				wrap.textContent = `🖼 无法加载：${this.alt || this.src}`;
				wrap.classList.add("cm-live-media-error");
				toolbar.remove();
			};
			el = img;
		}
		wrap.appendChild(el);

		// 悬停操作条
		const toolbar = document.createElement("span");
		toolbar.className = "cm-live-media-toolbar";
		const filename =
			this.alt ||
			decodeURIComponent(this.src.split("?")[0].split("/").pop() ?? "image");
		const actions: Array<{
			icon: keyof typeof ICON_SVGS;
			title: string;
			onClick: () => void;
		}> = [];
		if (this.kind !== "audio") {
			actions.push({
				icon: "zoom",
				title: "放大查看",
				onClick: () => openMediaLightbox(this.src, this.kind, this.alt),
			});
		}
		actions.push({
			icon: "code",
			title: "查看源码",
			onClick: () => {
				// 把光标移进该资源区间，Live Preview 会自动还原为 Markdown 原文
				const pos = view.posAtDOM(wrap);
				view.dispatch({
					selection: { anchor: pos },
					scrollIntoView: true,
				});
				view.focus();
			},
		});
		actions.push({
			icon: "download",
			title: "下载",
			onClick: () => void downloadMedia(this.src, filename),
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
		// 事件交给 widget 自己处理（按钮点击不移动编辑器光标）
		return true;
	}
}

interface HiddenMark {
	from: number;
	to: number;
}

interface DecoItem {
	from: number;
	to: number;
	deco: Decoration;
}

function buildDecorations(
	state: EditorState,
	options: LivePreviewOptions,
): DecorationSet {
	const marks: HiddenMark[] = [];
	const lineItems: { pos: number; deco: Decoration }[] = [];
	const inlineItems: DecoItem[] = [];
	// 块级整体替换区间（表格等），其中的其他装饰一律跳过
	const replacedBlocks: { from: number; to: number }[] = [];
	const blockWidgets: DecoItem[] = [];

	const inReplacedBlock = (from: number, to: number) =>
		replacedBlocks.some((b) => from < b.to && to > b.from);

	const pushLine = (from: number, to: number, cls: string) => {
		const startLine = state.doc.lineAt(from);
		const endLine = state.doc.lineAt(
			Math.max(from, Math.min(to, state.doc.length)),
		);
		for (let line = startLine.number; line <= endLine.number; line++) {
			lineItems.push({
				pos: state.doc.line(line).from,
				deco: Decoration.line({ class: cls }),
			});
		}
	};

	// ── 1. 语法树遍历（标准 Markdown / GFM） ────────────────────
	for (const range of [{ from: 0, to: state.doc.length }]) {
		syntaxTree(state).iterate({
			from: range.from,
			to: range.to,
			enter(node) {
				if (inReplacedBlock(node.from, node.to)) return false;
				const { from, to, name } = node;

				// GFM 表格：光标不在表格内时整体渲染为 HTML 表格
				if (name === "Table") {
					if (!selectionTouches(state, from, to)) {
						const fromLine = state.doc.lineAt(from);
						const toLine = state.doc.lineAt(to);
						const blockFrom = fromLine.from;
						const blockTo = toLine.to;
						replacedBlocks.push({ from: blockFrom, to: blockTo });
						blockWidgets.push({
							from: blockFrom,
							to: blockTo,
							deco: Decoration.replace({
								widget: new TableWidget(
									state.doc.sliceString(blockFrom, blockTo),
								),
								block: true,
							}),
						});
					}
					return false;
				}

				// 标题行样式
				const headingClass = HEADING_CLASSES[name];
				if (headingClass) {
					pushLine(from, to, headingClass);
					return;
				}

				switch (name) {
					case "HeaderMark": {
						// # 号：光标不在该标题行时隐藏
						const line = state.doc.lineAt(from);
						if (!selectionTouches(state, line.from, line.to)) {
							marks.push({ from, to });
						}
						return;
					}
					case "StrongEmphasis":
						inlineItems.push({
							from,
							to,
							deco: Decoration.mark({ class: "cm-live-strong" }),
						});
						return;
					case "Emphasis":
						inlineItems.push({
							from,
							to,
							deco: Decoration.mark({ class: "cm-live-em" }),
						});
						return;
					case "Strikethrough":
						inlineItems.push({
							from,
							to,
							deco: Decoration.mark({ class: "cm-live-strike" }),
						});
						return;
					case "EmphasisMark":
					case "CodeMark":
						if (!selectionTouches(state, from, to)) marks.push({ from, to });
						return;
					case "InlineCode":
						inlineItems.push({
							from,
							to,
							deco: Decoration.mark({ class: "cm-live-incode" }),
						});
						return;
					case "FencedCode":
					case "CodeBlock":
						pushLine(from, to, "cm-live-codeblock");
						return;
					case "Blockquote":
						pushLine(from, to, "cm-live-quote");
						return;
					case "Link":
					case "Autolink":
						inlineItems.push({
							from,
							to,
							deco: Decoration.mark({ class: "cm-live-link" }),
						});
						return;
					case "LinkMark":
					case "LinkTitle":
						if (!selectionTouches(state, from, to)) marks.push({ from, to });
						return;
					case "URL":
						// 链接目标：光标不在链接内时隐藏 URL
						if (!selectionTouches(state, from, to)) marks.push({ from, to });
						return;
					case "Image": {
						// ![alt](src)：光标不在时渲染为实际资源
						if (selectionTouches(state, from, to)) return;
						const raw = state.doc.sliceString(from, to);
						const m = raw.match(/^!\[(.*?)\]\(([^)\s]+)[^)]*\)$/s);
						if (!m) return;
						const kind = mediaKindOf(m[2]);
						if (!kind) return;
						replacedBlocks.push({ from, to });
						blockWidgets.push({
							from,
							to,
							deco: Decoration.replace({
								widget: new MediaWidget(
									resolveAssetUrl(m[2], options.noteRelPath),
									m[1],
									kind,
								),
							}),
						});
						return;
					}
					case "HorizontalRule":
						pushLine(from, to, "cm-live-hr");
						return;
					default:
						return;
				}
			},
		});
	}

	// ── 2. Frontmatter 灰化（文档开头 --- 包裹的 YAML 块） ──────
	if (state.doc.line(1).text.trim() === "---") {
		for (let lineNo = 2; lineNo <= Math.min(state.doc.lines, 200); lineNo++) {
			const line = state.doc.lineAt(lineNo);
			pushLine(line.from, line.from, "cm-live-frontmatter");
			if (line.text.trim() === "---") break;
		}
		pushLine(0, 0, "cm-live-frontmatter");
	}

	// ── 3. Obsidian 方言正则补层：[[双链]] / ==高亮== / #标签 / ![[嵌入]] ──
	// 先收集代码区间，避免代码内容里的 # 被误染
	const codeRanges: { from: number; to: number }[] = [];
	for (const item of inlineItems) {
		if (item.deco.spec?.class === "cm-live-incode")
			codeRanges.push({ from: item.from, to: item.to });
	}
	const inCode = (from: number, to: number) =>
		codeRanges.some((c) => from < c.to && to > c.from);

	const DIALECT_PATTERNS: Array<{ regex: RegExp; cls: string }> = [
		{ regex: /(?<!!)\[\[[^\]\n]+\]\]/g, cls: "cm-live-wikilink" },
		{ regex: /==[^=\n]+==/g, cls: "cm-live-highlight" },
		{
			regex: /(?<![\w\p{L}\p{N}/])#[\p{L}\p{N}_][\p{L}\p{N}_/-]*/gu,
			cls: "cm-live-tag",
		},
	];

	for (const range of [{ from: 0, to: state.doc.length }]) {
		const text = state.doc.sliceString(range.from, range.to);

		// ![[嵌入资源]]：图片/音视频渲染为实际资源
		const embedRe = /!\[\[([^\]\n]+)\]\]/g;
		let embedMatch = embedRe.exec(text);
		while (embedMatch) {
			const from = range.from + embedMatch.index;
			const raw = embedMatch[0];
			const inner = embedMatch[1] ?? "";
			const to = from + raw.length;
			embedMatch = embedRe.exec(text);
			if (inCode(from, to) || inReplacedBlock(from, to)) continue;
			if (selectionTouches(state, from, to)) continue;
			// 去掉 |尺寸 与 #锚点 后缀
			const target = inner.split("|")[0]?.split("#")[0]?.trim() ?? "";
			const kind = mediaKindOf(target);
			if (!target || !kind) continue;
			replacedBlocks.push({ from, to });
			blockWidgets.push({
				from,
				to,
				deco: Decoration.replace({
					widget: new MediaWidget(
						resolveAssetUrl(target, options.noteRelPath),
						target,
						kind,
					),
				}),
			});
		}

		for (const { regex, cls } of DIALECT_PATTERNS) {
			regex.lastIndex = 0;
			let match = regex.exec(text);
			while (match) {
				const from = range.from + match.index;
				const to = from + match[0].length;
				if (!inCode(from, to) && !inReplacedBlock(from, to)) {
					inlineItems.push({ from, to, deco: Decoration.mark({ class: cls }) });
				}
				match = regex.exec(text);
			}
		}
	}

	// ── 合并所有装饰（RangeSetBuilder 要求按位置有序，先排序） ────
	const builder = new RangeSetBuilder<Decoration>();
	const all: DecoItem[] = [
		...lineItems.map((l) => ({ from: l.pos, to: l.pos, deco: l.deco })),
		...inlineItems,
		...blockWidgets,
		...marks.map((m) => ({ from: m.from, to: m.to, deco: HIDE })),
	];
	all.sort(
		(a, b) =>
			a.from - b.from ||
			a.to - b.to ||
			(a.deco.startSide ?? 0) - (b.deco.startSide ?? 0),
	);
	for (const item of all) {
		if (item.to < item.from) continue;
		builder.add(item.from, item.to, item.deco);
	}
	return builder.finish();
}

/**
 * 块级装饰（表格 widget 等）会影响垂直布局，
 * CM6 要求这类装饰必须由 StateField 提供（不能走 ViewPlugin）。
 */
function createLivePreviewField(options: LivePreviewOptions) {
	return StateField.define<DecorationSet>({
		create: (state) => buildDecorations(state, options),
		update: (_deco: DecorationSet, tr: Transaction) =>
			buildDecorations(tr.state, options),
		provide: (field) => EditorView.decorations.from(field),
	});
}

export function livePreview(options: LivePreviewOptions = {}): Extension {
	return createLivePreviewField(options);
}
