import { toast } from "@heroui/react";
import TextAlign from "@tiptap/extension-text-align";
import { renderToHTMLString } from "@tiptap/static-renderer/pm/html-string";
import { useCallback, useMemo } from "react";
import {
	embedRichBlocksAsImages,
	embedRichBlocksInDoc,
	exportToPdf,
	exportToWordDocx,
} from "../exporters";
import { coreConversionExtensions, tiptapJsonToMarkdown } from "../markdown";
import type { EditorDocument } from "../types";
import { normalizeCodeCardDoc } from "../utils/codeCardNormalizer";

/**
 * Extensions set for export rendering。
 * 直接复用 coreConversionExtensions（含 styledContainer / textStyle 等样式保留扩展），
 * 否则带「优化样式」排版（section 卡片、内联颜色）的文档在静态渲染时会抛
 * "Unknown node type: styledContainer"，导出退化为纯文本或空文件。
 */
export const EXPORT_EXTENSIONS = [
	...coreConversionExtensions,
	TextAlign.configure({
		types: ["heading", "paragraph", "image", "video"],
		defaultAlignment: "left",
	}),
];

export interface UseDocumentExportOptions {
	activeDoc: EditorDocument | null;
	contentText: string;
}

/** 文档里是否含图表/Mermaid 等需要离屏渲染为图片的富媒体块 */
function hasRichBlocks(docJsonString: string | undefined): boolean {
	if (!docJsonString) return false;
	return (
		docJsonString.includes('"type":"chart"') ||
		docJsonString.includes('"language":"mermaid"')
	);
}

