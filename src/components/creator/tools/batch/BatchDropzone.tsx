import { FileUp, FolderOpen, Layers } from "lucide-react";
import { useRef, useState } from "react";
import { pickBatchInputPaths } from "../../../../server/functions/batchOutputs";
import type { CollectResult } from "./collectFiles";
import {
	collectFromDataTransfer,
	collectFromDirectoryPicker,
	collectFromFileList,
	collectFromServerPaths,
} from "./collectFiles";

interface BatchDropzoneProps {
	acceptTypes?: string;
	supportedFormats?: string[];
	itemCount: number;
	disabled?: boolean;
	onCollect: (result: CollectResult) => void;
}

/**
 * Batch-capable dropzone: accepts multi-file drag, whole-folder drag
 * (recursive), multi-file picker, and folder picker (webkitdirectory).
 */
export function BatchDropzone({
	acceptTypes,
	supportedFormats,
	itemCount,
	disabled = false,
	onCollect,
}: BatchDropzoneProps) {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const dirInputRef = useRef<HTMLInputElement>(null);
	const [isDragging, setIsDragging] = useState(false);

	/** supportedFormats → 扩展名列表（服务端扫描过滤用） */
	const extensions = (supportedFormats ?? [])
		.map((f) => f.trim().toLowerCase().replace(/^\./, ""))
		.filter(Boolean);

	/**
	 * 优先走服务端原生选择器（与素材库导入同一机制），可直接拿到绝对路径，
	 * 解锁原路径替换与查看目录；服务端不可用（如云端部署）时回退 input file。
	 */
	const pickViaServer = async (
		mode: "files" | "directory",
		fallback: () => void,
	) => {
		try {
			const { paths } = await pickBatchInputPaths({ data: { mode } });
			if (!paths || paths.length === 0) return; // 用户取消
			onCollect(await collectFromServerPaths(paths, extensions));
		} catch {
			fallback();
		}
	};

	const handleDrop = async (e: React.DragEvent) => {
		e.preventDefault();
		setIsDragging(false);
		if (disabled) return;
		onCollect(await collectFromDataTransfer(e.dataTransfer, acceptTypes));
	};

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: drop target region
		<div
			onDragOver={(e) => {
				e.preventDefault();
				if (!disabled) setIsDragging(true);
			}}
			onDragLeave={() => setIsDragging(false)}
			onDrop={handleDrop}
			className={`p-5 rounded-xl border-2 border-dashed transition-all flex flex-col items-center justify-center text-center ${
				isDragging
					? "border-accent bg-accent/5"
					: "border-border/80 hover:border-accent/60 bg-surface hover:bg-surface/40"
			} ${disabled ? "opacity-60 pointer-events-none" : ""}`}
		>
			<input
				ref={fileInputRef}
				type="file"
				multiple
				accept={acceptTypes}
				className="hidden"
				onChange={async (e) => {
					if (e.target.files?.length) {
						onCollect(await collectFromFileList(e.target.files, acceptTypes));
					}
					e.target.value = "";
				}}
			/>
			<input
				ref={dirInputRef}
				type="file"
				// @ts-expect-error non-standard but supported attribute for folder picking
				webkitdirectory=""
				className="hidden"
				onChange={async (e) => {
					if (e.target.files?.length) {
						onCollect(await collectFromFileList(e.target.files, acceptTypes));
					}
					e.target.value = "";
				}}
			/>

			<div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center mb-2.5">
				<FileUp className="w-5 h-5" />
			</div>
			<p className="text-xs font-semibold text-foreground">
				拖拽文件或整个文件夹到此处
			</p>
			<p className="text-[11px] text-muted mt-1">
				{supportedFormats && supportedFormats.length > 0
					? `支持 ${supportedFormats.join(", ")}，文件夹会递归展开并保留目录结构`
					: "文件夹会递归展开并保留目录结构"}
			</p>

			<div className="flex items-center gap-2 mt-3">
				<button
					type="button"
					onClick={() =>
						void pickViaServer("files", () => fileInputRef.current?.click())
					}
					className="px-3 py-1.5 rounded-lg bg-accent text-accent-foreground text-[11px] font-medium flex items-center gap-1.5 hover:opacity-90 cursor-pointer"
				>
					<FileUp className="w-3 h-3" />
					选择文件
				</button>
				<button
					type="button"
					onClick={() =>
						void pickViaServer("directory", async () => {
							try {
								const result = await collectFromDirectoryPicker(acceptTypes);
								if (result) {
									onCollect(result);
									return;
								}
							} catch (err) {
								if (err instanceof Error && err.name === "AbortError") return;
							}
							// Fallback for environments without the File System Access API
							dirInputRef.current?.click();
						})
					}
					className="px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-surface/80 text-foreground text-[11px] font-medium flex items-center gap-1.5 cursor-pointer"
				>
					<FolderOpen className="w-3 h-3 text-accent" />
					选择文件夹
				</button>
			</div>

			{itemCount > 0 && (
				<p className="mt-2.5 text-[11px] text-accent font-medium flex items-center gap-1">
					<Layers className="w-3 h-3" />
					当前队列 {itemCount} 个文件（继续拖入可追加）
				</p>
			)}
		</div>
	);
}
