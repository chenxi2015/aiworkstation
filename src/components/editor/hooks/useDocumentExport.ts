import { toast } from "@heroui/react";
import TextAlign from "@tiptap/extension-text-align";
import { renderToHTMLString } from "@tiptap/static-renderer/pm/html-string";
import { useCallback, useMemo } from "react";
import { exportToPdfPrint, exportToWordDocx } from "../exporters";
import { coreConversionExtensions, tiptapJsonToMarkdown } from "../markdown";
import { normalizeCodeCardDoc } from "../utils/codeCardNormalizer";
import type { EditorDocument } from "../types";

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

export function useDocumentExport({
	activeDoc,
	contentText,
}: UseDocumentExportOptions) {
	// biome-ignore lint/correctness/useExhaustiveDependencies: contentText triggers update
	const currentMarkdown = useMemo(() => {
		if (!activeDoc?.content) return "";
		try {
			return tiptapJsonToMarkdown(
				normalizeCodeCardDoc(JSON.parse(activeDoc.content)),
			);
		} catch {
			return "";
		}
	}, [activeDoc?.content, contentText]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: contentText triggers update
	const currentHtml = useMemo(() => {
		if (!activeDoc?.content) return "";
		try {
			return renderToHTMLString({
				content: normalizeCodeCardDoc(JSON.parse(activeDoc.content)),
				extensions: EXPORT_EXTENSIONS,
			});
		} catch {
			return "";
		}
	}, [activeDoc?.content, contentText]);

	const buildHtmlDocument = useCallback(() => {
		const title = activeDoc?.title || "未命名文档";
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
</style>
</head>
<body>
${currentHtml}
</body>
</html>`;
	}, [activeDoc?.title, currentHtml]);

	const copyText = useCallback(async (text: string, label = "内容") => {
		try {
			await navigator.clipboard.writeText(text);
			toast.success(`已复制${label}到剪贴板`);
		} catch (e) {
			console.error("Failed to copy", e);
			toast.danger("复制失败，请重试");
		}
	}, []);

	/** 复制富文本 HTML 到剪贴板（text/html + text/plain 双格式，可直接粘贴到公众号等编辑器） */
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

	const handleExportWord = useCallback(() => {
		if (!activeDoc) return;
		exportToWordDocx(activeDoc.title, currentHtml || activeDoc.contentText);
	}, [activeDoc, currentHtml]);

	const handleExportMarkdown = useCallback(() => {
		if (!activeDoc) return;
		downloadFile(
			`${activeDoc.title || "未命名文档"}.md`,
			currentMarkdown,
			"text/markdown",
		);
	}, [activeDoc, currentMarkdown, downloadFile]);

	const handleExportHtml = useCallback(() => {
		if (!activeDoc) return;
		downloadFile(
			`${activeDoc.title || "未命名文档"}.html`,
			buildHtmlDocument(),
			"text/html",
		);
	}, [activeDoc, buildHtmlDocument, downloadFile]);

	const handleExportPdf = useCallback(() => {
		if (!activeDoc) return;
		exportToPdfPrint(activeDoc.title, currentHtml || activeDoc.contentText);
	}, [activeDoc, currentHtml]);

	return {
		currentMarkdown,
		currentHtml,
		buildHtmlDocument,
		copyText,
		copyHtml,
		downloadFile,
		handleExportWord,
		handleExportMarkdown,
		handleExportHtml,
		handleExportPdf,
	};
}
