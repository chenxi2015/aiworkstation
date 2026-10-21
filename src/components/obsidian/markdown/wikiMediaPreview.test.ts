// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, undo } from "@codemirror/commands";
import { EditorView, keymap } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { livePreview } from "./livePreview";

describe("Wiki media embed live preview interactions", () => {
	it("preserves adjacent images during Enter, Backspace, and Undo operations", () => {
		const doc = `![[face.png]]\n![[system_design.png]]\n人物基本信息`;
		const container = document.createElement("div");
		document.body.appendChild(container);

		const view = new EditorView({
			state: EditorState.create({
				doc,
				selection: { anchor: 13 },
				extensions: [
					markdown(),
					history(),
					keymap.of(defaultKeymap),
					livePreview(),
				],
			}),
			parent: container,
		});

		expect(container.querySelectorAll(".cm-live-media").length).toBe(2);

		// 1. Enter (insert newline between two images)
		view.dispatch({
			changes: { from: 13, to: 13, insert: "\n" },
			selection: { anchor: 14 },
		});
		expect(view.state.doc.toString()).toBe(
			`![[face.png]]\n\n![[system_design.png]]\n人物基本信息`,
		);
		expect(container.querySelectorAll(".cm-live-media").length).toBe(2);

		// 2. Backspace (delete empty line)
		view.dispatch({
			changes: { from: 13, to: 14 },
			selection: { anchor: 13 },
		});
		expect(view.state.doc.toString()).toBe(
			`![[face.png]]\n![[system_design.png]]\n人物基本信息`,
		);
		expect(container.querySelectorAll(".cm-live-media").length).toBe(2);

		// 3. Undo backspace
		undo(view);
		expect(container.querySelectorAll(".cm-live-media").length).toBe(2);

		// 4. Undo enter
		undo(view);
		expect(container.querySelectorAll(".cm-live-media").length).toBe(2);
	});
});

