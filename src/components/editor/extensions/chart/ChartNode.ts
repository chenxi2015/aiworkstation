import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { ChartNodeView } from "./ChartNodeView";

declare module "@tiptap/core" {
	interface Commands<ReturnType> {
		chart: {
			/** 在当前位置插入图表节点 */
			insertChart: (attrs?: { spec?: string; height?: number }) => ReturnType;
		};
	}
}

/**
 * 图表节点（ECharts）：atom 块级节点，内部不可编辑，整块选中/删除。
 * 数据以 JSON 字符串存于 spec attr，HTML 持久化为 <div data-chart data-spec="...">。
 */
export const ChartNode = Node.create({
	name: "chart",
	group: "block",
	atom: true,

	addAttributes() {
		return {
			spec: {
				default: null,
				parseHTML: (element) => element.getAttribute("data-spec"),
				renderHTML: (attributes) =>
					attributes.spec ? { "data-spec": attributes.spec } : {},
			},
			height: {
				default: 320,
				parseHTML: (element) =>
					Number(element.getAttribute("data-height")) || 320,
				renderHTML: (attributes) => ({
					"data-height": String(attributes.height ?? 320),
				}),
			},
		};
	},

	parseHTML() {
		return [{ tag: "div[data-chart]" }];
	},

	renderHTML({ HTMLAttributes }) {
		return [
			"div",
			mergeAttributes(HTMLAttributes, {
				"data-chart": "",
				contenteditable: "false",
			}),
		];
	},

	addCommands() {
		return {
			insertChart:
				(attrs = {}) =>
				({ commands }) =>
					commands.insertContent({ type: this.name, attrs }),
		};
	},

	addNodeView() {
		return ReactNodeViewRenderer(ChartNodeView);
	},
});
