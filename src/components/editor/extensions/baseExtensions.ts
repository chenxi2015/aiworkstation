import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import TextAlign from "@tiptap/extension-text-align";
import StarterKit from "@tiptap/starter-kit";
import { VideoNode } from "../videoNode";
import { CodeBlockWithHighlight } from "./CodeBlockWithHighlight";
import { CustomImage } from "./CustomImage";
import { ChartNode } from "./chart/ChartNode";
import { getStylePreservationExtensions } from "./stylePreservation";
import { SuggestionDiffExtensions } from "./suggestionDiff";

/**
 * Returns standard base extensions shared across main editor, preview, and split compare views.
 */
export function getEditorBaseExtensions(options?: { placeholder?: string }) {
	return [
		StarterKit.configure({
			heading: { levels: [1, 2, 3] },
			link: { openOnClick: false },
			codeBlock: false,
		}),
		TextAlign.configure({
			types: ["heading", "paragraph", "image", "video"],
			defaultAlignment: "left",
		}),
		CodeBlockWithHighlight,
		CustomImage.configure({
			// 允许 data: base64 图片通过 HTML 解析，否则刷新加载时会被静默丢弃
			allowBase64: true,
			HTMLAttributes: {
				referrerpolicy: "no-referrer",
			},
		}),
		VideoNode,
		ChartNode,
		Table.configure({
			resizable: true,
			cellMinWidth: 80,
			lastColumnResizable: true,
		}),
		TableRow,
		TableHeader,
		TableCell,
		TaskList.configure({
			HTMLAttributes: {
				class: "task-list",
			},
		}),
		TaskItem.configure({
			nested: true,
			HTMLAttributes: {
				class: "task-list-item",
			},
		}),
		Placeholder.configure({
			placeholder: options?.placeholder ?? "开始创作，输入「/」唤起快捷工具栏…",
		}),
		...getStylePreservationExtensions(),
		...SuggestionDiffExtensions,
	];
}
