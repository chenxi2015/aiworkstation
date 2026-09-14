import { Extension, type JSONContent, mergeAttributes, Node } from "@tiptap/core";
import {
	BackgroundColor,
	Color,
	FontFamily,
	FontSize,
	LineHeight,
	TextStyle,
} from "@tiptap/extension-text-style";

/**
 * 网页浮层样式清理。
 * 从网页复制内容时，常把 modal 遮罩、吸顶栏等 position:fixed/sticky 元素
 * 连同 inset、z-index、backdrop-filter、transform 一起带进文档，
 * 编辑器会把它们渲染成盖满全屏的"假弹窗"。
 * 仅当元素声明了 fixed/sticky 定位时才剥除整组浮层属性；
 * 普通排版样式（含 position:relative/absolute 的装饰层）原样保留。
 */
const OVERLAY_POSITION_VALUES = /^(fixed|sticky)$/i;
const POSITION_DEPENDENT_PROPS = new Set([
	"inset",
	"inset-block",
	"inset-inline",
	"inset-block-start",
	"inset-block-end",
	"inset-inline-start",
	"inset-inline-end",
	"top",
	"right",
	"bottom",
	"left",
	"z-index",
	"transform",
	"transform-origin",
	"backdrop-filter",
	"-webkit-backdrop-filter",
]);

export function sanitizeOverlayStyle(style: string | null): string | null {
	if (!style) return style;
	const declarations = style
		.split(";")
		.map((d) => d.trim())
		.filter(Boolean);
	const hasOverlayPosition = declarations.some((declaration) => {
		const colonIndex = declaration.indexOf(":");
		if (colonIndex === -1) return false;
		return (
			declaration.slice(0, colonIndex).trim().toLowerCase() === "position" &&
			OVERLAY_POSITION_VALUES.test(declaration.slice(colonIndex + 1).trim())
		);
	});
	if (!hasOverlayPosition) return style;
	const kept = declarations.filter((declaration) => {
		const colonIndex = declaration.indexOf(":");
		if (colonIndex === -1) return true;
		const property = declaration.slice(0, colonIndex).trim().toLowerCase();
		if (property === "position") return false;
		return !POSITION_DEPENDENT_PROPS.has(property);
	});
	return kept.join("; ") || null;
}

/** 递归清理 TipTap JSON 文档中所有节点/标记的浮层样式（加载历史文档时兜底） */
export function sanitizeOverlayStylesInDoc<T extends JSONContent>(node: T): T {
	const clone = { ...node };
	if (typeof clone.attrs?.style === "string") {
		clone.attrs = {
			...clone.attrs,
			style: sanitizeOverlayStyle(clone.attrs.style),
		};
	}
	if (clone.marks) {
		clone.marks = clone.marks.map((mark) =>
			typeof mark.attrs?.style === "string"
				? {
						...mark,
						attrs: { ...mark.attrs, style: sanitizeOverlayStyle(mark.attrs.style) },
					}
				: mark,
		);
	}
	if (clone.content) {
		clone.content = clone.content.map((child) =>
			sanitizeOverlayStylesInDoc(child),
		);
	}
	return clone;
}

/**
 * 通用带样式的块级容器。
 * 公众号排版等场景常用 <section>/<div> 包裹卡片、引言、署名等结构，
 * 默认 TipTap schema 没有对应节点，解析时会丢弃包裹层及其内联样式。
 */
export const StyledContainer = Node.create({
	name: "styledContainer",
	group: "block",
	content: "block+",
	defining: true,
	addAttributes() {
		return {
			style: {
				default: null,
				parseHTML: (element) =>
					sanitizeOverlayStyle(element.getAttribute("style")),
				renderHTML: (attributes) =>
					attributes.style ? { style: attributes.style } : {},
			},
			htmlTag: {
				default: "section",
				parseHTML: (element) => element.tagName.toLowerCase(),
				rendered: false,
			},
		};
	},
	parseHTML() {
		return [{ tag: "section" }, { tag: "div" }];
	},
	renderHTML({ node, HTMLAttributes }) {
		const tag = node.attrs.htmlTag === "div" ? "div" : "section";
		return [tag, mergeAttributes(HTMLAttributes), 0];
	},
});

const styleAttribute = {
	style: {
		default: null,
		parseHTML: (element: HTMLElement) =>
			sanitizeOverlayStyle(element.getAttribute("style")),
		renderHTML: (attributes: Record<string, unknown>) =>
			attributes.style ? { style: attributes.style } : {},
	},
};

/**
 * 为内置节点/标记补充 style 全局属性，
 * 让 <p style="...">、<strong style="..."> 等内联样式在解析与渲染时不被丢弃。
 */
export const InlineStyleAttributes = Extension.create({
	name: "inlineStyleAttributes",
	addGlobalAttributes() {
		return [
			{
				types: [
					"paragraph",
					"heading",
					"blockquote",
					"bulletList",
					"orderedList",
					"listItem",
					"taskList",
					"taskItem",
					"tableCell",
					"tableHeader",
					"horizontalRule",
					"image",
					"video",
				],
				attributes: styleAttribute,
			},
			{
				types: ["bold", "italic", "underline", "strike", "code", "link"],
				attributes: styleAttribute,
			},
		];
	},
});

/**
 * 个性化富文本样式保留扩展集合：
 * 内联 TextStyle 标记（颜色/字号/字体/背景色/行高）+ 块级 style 属性 + section/div 容器。
 * 凡是涉及 HTML <-> TipTap JSON 转换或编辑器渲染的地方都应挂载，
 * 否则 AI 生成的带样式 HTML 会在解析时被剥离样式。
 */
export function getStylePreservationExtensions() {
	return [
		TextStyle,
		Color,
		FontSize,
		FontFamily,
		BackgroundColor,
		LineHeight,
		StyledContainer,
		InlineStyleAttributes,
	];
}
