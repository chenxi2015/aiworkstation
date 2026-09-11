// Media extensions and utilities

// CodeBlock extensions and utilities
export {
	CodeBlockComponent,
	CodeBlockWithHighlight,
	getCodeBlockDecorations,
	lowlight,
	SUPPORTED_LANGUAGES,
} from "./CodeBlockWithHighlight";
// Custom image extension
export { CustomImage } from "./CustomImage";
export {
	downloadFileToDisk,
	EditorMediaContext,
	isExternalMedia,
	MediaNodeView,
} from "./MediaNodeView";
export { MediaActionToolbar } from "./media/MediaActionToolbar";
export { MediaReplacePopover } from "./media/MediaReplacePopover";
export { useMediaOperations } from "./media/useMediaOperations";
export { useMediaToolbarPosition } from "./media/useMediaToolbarPosition";

// Slash command extension
export { type SlashCommandOptions, SlashCommands } from "./slashCommand";

// Suggestion diff extensions
export {
	SuggestionDelete,
	SuggestionDiffExtensions,
	SuggestionInsert,
	type SuggestionMarkAttributes,
} from "./suggestionDiff";
