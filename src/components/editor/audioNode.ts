import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { AudioNodeView } from "./extensions/AudioNodeView";

/**
 * 自定义音频节点（docs/studio-materials-link-plan.md：素材库音频插入编辑器）。
 * atom 节点：不可编辑内部，整块选中/删除。
 */
export const AudioNode = Node.create({
	name: "audio",
	group: "block",
	atom: true,

	addAttributes() {
		return {
			src: { default: null },
			title: { default: null },
		};
	},

	parseHTML() {
		return [{ tag: "audio[src]" }];
	},

	renderHTML({ HTMLAttributes }) {
		return [
			"audio",
			mergeAttributes(HTMLAttributes, {
				controls: "true",
				preload: "metadata",
				contenteditable: "false",
			}),
		];
	},

	addNodeView() {
		return ReactNodeViewRenderer(AudioNodeView);
	},
});
