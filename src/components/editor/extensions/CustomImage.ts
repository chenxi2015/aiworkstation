import Image from "@tiptap/extension-image";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { MediaNodeView } from "./MediaNodeView";

/**
 * Custom Image node with atom selection and React NodeView
 * Supports WeChat and lazy-loading data-src attributes out-of-the-box
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

	parseHTML() {
		return [
			{
				tag: "img",
				getAttrs: (dom) => {
					if (!(dom instanceof HTMLElement)) return false;
					const rawSrc = dom.getAttribute("src")?.trim() || "";
					const dataSrc = (
						dom.getAttribute("data-src") ||
						dom.getAttribute("data-original") ||
						dom.getAttribute("data-actualsrc")
					)?.trim();

					// Resolve real image URL: prioritize data-src when src is an empty/placeholder SVG
					let realSrc = rawSrc;
					if (
						!realSrc ||
						realSrc.startsWith("data:image/svg") ||
						realSrc.startsWith("data:image/gif")
					) {
						realSrc = dataSrc || "";
					}

					// Discard empty or purely invalid placeholder images
					if (!realSrc) {
						return false;
					}

					return {
						src: realSrc,
						alt: dom.getAttribute("alt") || "",
						title: dom.getAttribute("title") || "",
						originalSrc: dataSrc || realSrc,
					};
				},
			},
		];
	},

	addNodeView() {
		return ReactNodeViewRenderer(MediaNodeView);
	},
});
