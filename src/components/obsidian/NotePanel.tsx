import type { ObsidianNoteApi } from "./types";
import { MediaPanel } from "./panels/MediaPanel";
import { UnsupportedFilePanel } from "./panels/UnsupportedFilePanel";
import { TextNotePanel } from "./panels/note/TextNotePanel";
import { getVaultFileCategory } from "./utils/vaultFileUtils";

export interface NotePanelProps {
	relPath: string;
	onMutated: () => void;
	onRenamed: (newRelPath: string) => void;
	onDeleted: () => void;
	/** Register active note API handle to page layer (for AI sidebar bridge) */
	onRegisterNoteApi?: (api: ObsidianNoteApi | null) => void;
	/** In-note link jumps to another note (e.g. Dataview query results) */
	onNavigateNote?: (relPath: string) => void;
	/** Callback to create target note if wikilink target is missing */
	onCreateNote?: (name: string) => void;
	/** Navigation history (Obsidian-styled back / forward) */
	canGoBack?: boolean;
	canGoForward?: boolean;
	onBack?: () => void;
	onForward?: () => void;
	/** Click folder in breadcrumb: select and expand folder in tree */
	onSelectFolder?: (dir: string) => void;
}

/**
 * Top-level note panel router: dispatches by file extension to
 * Markdown/Canvas editor, media viewer, or unsupported file placeholder.
 */
export function NotePanel({
	relPath,
	onMutated,
	onDeleted,
	canGoBack,
	canGoForward,
	onBack,
	onForward,
	onSelectFolder,
	...rest
}: NotePanelProps) {
	const category = getVaultFileCategory(relPath);

	if (
		category === "image" ||
		category === "video" ||
		category === "audio" ||
		category === "pdf"
	) {
		return (
			<MediaPanel
				relPath={relPath}
				category={category}
				onMutated={onMutated}
				onDeleted={onDeleted}
				canGoBack={canGoBack}
				canGoForward={canGoForward}
				onBack={onBack}
				onForward={onForward}
				onSelectFolder={onSelectFolder}
			/>
		);
	}

	if (category !== "markdown" && category !== "canvas") {
		return (
			<UnsupportedFilePanel
				relPath={relPath}
				canGoBack={canGoBack}
				canGoForward={canGoForward}
				onBack={onBack}
				onForward={onForward}
			/>
		);
	}

	return (
		<TextNotePanel
			relPath={relPath}
			onMutated={onMutated}
			onDeleted={onDeleted}
			canGoBack={canGoBack}
			canGoForward={canGoForward}
			onBack={onBack}
			onForward={onForward}
			onSelectFolder={onSelectFolder}
			{...rest}
		/>
	);
}
