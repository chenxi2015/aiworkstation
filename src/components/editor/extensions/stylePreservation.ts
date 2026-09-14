import { Extension, mergeAttributes, Node } from "@tiptap/core";
import {
	BackgroundColor,
	Color,
	FontFamily,
	FontSize,
	LineHeight,
	TextStyle,
} from "@tiptap/extension-text-style";

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
				parseHTML: (element) => element.getAttribute("style"),
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
		parseHTML: (element: HTMLElement) => element.getAttribute("style"),
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
