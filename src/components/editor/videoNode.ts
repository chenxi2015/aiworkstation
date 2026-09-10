import { mergeAttributes, Node } from "@tiptap/core";

/**
 * 自定义视频节点（docs/editor-plan.md 第四节：视频以自定义节点嵌入）。
 * atom 节点：不可编辑内部，整块选中/删除。
 */
export const VideoNode = Node.create({
	name: "video",
	group: "block",
	atom: true,

	addAttributes() {
		return {
			src: { default: null },
			poster: { default: null },
		};
	},

	parseHTML() {
		return [{ tag: "video[src]" }];
	},

	renderHTML({ HTMLAttributes }) {
		return [
			"video",
			mergeAttributes(HTMLAttributes, {
				controls: "true",
				preload: "metadata",
				referrerpolicy: "no-referrer",
			}),
		];
	},
});
