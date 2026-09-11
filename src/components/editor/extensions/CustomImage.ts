import Image from "@tiptap/extension-image";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { MediaNodeView } from "./MediaNodeView";

/**
 * Custom Image node with atom selection and React NodeView
 */
export const CustomImage = Image.extend({
	// Atom block node allows click selection and Backspace/Delete removal
	atom: true,
	draggable: true,

	addAttributes() {
		return {
			...this.parent?.(),
			originalSrc: {
				default: null,
			},
		};
	},

	addNodeView() {
		return ReactNodeViewRenderer(MediaNodeView);
	},
});
