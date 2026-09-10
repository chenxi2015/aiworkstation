import mammoth from "mammoth";
import * as XLSX from "xlsx";

export interface ParsedDocument {
	title: string;
	html: string;
}

/**
 * 简易且健壮的 Markdown → HTML 转换器（用于导入网页正文、Obsidian 笔记等）
 */
export function markdownToHtml(md: string): string {
	if (!md) return "";

	const lines = md.split("\n");
	const htmlLines: string[] = [];
	let inCodeBlock = false;
	let codeBlockLang = "";
	let codeBlockContent: string[] = [];
	let inList = false;

	const extractVideoUrl = (str: string): string | null => {
		const s = str.trim();
		// 1. Markdown 视频语法: 🎥 [演示视频](url), [▶ 视频](url), [视频](url), ![video](url)
		const mdMatch = s.match(
			/^(?:🎥\s*)?(?:\[(?:▶\s*|🎥\s*)?(?:.*?视频|video).*?\]|!\[(?:video|视频).*?\])\((https?:\/\/[^\s)]+)\)$/i,
		);
		if (mdMatch) return mdMatch[1];

		// 2. 原生 HTML <video src="..."> 标签
		const htmlMatch = s.match(/<video[^>]+src=["'](https?:\/\/[^"']+)["']/i);
		if (htmlMatch) return htmlMatch[1];

		// 3. 单独一行的视频直链 (mp4, webm, ogg, mov, m4v)
		const urlMatch = s.match(
			/^(https?:\/\/[^\s]+\.(?:mp4|webm|ogg|mov|m4v)(?:\?[^\s]*)?)$/i,
		);
		if (urlMatch) return urlMatch[1];

		return null;
	};

	const formatInline = (text: string): string => {
		return text
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
			.replace(/\*(.*?)\*/g, "<em>$1</em>")
			.replace(/~~(.*?)~~/g, "<del>$1</del>")
			.replace(/`([^`]+)`/g, "<code>$1</code>")
			.replace(
				/(?:🎥\s*)?(?:\[(?:▶\s*|🎥\s*)?(?:.*?视频|video).*?\]|!\[(?:video|视频).*?\])\((https?:\/\/[^\s)]+)\)/gi,
				'<div class="ast-video-card my-3"><video src="$1" controls preload="metadata" referrerpolicy="no-referrer"></video></div>',
			)
			.replace(
				/!\[(.*?)\]\((.*?)\)/g,
				'<img src="$2" alt="$1" referrerpolicy="no-referrer" />',
			)
			.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');
	};

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		// 代码块处理
		if (line.trim().startsWith("```")) {
			if (!inCodeBlock) {
				inCodeBlock = true;
				codeBlockLang = line.trim().slice(3).trim();
				codeBlockContent = [];
			} else {
				inCodeBlock = false;
				const escaped = codeBlockContent
					.join("\n")
					.replace(/&/g, "&amp;")
					.replace(/</g, "&lt;")
					.replace(/>/g, "&gt;");
				htmlLines.push(
					`<pre><code class="language-${codeBlockLang}">${escaped}</code></pre>`,
				);
			}
			continue;
		}

		if (inCodeBlock) {
			codeBlockContent.push(line);
			continue;
		}

		const trimmed = line.trim();
		if (!trimmed) {
			if (inList) {
				htmlLines.push("</ul>");
				inList = false;
			}
			continue;
		}

		// 视频处理（参考 DocViewerApp 与 AST 规范，支持多种视频语法及直链）
		const videoUrl = extractVideoUrl(trimmed);
		if (videoUrl) {
			if (inList) {
				htmlLines.push("</ul>");
				inList = false;
			}
			htmlLines.push(
				`<div class="ast-video-card my-3"><video src="${videoUrl}" controls preload="metadata" referrerpolicy="no-referrer"></video></div>`,
			);
			continue;
		}

		// 标题
		const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
		if (headingMatch) {
			if (inList) {
				htmlLines.push("</ul>");
				inList = false;
			}
			const level = headingMatch[1].length;
			htmlLines.push(`<h${level}>${formatInline(headingMatch[2])}</h${level}>`);
			continue;
		}

		// 引用
		if (trimmed.startsWith(">")) {
			if (inList) {
				htmlLines.push("</ul>");
				inList = false;
			}
			const quoteContent = trimmed.replace(/^>\s*/, "");
			htmlLines.push(
				`<blockquote><p>${formatInline(quoteContent)}</p></blockquote>`,
			);
			continue;
		}

		// 列表项
		if (/^[-*+]\s+/.test(trimmed)) {
			if (!inList) {
				htmlLines.push("<ul>");
				inList = true;
			}
			const itemText = trimmed.replace(/^[-*+]\s+/, "");
			htmlLines.push(`<li>${formatInline(itemText)}</li>`);
			continue;
		}

		// 分割线
		if (/^(\*\*\*|---|___)$/.test(trimmed)) {
			if (inList) {
				htmlLines.push("</ul>");
				inList = false;
			}
			htmlLines.push("<hr />");
			continue;
		}

		// 常规段落
		if (inList) {
			htmlLines.push("</ul>");
			inList = false;
		}
		htmlLines.push(`<p>${formatInline(trimmed)}</p>`);
	}

	if (inList) {
		htmlLines.push("</ul>");
	}

	return htmlLines.join("\n");
}

