import { Button, Modal } from "@heroui/react";
import { Chrome, FileText, FolderUp } from "lucide-react";
import { useState } from "react";
import { ExtensionSyncTab } from "./sync/ExtensionSyncTab";
import { FileImportTab } from "./sync/FileImportTab";
import { PasteImportTab } from "./sync/PasteImportTab";
import type { WorkbenchItem } from "./types";

interface BookmarkSyncModalProps {
	isOpen: boolean;
	onClose: () => void;
	onBookmarksImported: (
		newUnclassified: WorkbenchItem[],
		triggerAICallback?: boolean,
	) => void;
}

type TabType = "extension" | "file" | "paste";

/**
 * Main Bookmark Sync & Import Modal for AI Workstation
 */
export function BookmarkSyncModal({
	isOpen,
	onClose,
	onBookmarksImported,
}: BookmarkSyncModalProps) {
	const [activeTab, setActiveTab] = useState<TabType>("extension");

	return (
		<Modal.Backdrop
			isOpen={isOpen}
			onOpenChange={(open) => !open && onClose()}
			variant="blur"
		>
			<Modal.Container size="md">
				<Modal.Dialog aria-label="同步 / 导入书签到 AI 工作台">
					<Modal.CloseTrigger />
					<Modal.Header>
						<Modal.Heading>同步 / 导入书签到 AI 工作台</Modal.Heading>
					</Modal.Header>

					<Modal.Body className="flex flex-col gap-4 text-xs">
						{/* Tab Switcher */}
						<div className="flex items-center gap-1 p-1 bg-surface-secondary rounded-xl border border-border">
							<button
								type="button"
								onClick={() => setActiveTab("extension")}
								className={`flex-1 py-1.5 px-2 rounded-lg font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap ${
									activeTab === "extension"
										? "bg-surface text-foreground shadow-xs font-semibold"
										: "text-muted hover:text-foreground"
								}`}
							>
								<Chrome className="w-3.5 h-3.5 text-accent shrink-0" />
								<span>Chrome 插件</span>
							</button>
							<button
								type="button"
								onClick={() => setActiveTab("file")}
								className={`flex-1 py-1.5 px-2 rounded-lg font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap ${
									activeTab === "file"
										? "bg-surface text-foreground shadow-xs font-semibold"
										: "text-muted hover:text-foreground"
								}`}
							>
								<FolderUp className="w-3.5 h-3.5 shrink-0" />
								<span>书签文件</span>
							</button>
							<button
								type="button"
								onClick={() => setActiveTab("paste")}
								className={`flex-1 py-1.5 px-2 rounded-lg font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap ${
									activeTab === "paste"
										? "bg-surface text-foreground shadow-xs font-semibold"
										: "text-muted hover:text-foreground"
								}`}
							>
								<FileText className="w-3.5 h-3.5 shrink-0" />
								<span>文本/JSON</span>
							</button>
						</div>

						{/* Tab Contents */}
						{activeTab === "extension" && (
							<ExtensionSyncTab
								isOpen={isOpen}
								onBookmarksImported={onBookmarksImported}
								onClose={onClose}
							/>
						)}

						{activeTab === "file" && (
							<FileImportTab
								onBookmarksImported={onBookmarksImported}
								onClose={onClose}
							/>
						)}

						{activeTab === "paste" && (
							<PasteImportTab
								onBookmarksImported={onBookmarksImported}
								onClose={onClose}
							/>
						)}
					</Modal.Body>

					<Modal.Footer className="flex items-center justify-end">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="rounded-full cursor-pointer"
							onPress={onClose}
						>
							关闭
						</Button>
					</Modal.Footer>
				</Modal.Dialog>
			</Modal.Container>
		</Modal.Backdrop>
	);
}
