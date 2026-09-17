import { useAiPanel } from "../../shell/AppShell";
import { EditorMediaContext } from "../extensions/MediaNodeView";
import { SplitCompareHeader } from "./split/SplitCompareHeader";
import { SplitOriginalColumn } from "./split/SplitOriginalColumn";
import { SplitRevisedColumn } from "./split/SplitRevisedColumn";
import type { SplitCompareViewProps } from "./split/types";
import { useSplitCanvas } from "./split/useSplitCanvas";

export type { SplitCompareViewProps };

/**
 * Dual Rich-Text Split View with Diff & Version System:
 * - Top header: Diff / Clean toggle, Save version to DB, Accept & Save as new actions
 * - Left column: Base version view (Clean: read-only rich text, Diff: red deletion highlights)
 * - Right column: Draft practice canvas (Clean: editable rich text with Slash '/' menu, Diff: green insertion highlights)
 * - Version dropdowns in both column headers (loaded from and persisted to SQLite document_versions)
 * - Floating AI dock at bottom right for continuous generation
 */
export function SplitCompareView(props: SplitCompareViewProps) {
	// 右侧完整 AI Agent 面板展开时，浮动 Dock 输入入口退场（简化版对话 → 完整 Agent 二选一）
	const { isCollapsed: isAiPanelCollapsed } = useAiPanel();

	const {
		leftEditor,
		docTitle,
		docId,
		stylePreset,
		instruction,
		modeLabel,
		onAccept,
		onCancel,
		onSaveAsNewDocument,
	} = props;

	const {
		versions,
		leftVersionId,
		setLeftVersionId,
		rightVersionId,
		handleSelectRightVersion,
		leftPreviewEditor,
		rightEditor,
		slashMenu,
		setSlashMenu,
		slashMenuRef,
		diffViewMode,
		setDiffViewMode,
		diffStrings,
		leftWordCount,
		rightWordCount,
		isStreaming,
		isSavingVersion,
		canAccept,
		canSaveAsNew,
		handleAccept,
		handleSaveAsNew,
		handleSaveCurrentVersionToDb,
		selectedMode,
		setSelectedMode,
		customPrompt,
		setCustomPrompt,
		handleStartGenerate,
		handleStopGenerate,
		leftScrollRef,
		rightScrollRef,
		handleLeftScroll,
		handleRightScroll,
		isRightAtTop,
		isRightAtBottom,
		scrollRightToTop,
		scrollRightToBottom,
	} = useSplitCanvas({
		leftEditor,
		docTitle,
		docId,
		stylePreset,
		instruction,
		modeLabel,
		onAccept,
		onSaveAsNewDocument,
	});

	return (
		<div className="flex-1 flex flex-col min-h-0 bg-surface dark:bg-background overflow-hidden relative select-text">
			{/* Top Control Header with Diff Mode Switcher & Save Version Button */}
			<SplitCompareHeader
				docTitle={docTitle}
				modeLabel={modeLabel}
				isStreaming={isStreaming}
				diffViewMode={diffViewMode}
				onChangeDiffViewMode={setDiffViewMode}
				onSaveVersionToDb={handleSaveCurrentVersionToDb}
				isSavingVersion={isSavingVersion}
				canAccept={canAccept}
				canSaveAsNew={canSaveAsNew}
				onAccept={handleAccept}
				onCancel={onCancel}
				onSaveAsNewDocument={onSaveAsNewDocument ? handleSaveAsNew : undefined}
			/>

			{/* Main Split Body: Left 50% vs Right 50% */}
			<EditorMediaContext.Provider value={{ docId }}>
				<div className="flex-1 min-h-0 flex overflow-hidden relative">
					{/* Left Column: Base Version */}
					<SplitOriginalColumn
						selectedVersionId={leftVersionId}
						versions={versions}
						onSelectVersion={setLeftVersionId}
						wordCount={leftWordCount}
						diffViewMode={diffViewMode}
						highlightedMarkdown={diffStrings.leftHighlighted}
						editor={leftPreviewEditor}
						scrollRef={leftScrollRef}
						onScroll={handleLeftScroll}
					/>

					{/* Right Column: Draft Practice Canvas */}
					<SplitRevisedColumn
						selectedVersionId={rightVersionId}
						versions={versions}
						onSelectVersion={handleSelectRightVersion}
						wordCount={rightWordCount}
						diffDelta={diffStrings.diffDelta}
						diffViewMode={diffViewMode}
						onChangeDiffViewMode={setDiffViewMode}
						highlightedMarkdown={diffStrings.rightHighlighted}
						editor={rightEditor}
						isStreaming={isStreaming}
						scrollRef={rightScrollRef}
						onScroll={handleRightScroll}
						isAtTop={isRightAtTop}
						isAtBottom={isRightAtBottom}
						onScrollToTop={scrollRightToTop}
						onScrollToBottom={scrollRightToBottom}
						slashMenu={slashMenu}
						slashMenuRef={slashMenuRef}
						onCloseSlashMenu={() => setSlashMenu(null)}
						selectedMode={selectedMode}
						onSelectMode={setSelectedMode}
						customPrompt={customPrompt}
						onChangeCustomPrompt={setCustomPrompt}
						onStartGenerate={() => handleStartGenerate()}
						onStopGenerate={handleStopGenerate}
						canAccept={canAccept}
						onAccept={handleAccept}
						onReject={onCancel}
						dockInputVisible={isAiPanelCollapsed}
					/>
				</div>
			</EditorMediaContext.Provider>
		</div>
	);
}
