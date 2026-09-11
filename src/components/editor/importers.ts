import mammoth from "mammoth";
import { marked, Renderer } from "marked";
import * as XLSX from "xlsx";

export interface ParsedDocument {
	title: string;
	html: string;
}

/**
 * Extract video URL from string if it represents a video link or markdown video tag
 */
export function extractVideoUrl(str: string): string | null {
	const s = str.trim();
	// 1. Markdown video syntax: 🎥 [演示视频](url), [▶ 视频](url), [视频](url), ![video](url)
	const mdMatch = s.match(
		/^(?:🎥\s*)?(?:\[(?:▶\s*|🎥\s*)?(?:.*?视频|video).*?\]|!\[(?:video|视频).*?\])\(((?:https?:\/\/|\/api\/files\/)[^\s)]+)\)$/i,
	);
	if (mdMatch) return mdMatch[1];

	// 2. Native HTML <video src="..."> tag
	const htmlMatch = s.match(
		/<video[^>]+src=["']((?:https?:\/\/|\/api\/files\/)[^"']+)["']/i,
	);
	if (htmlMatch) return htmlMatch[1];

	// 3. Standalone video URL (mp4, webm, ogg, mov, m4v, mkv, flv)
	const urlMatch = s.match(
		/^((?:https?:\/\/|\/api\/files\/)[^\s]+\.(?:mp4|webm|ogg|mov|m4v|mkv|flv)(?:\?[^\s]*)?(?:#[^\s]*)?)$/i,
	);
	if (urlMatch) return urlMatch[1];

	return null;
}

/**
 * Extract image URL from string if it represents an image link, data URL or markdown image tag
 */
export function extractImageUrl(str: string): string | null {
	const s = str.trim();
	// 1. Data URL
	if (/^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/i.test(s)) {
		return s;
	}

	// 2. Markdown image syntax: ![alt](url)
	const mdMatch = s.match(
		/^!\[.*?\]\(((?:https?:\/\/|\/api\/files\/)[^\s)]+)\)$/i,
	);
	if (mdMatch) return mdMatch[1];

	// 3. Standalone image URL (png, jpg, jpeg, gif, webp, svg, bmp, avif)
	const urlMatch = s.match(
		/^((?:https?:\/\/|\/api\/files\/)[^\s]+\.(?:png|jpe?g|gif|webp|svg|bmp|avif)(?:\?[^\s]*)?(?:#[^\s]*)?)$/i,
	);
	if (urlMatch) return urlMatch[1];

	return null;
}

/**
 * Markdown → HTML（via marked，GFM 模式）
 * 视频链接单独用自定义 Renderer 渲染为 <video> 标签。
 */
export function markdownToHtml(md: string): string {
	if (!md) return "";

	const renderer = new Renderer();

	// Intercept image rendering: video links → <video>, rest → <img>
	renderer.image = ({ href, text }) => {
		const videoUrl = extractVideoUrl(href ?? "");
		if (videoUrl) {
			return `<div class="ast-video-card my-3"><video src="${videoUrl}" controls preload="metadata" referrerpolicy="no-referrer"></video></div>`;
		}
		return `<img src="${href}" alt="${text}" referrerpolicy="no-referrer" />`;
	};

	// Intercept link rendering: video links → <video>, rest → <a>
	renderer.link = ({ href, text }) => {
		const videoUrl = extractVideoUrl(href ?? "");
		if (videoUrl) {
			return `<div class="ast-video-card my-3"><video src="${videoUrl}" controls preload="metadata" referrerpolicy="no-referrer"></video></div>`;
		}
		return `<a href="${href}">${text}</a>`;
	};

	return marked(md, { renderer, gfm: true, breaks: false }) as string;
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
