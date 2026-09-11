import { toast } from "@heroui/react";
import { FolderOpen, Loader2, Pencil, Sliders } from "lucide-react";
import { useRef, useState } from "react";
import { openDocumentDirectoryRpc } from "../../../services/api/editorClient";
import type { EditorDocument, EditorStylePreset } from "../types";

export interface DocumentHeaderProps {
	activeDoc: EditorDocument;
	stylePresets: EditorStylePreset[];
	onTitleChange: (title: string) => void;
	onStylePresetChange: (presetId: string) => void;
	onOpenStylePresetModal: () => void;
}

export function DocumentHeader({
	activeDoc,
	stylePresets,
	onTitleChange,
	onStylePresetChange,
	onOpenStylePresetModal,
}: DocumentHeaderProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [isOpeningFolder, setIsOpeningFolder] = useState(false);

	const handleFocusInput = () => {
		if (inputRef.current) {
			inputRef.current.focus();
			inputRef.current.select();
		}
	};

	const handleOpenFolder = async () => {
		setIsOpeningFolder(true);
		try {
			await openDocumentDirectoryRpc(activeDoc.id);
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			toast.danger(`打开本地文件夹失败: ${message}`);
		} finally {
			setIsOpeningFolder(false);
		}
	};

	return (
		<div className="shrink-0 px-8 pt-4 pb-2 max-w-3xl mx-auto w-full flex items-center gap-3">
			<div className="flex-1 min-w-0 flex items-center gap-1.5">
				<span
					className="text-base font-mono font-medium text-muted/60 select-none shrink-0"
					title={`文档ID: #${activeDoc.id}`}
				>
					#{activeDoc.id}
				</span>
				<div className="inline-grid items-center max-w-full relative">
					<span className="invisible col-start-1 row-start-1 text-xl font-semibold px-1 whitespace-pre select-none pointer-events-none overflow-hidden text-ellipsis">
						{activeDoc.title || "未命名文档"}
					</span>
					<input
						ref={inputRef}
						value={activeDoc.title}
						onChange={(e) => onTitleChange(e.target.value)}
						placeholder="未命名文档"
						className="col-start-1 row-start-1 text-xl font-semibold bg-transparent outline-none placeholder:text-muted/50 px-1 rounded hover:bg-muted/10 focus:bg-muted/15 transition-colors w-full"
					/>
				</div>
				<button
					type="button"
					onClick={handleFocusInput}
					title="编辑名称"
					aria-label="编辑名称"
					className="p-1 text-muted hover:text-foreground hover:bg-muted/10 rounded-md transition-colors cursor-pointer shrink-0"
				>
					<Pencil className="w-4 h-4" />
				</button>
			</div>
			<div className="flex items-center gap-1.5">
				<button
					type="button"
					title="打开本地存储文件夹"
					aria-label="打开本地存储文件夹"
					disabled={isOpeningFolder}
					onClick={handleOpenFolder}
					className="p-1 text-muted hover:text-foreground hover:bg-muted/10 rounded transition-colors cursor-pointer disabled:opacity-50"
				>
					{isOpeningFolder ? (
						<Loader2 className="w-3.5 h-3.5 animate-spin" />
					) : (
						<FolderOpen className="w-3.5 h-3.5" />
					)}
				</button>
				<select
					value={activeDoc.stylePreset || ""}
					onChange={(e) => onStylePresetChange(e.target.value)}
					className="text-xs bg-surface-secondary border border-border rounded-md px-2 py-1 text-muted cursor-pointer"
				>
					<option value="">无风格</option>
					{stylePresets.map((p) => (
						<option key={p.id} value={p.id}>
							{p.label}
						</option>
					))}
				</select>
				<button
					type="button"
					title="管理与自定义风格模板"
					onClick={onOpenStylePresetModal}
					className="p-1 text-muted hover:text-foreground hover:bg-muted/10 rounded transition-colors cursor-pointer"
				>
					<Sliders className="w-3.5 h-3.5" />
				</button>
			</div>
		</div>
	);
}
