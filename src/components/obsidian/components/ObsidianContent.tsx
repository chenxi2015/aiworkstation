import { Button } from "@heroui/react";
import { FolderOpen, NotebookPen } from "lucide-react";
import type { WorkbenchSettings } from "../../workbench/types";
import { NotePanel } from "../NotePanel";
import type { ObsidianNoteApi, ObsidianTree } from "../types";

export interface ObsidianContentProps {
	vaultMissing: boolean;
	vault?: ObsidianTree["vault"];
	selectedNotePath: string | null;
	settings: WorkbenchSettings;
	onOpenPicker: () => void;
	onSaveVaultDir: (path: string) => void;
	onMutated: () => void;
	onRenamed: (newPath: string) => void;
	onDeleted: () => void;
	onRegisterNoteApi: (api: ObsidianNoteApi | null) => void;
	onNavigateNote: (path: string) => void;
	onCreateNoteFromLink: (name: string) => void;
	canGoBack: boolean;
	canGoForward: boolean;
	onBack: () => void;
	onForward: () => void;
	onSelectFolder: (dir: string) => void;
}

/**
 * Main content canvas displaying missing vault guide, NotePanel, or empty note selection.
 */
export function ObsidianContent({
	vaultMissing,
	vault,
	selectedNotePath,
	settings,
	onOpenPicker,
	onSaveVaultDir,
	onMutated,
	onRenamed,
	onDeleted,
	onRegisterNoteApi,
	onNavigateNote,
	onCreateNoteFromLink,
	canGoBack,
	canGoForward,
	onBack,
	onForward,
	onSelectFolder,
}: ObsidianContentProps) {
	return (
		<section className="flex-1 overflow-hidden">
			{vaultMissing ? (
				<div className="h-full flex flex-col items-center justify-center text-center px-8">
					<div className="w-14 h-14 rounded-2xl bg-surface-secondary text-foreground/70 flex items-center justify-center mb-4">
						<FolderOpen className="w-6 h-6" />
					</div>
					<h2 className="text-sm font-semibold text-foreground">
						Vault 目录不存在
					</h2>
					<p className="mt-2 text-xs text-muted max-w-sm leading-relaxed">
						当前配置：{vault?.configured || "未配置"}
						。可从左下角仓库入口打开/新建仓库，或直接浏览选择目录。
					</p>
					<div className="mt-4 flex items-center gap-2">
						<Button
							variant="primary"
							size="sm"
							className="flex items-center gap-1.5"
							onPress={onOpenPicker}
						>
							<FolderOpen className="w-3.5 h-3.5" />
							浏览选择目录
						</Button>
						<Button
							variant="secondary"
							size="sm"
							onPress={() => {
								const input = window.prompt(
									"输入 Vault 目录路径（支持 ~ 开头）",
									settings.obsidianVaultDir ?? "~/Documents/Obsidian",
								);
								if (input?.trim()) onSaveVaultDir(input);
							}}
						>
							手动填写
						</Button>
					</div>
				</div>
			) : selectedNotePath ? (
				<NotePanel
					relPath={selectedNotePath}
					onMutated={onMutated}
					onRenamed={onRenamed}
					onDeleted={onDeleted}
					onRegisterNoteApi={onRegisterNoteApi}
					onNavigateNote={onNavigateNote}
					onCreateNote={onCreateNoteFromLink}
					canGoBack={canGoBack}
					canGoForward={canGoForward}
					onBack={onBack}
					onForward={onForward}
					onSelectFolder={onSelectFolder}
				/>
			) : (
				<div className="h-full flex flex-col items-center justify-center text-center px-8">
					<div className="w-14 h-14 rounded-2xl bg-surface-secondary text-foreground/70 flex items-center justify-center mb-4">
						<NotebookPen className="w-6 h-6" />
					</div>
					<h2 className="text-sm font-semibold text-foreground">
						从左侧选择一篇笔记
					</h2>
					<p className="mt-2 text-xs text-muted max-w-sm leading-relaxed">
						目录即分类：点击文件夹选定新建位置，笔记直接读写 Vault 内的
						Markdown 文件，与 Obsidian 实时双向同步。
					</p>
				</div>
			)}
		</section>
	);
}
