// @vitest-environment happy-dom
import { history, undo, undoDepth } from "@codemirror/commands";
import { EditorState, StateEffect } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { beforeEach, describe, expect, it } from "vitest";
import { markdownAutoPair } from "./markdownAutoPair";
import {
	clearNoteStateCache,
	getCachedNoteState,
	saveCachedNoteState,
} from "./noteStateCache";

function getTestExtensions() {
	return [history(), markdownAutoPair()];
}

describe("noteStateCache & cross-note undo persistence", () => {
	beforeEach(() => {
		clearNoteStateCache();
	});

	it("preserves undo history when navigating away from a note and returning", () => {
		// 1. User opens Note A
		const container1 = document.createElement("div");
		document.body.appendChild(container1);

		const stateA1 = EditorState.create({
			doc: "initial content",
			extensions: getTestExtensions(),
		});

		const viewA1 = new EditorView({
			state: stateA1,
			parent: container1,
		});

		// 2. User edits Note A (adds a wikilink [[My New Note]])
		viewA1.dispatch({
			changes: { from: 15, insert: " [[My New Note]]" },
			userEvent: "input.type",
		});
		expect(viewA1.state.doc.toString()).toBe("initial content [[My New Note]]");
		expect(undoDepth(viewA1.state)).toBeGreaterThan(0);

		// 3. User navigates away to create/view the new note:
		// Save Note A's state into cache before destroying viewA1
		saveCachedNoteState("NoteA.md", viewA1.state, { top: 100, left: 0 });
		viewA1.destroy();
		container1.remove();

		// 4. User navigates back to Note A:
		// A new EditorView instance is mounted
		const container2 = document.createElement("div");
		document.body.appendChild(container2);

		const cached = getCachedNoteState("NoteA.md");
		expect(cached).not.toBeNull();

		if (!cached) throw new Error("Expected cached note state");

		// Reconfigure cached state with fresh extensions for the new component instance
		const stateA2 = cached.state.update({
			effects: StateEffect.reconfigure.of(getTestExtensions()),
		}).state;

		const viewA2 = new EditorView({
			state: stateA2,
			parent: container2,
		});

		// 5. Verify that undo depth is preserved in the new view
		expect(undoDepth(viewA2.state)).toBeGreaterThan(0);

		// 6. User presses Undo (Cmd+Z)
		const undone = undo(viewA2);
		expect(undone).toBe(true);

		// The wikilink addition should be successfully undone!
		expect(viewA2.state.doc.toString()).toBe("initial content");

		viewA2.destroy();
		container2.remove();
	});

	it("ensures each note has isolated undo history that does not leak across notes", () => {
		// 1. Open Note A and add content
		const c1 = document.createElement("div");
		document.body.appendChild(c1);
		const viewA = new EditorView({
			state: EditorState.create({
				doc: "Note A base",
				extensions: getTestExtensions(),
			}),
			parent: c1,
		});
		viewA.dispatch({
			changes: { from: 11, insert: " [[NoteB]]" },
			userEvent: "input.type",
		});
		saveCachedNoteState("NoteA.md", viewA.state);
		viewA.destroy();
		c1.remove();

		// 2. Open Note B and type in Note B
		const c2 = document.createElement("div");
		document.body.appendChild(c2);
		const viewB = new EditorView({
			state: EditorState.create({
				doc: "Note B base",
				extensions: getTestExtensions(),
			}),
			parent: c2,
		});
		viewB.dispatch({
			changes: { from: 11, insert: " - some new text" },
			userEvent: "input.type",
		});
		saveCachedNoteState("NoteB.md", viewB.state);

		// Undo on Note B only undoes Note B's edit
		undo(viewB);
		expect(viewB.state.doc.toString()).toBe("Note B base");
		viewB.destroy();
		c2.remove();

		// 3. Re-open Note A and verify its own undo history is completely intact
		const c3 = document.createElement("div");
		document.body.appendChild(c3);
		const cachedA = getCachedNoteState("NoteA.md");
		expect(cachedA).not.toBeNull();
		if (!cachedA) throw new Error("Expected cached NoteA state");
		const viewA2 = new EditorView({
			state: cachedA.state.update({
				effects: StateEffect.reconfigure.of(getTestExtensions()),
			}).state,
			parent: c3,
		});

		expect(viewA2.state.doc.toString()).toBe("Note A base [[NoteB]]");
		expect(undoDepth(viewA2.state)).toBeGreaterThan(0);

		// Undo on Note A undoes the [[NoteB]] link
		const undone = undo(viewA2);
		expect(undone).toBe(true);
		expect(viewA2.state.doc.toString()).toBe("Note A base");

		viewA2.destroy();
		c3.remove();
	});
});
