import type { Editor } from "@tiptap/core";
import { history, undo, undoDepth } from "@tiptap/pm/history";
import { Schema } from "@tiptap/pm/model";
import { EditorState, type Transaction } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";
import { resetEditorHistory } from "./editorHistory";

describe("resetEditorHistory", () => {
	const schema = new Schema({
		nodes: {
			doc: { content: "block+" },
			paragraph: { group: "block", content: "text*" },
			text: { inline: true },
		},
	});

	function createMockEditor(enableHistory = true) {
		let state = EditorState.create({
			schema,
			plugins: enableHistory ? [history()] : [],
		});

		const view = {
			dispatch: (tr: Transaction) => {
				state = state.apply(tr);
			},
		};

		const editor = {
			get state() {
				return state;
			},
			get view() {
				return view;
			},
			isDestroyed: false,
		};

		return {
			editor,
			getState: () => state,
			applyTr: (tr: Transaction) => {
				state = state.apply(tr);
			},
		};
	}

	it("returns false gracefully when editor is null or destroyed", () => {
		expect(resetEditorHistory(null)).toBe(false);
		expect(resetEditorHistory(undefined)).toBe(false);
		expect(resetEditorHistory({ isDestroyed: true } as unknown as Editor)).toBe(
			false,
		);
	});

	it("returns false if history plugin is not installed in the editor", () => {
		const { editor } = createMockEditor(false);
		expect(resetEditorHistory(editor as unknown as Editor)).toBe(false);
	});

	it("resets undo/redo stacks back to empty and prevents undoing previous content", () => {
		const { editor, getState, applyTr } = createMockEditor(true);

		// 1. Simulate document 1 edits
		applyTr(getState().tr.insertText("Article 1 content"));
		expect(undoDepth(getState())).toBeGreaterThan(0);
		expect(undo(getState())).toBe(true);

		// 2. Simulate document switch: replace content with Document 2
		const newDoc = schema.node("doc", null, [
			schema.node("paragraph", null, [schema.text("Article 2 content")]),
		]);
		applyTr(
			getState().tr.replaceWith(0, getState().doc.content.size, newDoc.content),
		);

		// 3. Reset history upon document switch
		const result = resetEditorHistory(editor as unknown as Editor);
		expect(result).toBe(true);

		// 4. Verify history is cleared: undoDepth is 0 and undo is disabled
		expect(undoDepth(getState())).toBe(0);
		expect(undo(getState())).toBe(false);
		expect(getState().doc.textContent).toBe("Article 2 content");

		// 5. Subsequent edits in Article 2 work normally
		applyTr(getState().tr.insertText(" - new edit"));
		expect(getState().doc.textContent).toBe("Article 2 content - new edit");
		expect(undoDepth(getState())).toBe(1);

		// 6. Undo can rollback the edit made in Article 2, but cannot rollback to Article 1
		let couldUndo = undo(getState(), (tr) => applyTr(tr));
		expect(couldUndo).toBe(true);
		expect(getState().doc.textContent).toBe("Article 2 content");
		expect(undoDepth(getState())).toBe(0);

		// 7. Further undo attempts are blocked
		couldUndo = undo(getState(), (tr) => applyTr(tr));
		expect(couldUndo).toBe(false);
		expect(getState().doc.textContent).toBe("Article 2 content");
	});
});