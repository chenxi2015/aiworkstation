import { FolderOutput, HardDriveDownload, Replace } from "lucide-react";
import type { OutputMode } from "./types";

interface OutputModePickerProps {
	mode: OutputMode;
	onChange: (mode: OutputMode) => void;
	/** Render without the outer card wrapper (e.g. inside a modal) */
	bare?: boolean;
	/** Only Electron shell with abs paths allows in-place overwrite */
	overwriteEnabled: boolean;
	/** Electron: chosen output directory (new-directory mode) */
	outputDir?: string;
	onSelectOutputDir?: () => void;
	disabled?: boolean;
}

const MODES: {
	id: OutputMode;
	label: string;
	desc: string;
	icon: typeof Replace;
}[] = [
	{
		id: "new-directory",
		label: "保存到新目录",
		desc: "选择输出文件夹，保留原目录结构",
		icon: FolderOutput,
	},
	{
		id: "overwrite",
		label: "原路径替换",
		desc: "覆盖原文件，原文件自动移入回收站",
		icon: Replace,
	},
	{
		id: "zip-download",
		label: "打包下载",
		desc: "全部产物打成一个 zip 下载",
		icon: HardDriveDownload,
	},
];

/** Output destination picker: new directory / overwrite in place / zip download. */
export function OutputModePicker({
	mode,
	onChange,
	bare = false,
	overwriteEnabled,
	outputDir,
	onSelectOutputDir,
	disabled = false,
}: OutputModePickerProps) {
	return (
		<div
			className={
				bare
					? "space-y-2.5"
					: "p-4 rounded-xl border border-border bg-surface space-y-2.5"
			}
		>
			{!bare && (
				<p className="text-xs font-semibold text-foreground">输出方式</p>
			)}
			<div className="space-y-1.5">
				{MODES.map((m) => {
					const Icon = m.icon;
					const disabledMode = m.id === "overwrite" && !overwriteEnabled;
					const active = mode === m.id;
					return (
						<button
							key={m.id}
							type="button"
							disabled={disabled || disabledMode}
							onClick={() => onChange(m.id)}
							title={
								disabledMode
									? "需要队列中每个文件都有本地绝对路径：请通过左侧按钮选择文件/文件夹，或在桌面端拖入"
									: undefined
							}
							className={`w-full flex items-start gap-2.5 p-2.5 rounded-lg border text-left transition-all cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
								active
									? "border-accent bg-accent/5"
									: "border-border hover:border-accent/40"
							}`}
						>
							<Icon
								className={`w-4 h-4 mt-0.5 shrink-0 ${active ? "text-accent" : "text-muted"}`}
							/>
							<div className="min-w-0">
								<p
									className={`text-xs font-medium ${active ? "text-foreground" : "text-foreground/80"}`}
								>
									{m.label}
								</p>
								<p className="text-[10px] text-muted mt-0.5">{m.desc}</p>
							</div>
						</button>
					);
				})}
			</div>

			{mode === "new-directory" && onSelectOutputDir && (
				<button
					type="button"
					onClick={onSelectOutputDir}
					disabled={disabled}
					className="w-full px-3 py-2 rounded-lg border border-dashed border-border hover:border-accent/60 text-[11px] text-left cursor-pointer transition-colors"
				>
					{outputDir ? (
						<span className="text-foreground font-mono break-all">
							{outputDir}
						</span>
					) : (
						<span className="text-muted">
							点击选择输出文件夹（不选则保存时弹出选择）
						</span>
					)}
				</button>
			)}
		</div>
	);
}
