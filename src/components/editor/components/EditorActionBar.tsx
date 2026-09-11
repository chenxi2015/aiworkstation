import { Dropdown } from "@heroui/react";
import dayjs from "dayjs";
import {
	Archive,
	CheckCircle2,
	ChevronDown,
	Code,
	Copy,
	Download,
	FileText,
	Printer,
	Share2,
} from "lucide-react";
import type { SaveState } from "../hooks/useDocumentManager";
import type { EditorDocument } from "../types";

export interface EditorActionBarProps {
	activeDoc: EditorDocument;
	wordCount: number;
	saveState: SaveState;
	savedAt: string | null;
	contentText: string;
	currentMarkdown: string;
	onSnapshot: () => void;
	onToggleFinalized: () => void;
	onCopyText: (text: string, label: string) => void;
	onExportWord: () => void;
	onExportMarkdown: () => void;
	onExportHtml: () => void;
	onExportPdf: () => void;
	onOpenDistribution: () => void;
}

export function EditorActionBar({
	activeDoc,
	wordCount,
	saveState,
	savedAt,
	contentText,
	currentMarkdown,
	onSnapshot,
	onToggleFinalized,
	onCopyText,
	onExportWord,
	onExportMarkdown,
	onExportHtml,
	onExportPdf,
	onOpenDistribution,
}: EditorActionBarProps) {
	return (
		<div className="shrink-0 border-t border-border bg-surface/60 px-4 py-2 flex items-center gap-2 flex-wrap">
			{/* Word count & Save state */}
			<span className="text-[11px] text-muted">{wordCount} 字</span>
			<span className="text-[11px] text-muted/60">·</span>
			<span className="text-[11px] text-muted">
				{saveState === "saving" && "保存中…"}
				{saveState === "saved" &&
					`已保存 ${savedAt ? dayjs(savedAt).format("HH:mm:ss") : ""}`}
				{saveState === "dirty" && "待保存"}
				{saveState === "error" && "保存失败"}
				{saveState === "idle" && "—"}
			</span>

			<div className="flex-1" />

			{/* Snapshot & Finalize */}
			<div className="flex items-center gap-1">
				<button
					type="button"
					onClick={onSnapshot}
					className="flex items-center gap-1 px-2.5 py-1 text-xs text-muted hover:text-foreground hover:bg-muted/10 rounded-md transition-colors cursor-pointer"
				>
					<Archive className="w-3.5 h-3.5" />
					存快照
				</button>
				<button
					type="button"
					onClick={onToggleFinalized}
					className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-md transition-colors cursor-pointer ${
						activeDoc.status === "finalized"
							? "text-success hover:bg-success/10"
							: "text-muted hover:text-foreground hover:bg-muted/10"
					}`}
				>
					<CheckCircle2 className="w-3.5 h-3.5" />
					{activeDoc.status === "finalized" ? "取消定稿" : "定稿"}
				</button>
			</div>

			<div className="w-px h-4 bg-border mx-1" />

			{/* Copy dropdown menu */}
			<Dropdown>
				<Dropdown.Trigger
					aria-label="复制选项"
					className="flex items-center gap-1 px-2.5 py-1 text-xs text-muted hover:text-foreground hover:bg-muted/10 data-[pressed]:bg-muted/15 rounded-md transition-colors cursor-pointer"
				>
					<Copy className="w-3.5 h-3.5" />
					<span>复制</span>
					<ChevronDown className="w-3 h-3 text-muted/60" />
				</Dropdown.Trigger>
				<Dropdown.Popover
					placement="top end"
					className="min-w-[160px] p-1 shadow-lg border border-border/80 rounded-xl bg-surface"
				>
					<Dropdown.Menu aria-label="复制内容选项">
						<Dropdown.Item
							id="copy-text"
							textValue="复制纯文本"
							onAction={() =>
								onCopyText(contentText || activeDoc.contentText, "纯文本")
							}
						>
							<div className="flex items-center gap-2 w-full py-0.5">
								<FileText className="w-3.5 h-3.5 text-muted shrink-0" />
								<div className="flex flex-col">
									<span className="text-xs font-medium">复制纯文本</span>
									<span className="text-[10px] text-muted">
										去除排版样式的纯文本
									</span>
								</div>
							</div>
						</Dropdown.Item>
						<Dropdown.Item
							id="copy-markdown"
							textValue="复制 Markdown"
							onAction={() => onCopyText(currentMarkdown, "Markdown")}
						>
							<div className="flex items-center gap-2 w-full py-0.5">
								<Copy className="w-3.5 h-3.5 text-muted shrink-0" />
								<div className="flex flex-col">
									<span className="text-xs font-medium">复制 Markdown</span>
									<span className="text-[10px] text-muted">
										保留标题、列表等语法
									</span>
								</div>
							</div>
						</Dropdown.Item>
					</Dropdown.Menu>
				</Dropdown.Popover>
			</Dropdown>

			{/* Export dropdown menu */}
			<Dropdown>
				<Dropdown.Trigger
					aria-label="导出文件"
					className="flex items-center gap-1 px-2.5 py-1 text-xs text-muted hover:text-foreground hover:bg-muted/10 data-[pressed]:bg-muted/15 rounded-md transition-colors cursor-pointer"
				>
					<Download className="w-3.5 h-3.5" />
					<span>导出</span>
					<ChevronDown className="w-3 h-3 text-muted/60" />
				</Dropdown.Trigger>
				<Dropdown.Popover
					placement="top end"
					className="min-w-[180px] p-1 shadow-lg border border-border/80 rounded-xl bg-surface"
				>
					<Dropdown.Menu aria-label="导出文件格式选项">
						<Dropdown.Item
							id="export-docx"
							textValue="Word 文档 (.docx)"
							onAction={onExportWord}
						>
							<div className="flex items-center gap-2 w-full py-0.5">
								<FileText className="w-3.5 h-3.5 text-blue-500 shrink-0" />
								<div className="flex flex-col">
									<span className="text-xs font-medium">Word 文档 (.docx)</span>
									<span className="text-[10px] text-muted">
										标准排版与标题样式
									</span>
								</div>
							</div>
						</Dropdown.Item>
						<Dropdown.Item
							id="export-md"
							textValue="Markdown (.md)"
							onAction={onExportMarkdown}
						>
							<div className="flex items-center gap-2 w-full py-0.5">
								<Download className="w-3.5 h-3.5 text-muted shrink-0" />
								<div className="flex flex-col">
									<span className="text-xs font-medium">Markdown (.md)</span>
									<span className="text-[10px] text-muted">
										标准 MD 格式源文件
									</span>
								</div>
							</div>
						</Dropdown.Item>
						<Dropdown.Item
							id="export-html"
							textValue="HTML 网页 (.html)"
							onAction={onExportHtml}
						>
							<div className="flex items-center gap-2 w-full py-0.5">
								<Code className="w-3.5 h-3.5 text-muted shrink-0" />
								<div className="flex flex-col">
									<span className="text-xs font-medium">HTML 网页 (.html)</span>
									<span className="text-[10px] text-muted">
										含内嵌样式的独立网页
									</span>
								</div>
							</div>
						</Dropdown.Item>
						<Dropdown.Item
							id="export-pdf"
							textValue="PDF / 打印"
							onAction={onExportPdf}
						>
							<div className="flex items-center gap-2 w-full py-0.5">
								<Printer className="w-3.5 h-3.5 text-muted shrink-0" />
								<div className="flex flex-col">
									<span className="text-xs font-medium">PDF / 打印</span>
									<span className="text-[10px] text-muted">
										唤起打印预览，可另存为 PDF
									</span>
								</div>
							</div>
						</Dropdown.Item>
					</Dropdown.Menu>
				</Dropdown.Popover>
			</Dropdown>

			<div className="w-px h-4 bg-border mx-1" />

			{/* Distribution / Social Card generation */}
			<button
				type="button"
				onClick={onOpenDistribution}
				className="flex items-center gap-1.5 px-3 py-1 text-xs text-accent font-medium bg-accent/10 hover:bg-accent/20 rounded-md transition-colors cursor-pointer"
				title="一键生成移动端长图、小红书 3:4 多图卡片与多平台分发排版"
			>
				<Share2 className="w-3.5 h-3.5" />
				<span>📱 贴图 / 分发</span>
			</button>
		</div>
	);
}
