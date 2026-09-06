import { Link } from "@heroui/react";
import { Folder as FolderIcon } from "lucide-react";
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import { memo, useMemo } from "react";
import { Streamdown } from "streamdown";
import type { Category, Folder } from "../../types";

const URL_REGEX = /(https?:\/\/[^\s<>)\]}]+)/g;

/**
 * Normalizes backtick URLs (`https://...`) into standard markdown links [url](url)
 * so they are consistently recognized by markdown parser.
 */
function normalizeMarkdownUrls(markdown: string): string {
	if (!markdown) return "";
	return markdown.replace(/`\s*(https?:\/\/[^\s`]+)\s*`/g, "[$1]($1)");
}

/**
 * Safely wraps plain text URLs into interactive HeroUI Link components
 */
function renderTextWithUrls(text: string): ReactNode {
	if (!text || !URL_REGEX.test(text)) return text;
	const parts = text.split(URL_REGEX);
	return parts.map((part, i) => {
		if (/^https?:\/\//i.test(part)) {
			// Strip trailing punctuation often appended in prose
			const cleanUrl = part.replace(/[.,;!?，。！？"“”'‘’）]+$/, "");
			const trailing = part.slice(cleanUrl.length);
			return (
				<span key={i}>
					<Link
						href={cleanUrl}
						target="_blank"
						rel="noreferrer"
						style={{ color: "#2563eb" }}
					>
						<span>{cleanUrl}</span>
						<Link.Icon />
					</Link>
					{trailing}
				</span>
			);
		}
		return part;
	});
}

/**
 * Recursively scans children to convert raw URL strings into Link components
 */
function processChildrenWithUrls(children: ReactNode): ReactNode {
	if (typeof children === "string") {
		return renderTextWithUrls(children);
	}
	if (Array.isArray(children)) {
		return children.map((child, index) => {
			if (typeof child === "string") {
				return <span key={index}>{renderTextWithUrls(child)}</span>;
			}
			return child;
		});
	}
	return children;
}

/**
 * Safely find a folder matching a given text string.
 * Supports exact match as well as stripping leading emoji/symbols.
 */
function findMatchingFolder(
	text: string,
	folders?: Folder[],
): Folder | undefined {
	if (!folders || !text) return undefined;
	const clean = text.trim().toLowerCase();
	if (!clean || clean.length < 2) return undefined;

	// 1. Exact match (case-insensitive)
	const exact = folders.find((f) => f.name.trim().toLowerCase() === clean);
	if (exact) return exact;

	// 2. Strip leading emojis/symbols/punctuation (e.g. "🐙 GitHub 资源库" -> "GitHub 资源库")
	const stripped = clean
		.replace(/^[\p{Emoji}\p{Extended_Pictographic}\s/\\#\-_:：]+/u, "")
		.trim();
	if (stripped && stripped.length >= 2) {
		const match = folders.find((f) => {
			const fClean = f.name.trim().toLowerCase();
			const fStripped = fClean
				.replace(/^[\p{Emoji}\p{Extended_Pictographic}\s/\\#\-_:：]+/u, "")
				.trim();
			return fClean === stripped || fStripped === stripped || fClean === clean;
		});
		if (match) return match;
	}

	return undefined;
}

/**
 * Validates whether a string is a full valid HTTP/HTTPS URL
 */
function isValidHttpUrl(str: string): boolean {
	if (!str || typeof str !== "string") return false;
	const trimmed = str.trim();
	if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
		return false;
	}
	try {
		const parsed = new URL(trimmed);
		return parsed.protocol === "http:" || parsed.protocol === "https:";
	} catch {
		return false;
	}
}

/**
 * Chinese translations for Streamdown controls and tooltips
 */
const STREAMDOWN_ZH_TRANSLATIONS = {
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
	folders?: Folder[];
	onNavigateToFolder?: (
		folderId: number | null,
		category?: Category,
		targetItemId?: string | number,
	) => void;
}

type ExtraProps<T extends ElementType> = ComponentPropsWithoutRef<T> & {
	node?: unknown;
	children?: ReactNode;
};

/**
 * Shared AI Markdown & Streamdown renderer with optimized font scaling,
 * compact spacing for sidebars/modals, direct URL opening, and interactive folder tags.
 */
export const AiMarkdownRenderer = memo(function AiMarkdownRenderer({
	content,
	className = "",
	compact = true,
	folders,
	onNavigateToFolder,
}: AiMarkdownRendererProps) {
	const processedContent = useMemo(
		() => normalizeMarkdownUrls(content),
		[content],
	);

	return (
		<div
			className={`ai-markdown-root ${compact ? "ai-markdown-compact" : ""} ${className}`}
		>
			<Streamdown
				linkSafety={{ enabled: false }}
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
							className={
								compact
									? "text-[14px] font-bold text-foreground mt-3 mb-1.5 leading-snug tracking-tight first:mt-0"
									: "text-[18px] sm:text-[19px] font-bold text-foreground mt-5 mb-2.5 leading-snug tracking-tight first:mt-0"
							}
							{...props}
						>
							{children}
						</h1>
					),
					h2: ({ children, node, ...props }: ExtraProps<"h2">) => (
						<h2
							className={
								compact
									? "text-[13px] font-bold text-foreground mt-2.5 mb-1 leading-snug tracking-tight first:mt-0"
									: "text-[16px] sm:text-[17px] font-bold text-foreground mt-4.5 mb-2 leading-snug tracking-tight first:mt-0"
							}
							{...props}
						>
							{children}
						</h2>
					),
					h3: ({ children, node, ...props }: ExtraProps<"h3">) => (
						<h3
							className={
								compact
									? "text-[12.5px] font-semibold text-foreground mt-2 mb-1 leading-snug first:mt-0"
									: "text-[14.5px] sm:text-[15px] font-semibold text-foreground mt-3.5 mb-1.5 leading-snug first:mt-0"
							}
							{...props}
						>
							{children}
						</h3>
					),
					p: ({ children, node, ...props }: ExtraProps<"p">) => (
						<p
							className={
								compact
									? "text-[12px] text-foreground/90 leading-relaxed mb-2 last:mb-0"
									: "text-[14px] sm:text-[14.5px] text-foreground/90 leading-[1.75] mb-3.5 last:mb-0"
							}
							{...props}
						>
							{processChildrenWithUrls(children)}
						</p>
					),
					ul: ({ children, node, ...props }: ExtraProps<"ul">) => (
						<ul
							className={
								compact
									? "list-disc list-outside pl-4 mb-2 space-y-0.5 text-[12px] text-foreground/90"
									: "list-disc list-outside pl-5 mb-3.5 space-y-2 text-[14px] sm:text-[14.5px] text-foreground/90"
							}
							{...props}
						>
							{children}
						</ul>
					),
					ol: ({ children, node, ...props }: ExtraProps<"ol">) => (
						<ol
							className={
								compact
									? "list-decimal list-outside pl-4 mb-2 space-y-0.5 text-[12px] text-foreground/90"
									: "list-decimal list-outside pl-5 mb-3.5 space-y-2 text-[14px] sm:text-[14.5px] text-foreground/90"
							}
							{...props}
						>
							{children}
						</ol>
					),
					li: ({ children, node, ...props }: ExtraProps<"li">) => (
						<li
							className={compact ? "leading-relaxed" : "leading-[1.7]"}
							{...props}
						>
							{processChildrenWithUrls(children)}
						</li>
					),
					blockquote: ({
						children,
						node,
						...props
					}: ExtraProps<"blockquote">) => (
						<blockquote
							className={
								compact
									? "border-l-2 border-accent/60 pl-2.5 my-2 text-[11.5px] text-muted italic bg-accent-soft/30 py-1 rounded-r"
									: "border-l-2 border-accent/70 pl-3.5 my-3 text-[13.5px] text-muted leading-relaxed bg-accent-soft/20 py-1.5 rounded-r"
							}
							{...props}
						>
							{children}
						</blockquote>
					),
					code: ({
						children,
						className,
						node,
						...props
					}: ExtraProps<"code">) => {
						const isInline = !className;
						if (isInline && typeof children === "string") {
							const text = children.trim();

							// 1. Detect if the inline code is actually an HTTP/HTTPS URL
							if (isValidHttpUrl(text)) {
								return (
									<Link
										href={text}
										target="_blank"
										rel="noreferrer"
										style={{ color: "#2563eb" }}
									>
										<span>{text}</span>
										<Link.Icon />
									</Link>
								);
							}

							// 2. Detect if the inline code references an existing folder
							const matchedFolder = findMatchingFolder(text, folders);
							if (matchedFolder && onNavigateToFolder) {
								return (
									<button
										type="button"
										onClick={(e) => {
											e.stopPropagation();
											onNavigateToFolder(
												matchedFolder.id,
												matchedFolder.category as Category,
											);
										}}
										className="inline-flex items-center gap-1 px-2 text-[11.5px] font-medium rounded-md bg-accent/10 hover:bg-accent/20 text-accent border border-accent/30 hover:border-accent/50 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98] align-middle"
										title={`在工作台中定位并进入「${matchedFolder.name}」文件夹`}
									>
										<FolderIcon className="w-3 h-3 shrink-0 text-accent" />
										<span>{matchedFolder.name}</span>
									</button>
								);
							}

							return (
								<code
									className={
										compact
											? "px-1 py-0.5 text-[11px] font-mono bg-surface-secondary text-accent rounded border border-border/60"
											: "px-1.5 py-0.5 text-[12.5px] font-mono bg-surface-secondary text-accent rounded border border-border/60"
									}
									{...props}
								>
									{children}
								</code>
							);
						}
						return (
							<code
								className={`font-mono ${compact ? "text-[11px]" : "text-[12.5px]"} ${className || ""}`}
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
					a: ({ children, href }: ExtraProps<"a">) => {
						// 1. Intercept custom folder:// protocols or matching folder links
						if (href && onNavigateToFolder) {
							if (href.startsWith("folder://")) {
								const folderKey = decodeURIComponent(
									href.replace("folder://", "").trim(),
								);
								const matched = folders?.find(
									(f) =>
										String(f.id) === folderKey ||
										f.name.toLowerCase() === folderKey.toLowerCase(),
								);
								if (matched) {
									return (
										<button
											type="button"
											onClick={(e) => {
												e.stopPropagation();
												onNavigateToFolder(
													matched.id,
													matched.category as Category,
												);
											}}
											className="inline-flex items-center gap-1 px-2 py-0.5 mx-0.5 text-[11.5px] font-medium rounded-md bg-accent/10 hover:bg-accent/20 text-accent border border-accent/30 hover:border-accent/50 transition-all cursor-pointer align-middle"
											title={`在工作台中定位并进入「${matched.name}」文件夹`}
										>
											<FolderIcon className="w-3 h-3 shrink-0 text-accent" />
											<span>{children || matched.name}</span>
										</button>
									);
								}
							}
						}

						return (
							<Link
								href={href}
								target="_blank"
								rel="noreferrer"
								style={{ color: "#2563eb" }}
							>
								<span>{children}</span>
								<Link.Icon />
							</Link>
						);
					},
				}}
			>
				{processedContent}
			</Streamdown>
		</div>
	);
});