/**
 * 解析 Word (.docx) 文件为语义化 HTML
 */
export async function parseWordDocx(file: File): Promise<ParsedDocument> {
	const arrayBuffer = await file.arrayBuffer();
	const result = await mammoth.convertToHtml({ arrayBuffer });
	const title = file.name.replace(/\.[^.]+$/, "");
	return {
		title,
		html: result.value || `<p>${title}</p>`,
	};
}

/**
 * 解析 Excel (.xlsx / .xls / .csv) 表格文件为 HTML Table
 */
export async function parseExcelTable(file: File): Promise<ParsedDocument> {
	const arrayBuffer = await file.arrayBuffer();
	const workbook = XLSX.read(arrayBuffer, { type: "array" });
	const firstSheetName = workbook.SheetNames[0];
	if (!firstSheetName) {
		throw new Error("表格文件不包含有效工作表");
	}
	const worksheet = workbook.Sheets[firstSheetName];
	const tableHtml = XLSX.utils.sheet_to_html(worksheet);
	const title = file.name.replace(/\.[^.]+$/, "");
	return {
		title,
		html: tableHtml,
	};
}

/**
 * 解析 PDF 文件中的正文文本（对齐 editor-plan.md 规划：定位「提取正文内容」）
 */
export async function parsePdfText(file: File): Promise<ParsedDocument> {
	const pdfjs = await import("pdfjs-dist");
	// 配置官方 cdn worker 路径以兼容浏览器环境
	if (!pdfjs.GlobalWorkerOptions.workerSrc) {
		pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version || "4.0.0"}/build/pdf.worker.min.mjs`;
	}

	const arrayBuffer = await file.arrayBuffer();
	const loadingTask = pdfjs.getDocument({
		data: arrayBuffer,
		useSystemFonts: true,
	});
	const pdf = await loadingTask.promise;
	const paragraphs: string[] = [];

	for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
		const page = await pdf.getPage(pageNum);
		const textContent = await page.getTextContent();
		const pageText = textContent.items
			.map((item) => ("str" in item ? item.str : ""))
			.join(" ")
			.trim();

		if (pageText) {
			// 按换行或句号拆分大段
			const parts = pageText
				.split(/(?<=[。！？\n])/)
				.map((p) => p.trim())
				.filter(Boolean);
			for (const part of parts) {
				paragraphs.push(`<p>${part}</p>`);
			}
		}
	}

	const title = file.name.replace(/\.[^.]+$/, "");
	return {
		title,
		html:
			paragraphs.length > 0
				? paragraphs.join("\n")
				: `<p>（未能从 ${title} 中提取到可读文本）</p>`,
	};
}
