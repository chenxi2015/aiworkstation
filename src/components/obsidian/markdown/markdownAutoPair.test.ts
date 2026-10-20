// @vitest-environment happy-dom
import { history, undo } from "@codemirror/commands";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { markdownAutoPair } from "./markdownAutoPair";

function createEditor(
	doc: string,
	selection?: { anchor: number; head: number },
) {
	const state = EditorState.create({
		doc,
		selection: selection
			? EditorSelection.single(selection.anchor, selection.head)
			: undefined,
		extensions: [history(), markdownAutoPair()],
	});

	const parent = document.createElement("div");
	document.body.appendChild(parent);

	const view = new EditorView({
		state,
		parent,
	});

	return {
		view,
		cleanup: () => {
			view.destroy();
			parent.remove();
		},
	};
}

/** Simulate typing input handled by CM6 inputHandler */
function simulateInput(view: EditorView, text: string): boolean {
	const range = view.state.selection.main;
	const inputHandlers = view.state.facet(EditorView.inputHandler);
	const defaultInsert = () =>
		view.state.update({
			changes: { from: range.from, to: range.to, insert: text },
			userEvent: "input.type",
		});

	for (const handler of inputHandlers) {
		const handled = handler(view, range.from, range.to, text, defaultInsert);
		if (handled) return true;
	}
	return false;
}

describe("markdownAutoPair", () => {
	it("wraps selected text with brackets [text] on single bracket input", () => {
		const { view, cleanup } = createEditor("hello world", {
			anchor: 6,
			head: 11,
		}); // selects "world"

		const handled = simulateInput(view, "[");
		expect(handled).toBe(true);
		expect(view.state.doc.toString()).toBe("hello [world]");

		// Selection should remain on the inner word "world"
		expect(view.state.selection.main.from).toBe(7);
		expect(view.state.selection.main.to).toBe(12);
		expect(
			view.state.sliceDoc(
				view.state.selection.main.from,
				view.state.selection.main.to,
			),
		).toBe("world");

		cleanup();
	});

	it("escalates [text] to [[text]] when typing second bracket on wrapped selection", () => {
		const { view, cleanup } = createEditor("hello world", {
			anchor: 6,
			head: 11,
		}); // selects "world"

		// First [
		simulateInput(view, "[");
		expect(view.state.doc.toString()).toBe("hello [world]");

		// Second [ (escalate to wikilink [[world]])
		const handled = simulateInput(view, "[");
		expect(handled).toBe(true);
		expect(view.state.doc.toString()).toBe("hello [[world]]");

		// Selection stays on inner "world"
		expect(
			view.state.sliceDoc(
				view.state.selection.main.from,
				view.state.selection.main.to,
			),
		).toBe("world");

		cleanup();
	});

	it("escalates asterisk from italic to bold to bold-italic (* -> ** -> ***)", () => {
		const { view, cleanup } = createEditor("hello world", {
			anchor: 6,
			head: 11,
		}); // "world"

		// Level 1: Italic *world*
		simulateInput(view, "*");
		expect(view.state.doc.toString()).toBe("hello *world*");

		// Level 2: Bold **world**
		simulateInput(view, "*");
		expect(view.state.doc.toString()).toBe("hello **world**");

		// Level 3: Bold Italic ***world***
		simulateInput(view, "*");
		expect(view.state.doc.toString()).toBe("hello ***world***");

		cleanup();
	});

	it("wraps selection with highlight ==text== on double equal sign", () => {
		const { view, cleanup } = createEditor("important notes", {
			anchor: 0,
			head: 9,
		}); // "important"

		// Level 1: =important=
		simulateInput(view, "=");
		expect(view.state.doc.toString()).toBe("=important= notes");

		// Level 2: ==important==
		simulateInput(view, "=");
		expect(view.state.doc.toString()).toBe("==important== notes");

		cleanup();
	});

	it("wraps selection with strikethrough ~~text~~ on double tilde", () => {
		const { view, cleanup } = createEditor("deleted word", {
			anchor: 0,
			head: 7,
		}); // "deleted"

		simulateInput(view, "~");
		expect(view.state.doc.toString()).toBe("~deleted~ word");

		simulateInput(view, "~");
		expect(view.state.doc.toString()).toBe("~~deleted~~ word");

		cleanup();
	});

	it("wraps selection with math $$text$$ on dollar signs", () => {
		const { view, cleanup } = createEditor("E = mc^2", { anchor: 0, head: 8 });

		simulateInput(view, "$");
		expect(view.state.doc.toString()).toBe("$E = mc^2$");

		simulateInput(view, "$");
		expect(view.state.doc.toString()).toBe("$$E = mc^2$$");

		cleanup();
	});

	it("wraps selection with inline code `text`", () => {
		const { view, cleanup } = createEditor("const x = 1;", {
			anchor: 0,
			head: 12,
		});

		simulateInput(view, "`");
		expect(view.state.doc.toString()).toBe("`const x = 1;`");

		cleanup();
	});

	it("directly wraps with [[text]] when receiving direct [[ multi-character input", () => {
		const { view, cleanup } = createEditor("quick note", {
			anchor: 6,
			head: 10,
		}); // "note"

		simulateInput(view, "[[");
		expect(view.state.doc.toString()).toBe("quick [[note]]");
		expect(
			view.state.sliceDoc(
				view.state.selection.main.from,
				view.state.selection.main.to,
			),
		).toBe("note");

		cleanup();
	});

	it("wraps with common brackets and Chinese punctuation", () => {
		const { view, cleanup } = createEditor("book title", {
			anchor: 5,
			head: 10,
		}); // "title"

		simulateInput(view, "《");
		expect(view.state.doc.toString()).toBe("book 《title》");

		cleanup();
	});

	it("auto-pairs empty caret typing [[ into [[]] with cursor inside", () => {
		const { view, cleanup } = createEditor("[", { anchor: 1, head: 1 });

		// Type second [ at caret
		const handled = simulateInput(view, "[");
		expect(handled).toBe(true);
		expect(view.state.doc.toString()).toBe("[[]]");
		// Cursor should be right in the middle (pos 2)
		expect(view.state.selection.main.from).toBe(2);
		expect(view.state.selection.main.to).toBe(2);

		cleanup();
	});

	it("wraps selection when user types closing bracket ']' as well", () => {
		const { view, cleanup } = createEditor("target text", {
			anchor: 0,
			head: 6,
		}); // "target"

		simulateInput(view, "]");
		expect(view.state.doc.toString()).toBe("[target] text");

		cleanup();
	});

	it("supports undoing wrap operation back to original text in a single step", () => {
		const { view, cleanup } = createEditor("preserve me", {
			anchor: 0,
			head: 8,
		}); // "preserve"

		simulateInput(view, "[");
		expect(view.state.doc.toString()).toBe("[preserve] me");

		// Execute Cmd+Z / undo
		undo(view);
		expect(view.state.doc.toString()).toBe("preserve me");

		cleanup();
	});
});