export function useDocumentExport({
	activeDoc,
	contentText,
}: UseDocumentExportOptions) {
	// biome-ignore lint/correctness/useExhaustiveDependencies: contentText triggers update
	const parsedDoc = useMemo(() => {
		if (!activeDoc?.content) return null;
		try {
			return normalizeCodeCardDoc(JSON.parse(activeDoc.content));
		} catch {
			return null;
		}
	}, [activeDoc?.content, contentText]);

	const currentMarkdown = useMemo(() => {
		if (!parsedDoc) return "";
		try {
			return tiptapJsonToMarkdown(parsedDoc);
		} catch {
			return "";
		}
	}, [parsedDoc]);

	const currentHtml = useMemo(() => {
		if (!parsedDoc) return "";
		try {
			return renderToHTMLString({
				content: parsedDoc,
				extensions: EXPORT_EXTENSIONS,
			});
		} catch {
			return "";
		}
	}, [parsedDoc]);

	/**
	 * 图表节点（ECharts canvas）与 Mermaid 代码块在导出目标里无法渲染，
	 * 统一离屏渲染为高清 PNG 嵌入；Mermaid 按 viewBox 固有尺寸放大位图化，避免小图模糊。
	 */
	const buildEmbeddedHtml = useCallback(async (): Promise<string> => {
		if (!currentHtml) return "";
		if (!hasRichBlocks(activeDoc?.content)) return currentHtml;
		try {
			return await embedRichBlocksAsImages(currentHtml);
		} catch {
			return currentHtml;
		}
	}, [currentHtml, activeDoc?.content]);

	/** Markdown 无法表达图表：chart/mermaid 节点替换为高清 PNG 图片后再序列化 */
	const buildEmbeddedMarkdown = useCallback(async (): Promise<string> => {
		if (!parsedDoc) return "";
		if (!hasRichBlocks(activeDoc?.content)) return currentMarkdown;
		try {
			const embedded = await embedRichBlocksInDoc(parsedDoc);
			return tiptapJsonToMarkdown(embedded);
		} catch {
			return currentMarkdown;
		}
	}, [parsedDoc, currentMarkdown, activeDoc?.content]);

	const buildHtmlDocument = useCallback(async () => {
		const title = activeDoc?.title || "未命名文档";
		const bodyHtml = await buildEmbeddedHtml();
		return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="referrer" content="no-referrer" />
<title>${title}</title>
<style>
body { max-width: 720px; margin: 40px auto; padding: 0 16px; font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; line-height: 1.75; color: #1a1a1a; }
img, video { max-width: 100%; border-radius: 8px; }
img[style*="text-align: center"], video[style*="text-align: center"] { margin-left: auto; margin-right: auto; display: block; }
img[style*="text-align: right"], video[style*="text-align: right"] { margin-left: auto; margin-right: 0; display: block; }
img[style*="text-align: left"], video[style*="text-align: left"] { margin-left: 0; margin-right: auto; display: block; }
blockquote { border-left: 3px solid #ddd; margin: 0; padding-left: 16px; color: #666; }
code { background: #f3f3f3; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
pre { background: #f6f8fa; padding: 16px; border-radius: 8px; overflow-x: auto; }
table { width: 100%; border-collapse: collapse; margin: 14px 0; }
th, td { border: 1px solid #d1d5db; padding: 8px 12px; text-align: left; font-size: 14px; }
th { background: #f9fafb; font-weight: 600; }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
	}, [activeDoc?.title, buildEmbeddedHtml]);

	const copyText = useCallback(async (text: string, label = "内容") => {
		try {
			await navigator.clipboard.writeText(text);
			toast.success(`已复制${label}到剪贴板`);
		} catch (e) {
			console.error("Failed to copy", e);
			toast.danger("复制失败，请重试");
		}
	}, []);

	/**
	 * 复制富文本 HTML 到剪贴板（text/html + text/plain 双格式，可直接粘贴到公众号等编辑器）。
	 * 复制不将图表/Mermaid 离屏渲染为图片（图片粘贴进其他富文本后无法再编辑），
	 * 保留 div[data-chart] 与 mermaid 代码块原样，粘贴回本编辑器可完整还原，只有导出下载时才转图片。
	 */
	const copyHtml = useCallback(async () => {
		const title = activeDoc?.title || "未命名文档";
		const html = currentHtml;
		if (!html) {
			toast.danger("HTML 内容为空，无法复制");
			return;
		}
		try {
			const wrapped = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">\n<h1 style="font-size: 20px; font-weight: 700; margin-bottom: 16px;">${title}</h1>\n${html}\n</div>`;
			await navigator.clipboard.write([
				new ClipboardItem({
					"text/html": new Blob([wrapped], { type: "text/html" }),
					"text/plain": new Blob(
						[contentText || activeDoc?.contentText || ""],
						{
							type: "text/plain",
						},
					),
				}),
			]);
			toast.success("已复制富文本 HTML，可直接粘贴到公众号/飞书等编辑器");
		} catch (e) {
			console.error("Failed to copy HTML", e);
			toast.danger("复制 HTML 失败，请重试");
		}
	}, [activeDoc, currentHtml, contentText]);

	/**
	 * 复制 Markdown。不渲染图片：图表序列化为 ```chart 围栏、Mermaid 保留 ```mermaid 源码，
	 * 粘贴到支持 Markdown 的编辑器（或本编辑器导入）可完整还原。
	 */
	const copyMarkdown = useCallback(async () => {
		if (!activeDoc) return;
		await copyText(currentMarkdown, "Markdown");
	}, [activeDoc, currentMarkdown, copyText]);

	const downloadFile = useCallback(
		(filename: string, content: string, mime: string) => {
			const blob = new Blob([content], { type: mime });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = filename;
			a.click();
			URL.revokeObjectURL(url);
		},
		[],
	);

	const handleExportWord = useCallback(async () => {
		if (!activeDoc) return;
		try {
			await exportToWordDocx(
				activeDoc.title,
				currentHtml || activeDoc.contentText,
			);
			toast.success("Word 文档已导出");
		} catch (e) {
			console.error("Failed to export docx", e);
			toast.danger("导出 Word 失败，请重试");
		}
	}, [activeDoc, currentHtml]);

	const handleExportMarkdown = useCallback(() => {
		if (!activeDoc) return;
		const rich = hasRichBlocks(activeDoc.content);
		if (rich) toast.info("正在将图表渲染为图片…");
		void buildEmbeddedMarkdown().then((markdown) => {
			downloadFile(
				`${activeDoc.title || "未命名文档"}.md`,
				markdown,
				"text/markdown",
			);
		});
	}, [activeDoc, buildEmbeddedMarkdown, downloadFile]);

	const handleExportHtml = useCallback(() => {
		if (!activeDoc) return;
		void buildHtmlDocument().then((html) => {
			downloadFile(
				`${activeDoc.title || "未命名文档"}.html`,
				html,
				"text/html",
			);
		});
	}, [activeDoc, buildHtmlDocument, downloadFile]);

	const handleExportPdf = useCallback(async () => {
		if (!activeDoc) return;
		toast.info("正在生成 PDF，请稍候…");
		try {
			await exportToPdf(activeDoc.title, currentHtml || activeDoc.contentText);
			toast.success("PDF 已导出");
		} catch (e) {
			console.error("Failed to export pdf", e);
			toast.danger("导出 PDF 失败，请重试");
		}
	}, [activeDoc, currentHtml]);

	return {
		currentMarkdown,
		currentHtml,
		buildHtmlDocument,
		copyText,
		copyHtml,
		copyMarkdown,
		downloadFile,
		handleExportWord,
		handleExportMarkdown,
		handleExportHtml,
		handleExportPdf,
	};
}
