import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import { memo } from "react";
import { Streamdown } from "streamdown";

/**
 * Chinese translations for Streamdown controls and tooltips
 */
export const STREAMDOWN_ZH_TRANSLATIONS = {
	close: "关闭",
	copied: "已复制",
	copyCode: "复制代码",
	copyLink: "复制链接",
	copyTable: "复制表格",
	copyTableAsCsv: "复制为 CSV",
	copyTableAsMarkdown: "复制为 Markdown",
	copyTableAsTsv: "复制为 TSV",
	downloadDiagram: "下载图表",
	downloadDiagramAsMmd: "下载为 MMD",
	downloadDiagramAsPng: "下载为 PNG",
	downloadDiagramAsSvg: "下载为 SVG",
	downloadFile: "下载文件",
	downloadImage: "下载图片",
	downloadTable: "下载表格",
	downloadTableAsCsv: "下载为 CSV",
	downloadTableAsMarkdown: "下载为 Markdown",
	exitFullscreen: "退出全屏",
	externalLinkWarning: "您即将访问外部链接。",
	imageNotAvailable: "图片无法加载",
	mermaidFormatMmd: "MMD 格式",
	mermaidFormatPng: "PNG 图片",
	mermaidFormatSvg: "SVG 矢量图",
	openExternalLink: "访问外部链接？",
	openLink: "打开链接",
	tableFormatCsv: "CSV 格式",
	tableFormatMarkdown: "Markdown 格式",
	tableFormatTsv: "TSV 格式",
	viewFullscreen: "全屏查看",
};

export interface AiMarkdownRendererProps {
	content: string;
	className?: string;
	compact?: boolean;
}

type ExtraProps<T extends ElementType> = ComponentPropsWithoutRef<T> & {
	node?: unknown;
	children?: ReactNode;
};

/**
 * Shared AI Markdown & Streamdown renderer with optimized font scaling,
 * compact spacing for sidebars/modals, and robust table action toolbars.
 */
export const AiMarkdownRenderer = memo(function AiMarkdownRenderer({
	content,
	className = "",
	compact = true,
}: AiMarkdownRendererProps) {
	return (
		<div
			className={`ai-markdown-root ${compact ? "ai-markdown-compact" : ""} ${className}`}
		>
			<Streamdown
				controls={{
					table: {
						copy: true,
						download: true,
						fullscreen: true,
					},
					code: {
						copy: true,
						download: true,
					},
				}}
				translations={STREAMDOWN_ZH_TRANSLATIONS}
				components={{
					h1: ({ children, node, ...props }: ExtraProps<"h1">) => (
						<h1
							className="text-[14px] font-bold text-foreground mt-3 mb-1.5 leading-snug tracking-tight first:mt-0"
							{...props}
						>
							{children}
						</h1>
					),
					h2: ({ children, node, ...props }: ExtraProps<"h2">) => (
						<h2
							className="text-[13px] font-bold text-foreground mt-2.5 mb-1 leading-snug tracking-tight first:mt-0"
							{...props}
						>
							{children}
						</h2>
					),
					h3: ({ children, node, ...props }: ExtraProps<"h3">) => (
						<h3
							className="text-[12.5px] font-semibold text-foreground mt-2 mb-1 leading-snug first:mt-0"
							{...props}
						>
							{children}
						</h3>
					),
					p: ({ children, node, ...props }: ExtraProps<"p">) => (
						<p
							className="text-[12px] text-foreground/90 leading-relaxed mb-2 last:mb-0"
							{...props}
						>
							{children}
						</p>
					),
					ul: ({ children, node, ...props }: ExtraProps<"ul">) => (
						<ul
							className="list-disc list-outside pl-4 mb-2 space-y-0.5 text-[12px] text-foreground/90"
							{...props}
						>
							{children}
						</ul>
					),
					ol: ({ children, node, ...props }: ExtraProps<"ol">) => (
						<ol
							className="list-decimal list-outside pl-4 mb-2 space-y-0.5 text-[12px] text-foreground/90"
							{...props}
						>
							{children}
						</ol>
					),
					li: ({ children, node, ...props }: ExtraProps<"li">) => (
						<li className="leading-relaxed" {...props}>
							{children}
						</li>
					),
					blockquote: ({
						children,
						node,
						...props
					}: ExtraProps<"blockquote">) => (
						<blockquote
							className="border-l-2 border-accent/60 pl-2.5 my-2 text-[11.5px] text-muted italic bg-accent-soft/30 py-1 rounded-r"
							{...props}
						>
							{children}
						</blockquote>
					),
					code: ({ children, className, node, ...props }: any) => {
						const isInline = !className;
						if (isInline) {
							return (
								<code
									className="px-1 py-0.5 text-[11px] font-mono bg-surface-secondary text-accent rounded border border-border/60"
									{...props}
								>
									{children}
								</code>
							);
						}
						return (
							<code
								className={`font-mono text-[11px] ${className || ""}`}
								{...props}
							>
								{children}
							</code>
						);
					},
					hr: ({ node, ...props }: ExtraProps<"hr">) => (
						<hr className="my-3 border-border/60" {...props} />
					),
					table: ({ children, node, ...props }: ExtraProps<"table">) => (
						<div className="overflow-x-auto my-2 rounded-lg border border-border/70 max-w-full">
							<table
								className="w-full text-left text-[11px] border-collapse bg-surface"
								{...props}
							>
								{children}
							</table>
						</div>
					),
					thead: ({ children, node, ...props }: ExtraProps<"thead">) => (
						<thead
							className="bg-surface-secondary/70 border-b border-border/80 text-foreground font-semibold"
							{...props}
						>
							{children}
						</thead>
					),
					th: ({ children, node, ...props }: ExtraProps<"th">) => (
						<th className="px-2.5 py-1.5 font-semibold text-muted" {...props}>
							{children}
						</th>
					),
					td: ({ children, node, ...props }: ExtraProps<"td">) => (
						<td
							className="px-2.5 py-1.5 border-t border-border/40 text-foreground/90"
							{...props}
						>
							{children}
						</td>
					),
					a: ({ children, href, node, ...props }: ExtraProps<"a">) => (
						<a
							href={href}
							target="_blank"
							rel="noreferrer"
							className="text-accent hover:underline inline-flex items-center gap-0.5 font-medium cursor-pointer"
							{...props}
						>
							{children}
						</a>
					),
				}}
			>
				{content}
			</Streamdown>
		</div>
	);
});
