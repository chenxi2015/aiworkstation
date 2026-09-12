import { useCallback, useState } from "react";
import { SplitCompareHeader } from "./split/SplitCompareHeader";
import { SplitOriginalColumn } from "./split/SplitOriginalColumn";
import { SplitRevisedColumn } from "./split/SplitRevisedColumn";
import type { SplitCompareViewProps, ViewMode } from "./split/types";
import { useSplitCompare } from "./split/useSplitCompare";
import { buildDocFromBlocks } from "./split/utils";

export type { SplitCompareViewProps };

/**
 * Split screen diff and compare view:
 * Assembles header, left original column, and right AI streaming column.
 */
export function SplitCompareView({
	leftEditor,
	docTitle,
	docId: _docId,
	stylePreset,
	instruction,
	onAccept,
	onCancel,
}: SplitCompareViewProps) {
	const [viewMode, setViewMode] = useState<ViewMode>("diff");

	const {
		blocks,
		isStreaming,
		currentStep,
		totalSteps,
		diffStats,
		leftScrollRef,
		rightScrollRef,
		handleLeftScroll,
		handleRightScroll,
		handleStop,
	} = useSplitCompare({
		leftEditor,
		docTitle,
		stylePreset,
		instruction,
	});

	const handleAccept = useCallback(() => {
		const newDocJson = buildDocFromBlocks(blocks);
		onAccept(newDocJson);
	}, [blocks, onAccept]);

	return (
		<div className="flex-1 flex flex-col min-h-0 bg-surface dark:bg-background overflow-hidden relative select-text">
			{/* Top Control Header */}
			<SplitCompareHeader
				docTitle={docTitle}
				isStreaming={isStreaming}
				currentStep={currentStep}
				totalSteps={totalSteps}
				diffCount={diffStats.diffCount}
				viewMode={viewMode}
				onViewModeChange={setViewMode}
				onStop={handleStop}
				onAccept={handleAccept}
				onCancel={onCancel}
			/>

			{/* Main Split Body: Left 50% vs Right 50% */}
			<div className="flex-1 min-h-0 flex overflow-hidden">
				{/* Left Column: Original */}
				<SplitOriginalColumn
					blocks={blocks}
					originalLen={diffStats.originalLen}
					viewMode={viewMode}
					scrollRef={leftScrollRef}
					onScroll={handleLeftScroll}
				/>

				{/* Right Column: AI Streaming Revised */}
				<SplitRevisedColumn
					blocks={blocks}
					revisedLen={diffStats.revisedLen}
					isStreaming={isStreaming}
					viewMode={viewMode}
					scrollRef={rightScrollRef}
					onScroll={handleRightScroll}
				/>
			</div>
		</div>
	);
}
