import { Sliders } from "lucide-react";
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
	return (
		<div className="shrink-0 px-8 pt-4 pb-2 max-w-3xl mx-auto w-full flex items-center gap-3">
			<input
				value={activeDoc.title}
				onChange={(e) => onTitleChange(e.target.value)}
				placeholder="未命名文档"
				className="flex-1 bg-transparent text-xl font-semibold outline-none placeholder:text-muted/50"
			/>
			<div className="flex items-center gap-1.5">
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
