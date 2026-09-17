import { Extension } from "@tiptap/core";

export interface ChatInlineKeyboardOptions {
	onSend?: () => void;
	/** Return true if an open menu intercepts the Enter key */
	isMenuOpen?: () => boolean;
}

/**
 * Keyboard shortcuts for Chat Inline Input:
 * - Enter: Sends message unless a suggestion menu is currently open.
 * - Shift-Enter: Inserts a soft break (new line).
 */
export const ChatInlineKeyboard = Extension.create<ChatInlineKeyboardOptions>({
	name: "chatInlineKeyboard",

	addOptions() {
		return {
			onSend: undefined,
			isMenuOpen: () => false,
		};
	},

	addKeyboardShortcuts() {
		return {
			Enter: () => {
				if (this.options.isMenuOpen?.()) {
					// Delegate Enter key to candidate selection menu
					return false;
				}
				if (this.options.onSend) {
					this.options.onSend();
					return true;
				}
				return false;
			},
			"Shift-Enter": ({ editor }) => {
				return editor.commands.setHardBreak();
			},
		};
	},
});
