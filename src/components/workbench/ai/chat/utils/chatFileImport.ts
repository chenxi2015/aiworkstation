import { formatBytes } from "../../../../creator/materials/utils";
import {
	parseExcelTable,
	parsePdfText,
	parseWordDocx,
} from "../../../../editor/importers";
import type { ChatContextItem } from "../../../../../types/chatContext";
import { createChatImageContextItem } from "./chatImageCompress";

/**
 * Supported plain text and code file extensions.
 */
const TEXT_DOC_EXTENSIONS = new Set([
	"txt",
	"md",
	"markdown",
	"csv",
	"json",
	"log",
	"yaml",
	"yml",
	"xml",
	"html",
	"css",
	"ts",
	"tsx",
	"js",
	"jsx",
	"py",
	"sql",
	"sh",
	"env",
	"ini",
	"properties",
]);

/**
 * Rich document formats requiring dedicated parsers.
 */
const RICH_DOC_EXTENSIONS = new Set(["docx", "pdf", "xlsx", "xls"]);

/**
 * Visual canvas and diagram extensions.
 */
const BOARD_DOC_EXTENSIONS = new Set(["canvas", "excalidraw"]);

/**
 * Media extensions that cannot be parsed by text/vision models without pipeline transcoding.
 */
const MEDIA_EXTS = new Set([
	"mp4",
	"mov",
	"avi",
	"mkv",
	"webm",
	"flv",
	"m4v",
	"wmv",
	"mp3",
	"wav",
	"m4a",
	"aac",
	"flac",
	"ogg",
	"wma",
]);

/**
 * Compressed archive extensions.
 */
const ARCHIVE_EXTS = new Set(["zip", "rar", "7z", "tar", "gz", "bz2"]);

/**
 * Executable and OS binary package extensions.
 */
const BINARY_EXEC_EXTS = new Set([
	"exe",
	"dmg",
	"pkg",
	"bin",
	"iso",
	"apk",
	"ipa",
]);

/**
 * Maximum character count to inject into prompt per document.
 */
const DOC_TEXT_PREVIEW_LIMIT = 20_000;

/**
 * Extracts plain text from HTML string.
 */
function htmlToPlainText(html: string): string {
	if (typeof window === "undefined") return html;
	const div = document.createElement("div");
	div.innerHTML = html;
	return (div.textContent || "").replace(/\s+\n/g, "\n").trim();
}

/**
 * Extracts file extension in lowercase.
 */
export function getExtension(name: string): string {
	const idx = name.lastIndexOf(".");
	return idx >= 0 ? name.slice(idx + 1).toLowerCase() : "";
}

/**
 * Returns a human-friendly reason why a given file format is not supported.
 */
export function getUnsupportedFileReason(file: File): string {
	const ext = getExtension(file.name);
	if (
		file.type.startsWith("audio/") ||
		file.type.startsWith("video/") ||
		MEDIA_EXTS.has(ext)
	) {
		return `暂不支持解析「${file.name}」音视频文件。大模型无法直接读取音视频数据，建议上传文稿、笔记或截取关键画面图片。`;
	}
	if (ARCHIVE_EXTS.has(ext)) {
		return `暂不支持压缩包「${file.name}」。请先解压，直接上传其中的文档、笔记或图片。`;
	}
	if (BINARY_EXEC_EXTS.has(ext)) {
		return `暂不支持程序安装包或系统镜像「${file.name}」。`;
	}
	if (ext === "doc") {
		return `旧版二进制 .doc 格式暂不支持，请先另存为 .docx 或导出为 PDF 后上传。`;
	}
	return `「${file.name}」格式暂不支持（当前支持：图片、Word/PDF/Excel、Markdown、Canvas/Excalidraw 画板、代码与纯文本）。`;
}

/**
 * Checks whether a file can be imported into the chat context.
 */
export function isImportableChatFile(file: File): boolean {
	if (file.type.startsWith("image/")) return true;
	const ext = getExtension(file.name);
	if (
		file.type.startsWith("audio/") ||
		file.type.startsWith("video/") ||
		MEDIA_EXTS.has(ext) ||
		ARCHIVE_EXTS.has(ext) ||
		BINARY_EXEC_EXTS.has(ext) ||
		ext === "doc"
	) {
		return false;
	}
	return (
		TEXT_DOC_EXTENSIONS.has(ext) ||
		RICH_DOC_EXTENSIONS.has(ext) ||
		BOARD_DOC_EXTENSIONS.has(ext) ||
		file.name.endsWith(".excalidraw.md")
	);
}

/**
 * Parses Obsidian Canvas JSON into a structured Markdown summary.
 */
function parseCanvasText(rawText: string, fileName: string): string {
	try {
		const raw = JSON.parse(rawText || "{}");
		const nodes = Array.isArray(raw.nodes) ? raw.nodes : [];
		const edges = Array.isArray(raw.edges) ? raw.edges : [];

		const nodeLines = nodes.slice(0, 60).map((n: any, idx: number) => {
			const label = n.label ? `[分组: ${n.label}] ` : "";
			const file = n.file ? `[关联笔记: ${n.file}] ` : "";
			const url = n.url ? `[网址: ${n.url}] ` : "";
			let text = n.text || "";
			if (text.length > 120) {
				text = `${text.slice(0, 120)}...`;
			}
			const summary = (label + file + url + text).trim() || "(空卡片)";
			return `  ${idx + 1}. [节点 ${n.id || idx + 1}] (${n.type || "card"}): ${summary}`;
		});

		const edgeLines = edges.slice(0, 60).map((e: any) => {
			const label = e.label ? ` ──(${e.label})──> ` : " ──> ";
			return `  - [${e.fromNode || "起点"}]${label}[${e.toNode || "终点"}]`;
		});

		return [
			`### 【Obsidian Canvas 画板结构: 《${fileName}》】`,
			`统计: 共 ${nodes.length} 个节点卡片，${edges.length} 条逻辑连线`,
			"",
			"#### 节点卡片内容列表:",
			nodeLines.length > 0 ? nodeLines.join("\n") : "  (画板暂无节点)",
			"",
			"#### 节点拓扑连线流向:",
			edgeLines.length > 0 ? edgeLines.join("\n") : "  (画板暂无连线)",
		].join("\n");
	} catch {
		return `【Obsidian Canvas 白板: 《${fileName}》】(保留原始文本前 2000 字):\n${rawText.slice(0, 2000)}`;
	}
}

/**
 * Parses Excalidraw scene JSON into a structured Markdown diagram summary.
 */
function parseExcalidrawText(rawText: string, fileName: string): string {
	try {
		let jsonContent = rawText;
		const match = rawText.match(/```json\s*([\s\S]*?)\s*```/);
		if (match) {
			jsonContent = match[1];
		}

		const raw = JSON.parse(jsonContent || "{}");
		const elements = Array.isArray(raw.elements)
			? raw.elements.filter((el: any) => !el.isDeleted)
			: [];

		const shapes = elements.filter(
			(el: any) => el.type !== "arrow" && el.type !== "line",
		);
		const arrows = elements.filter((el: any) => el.type === "arrow");

		const shapeLines = shapes.slice(0, 60).map((el: any, idx: number) => {
			const label = el.text || el.label?.text || "";
			const preview = label
				? `「${label.length > 80 ? `${label.slice(0, 80)}...` : label}」`
				: "(图形/无文本)";
			return `  ${idx + 1}. [${el.type || "shape"} ${el.id || idx + 1}]: ${preview}`;
		});

		const arrowLines = arrows.slice(0, 50).map((arr: any) => {
			const from = arr.start?.id ? `[${arr.start.id}]` : "起点";
			const to = arr.end?.id ? `[${arr.end.id}]` : "终点";
			const label = arr.label?.text ? ` (标注: ${arr.label.text})` : "";
			return `  - ${from} -> ${to}${label}`;
		});

		return [
			`### 【Excalidraw 手绘图板结构: 《${fileName}》】`,
			`统计: 共 ${elements.length} 个元素（${shapes.length} 个图形/文本框，${arrows.length} 条关系箭头）`,
			"",
			"#### 图形与文本元素内容:",
			shapeLines.length > 0 ? shapeLines.join("\n") : "  (画板暂无图形元素)",
			"",
			"#### 箭头流程与连线关系:",
			arrowLines.length > 0 ? arrowLines.join("\n") : "  (画板暂无连线)",
		].join("\n");
	} catch {
		return `【Excalidraw 画板: 《${fileName}》】(解析异常，保留前 2000 字内容):\n${rawText.slice(0, 2000)}`;
	}
}

/**
 * Extracts plain text or structured Markdown from supported document files.
 */
async function extractDocumentText(file: File): Promise<string> {
	const ext = getExtension(file.name);

	if (ext === "canvas") {
		const raw = (await file.text()).trim();
		return parseCanvasText(raw, file.name);
	}
	if (ext === "excalidraw" || file.name.endsWith(".excalidraw.md")) {
		const raw = (await file.text()).trim();
		return parseExcalidrawText(raw, file.name);
	}
	if (TEXT_DOC_EXTENSIONS.has(ext)) {
		return (await file.text()).trim();
	}
	if (ext === "docx") {
		return htmlToPlainText((await parseWordDocx(file)).html);
	}
	if (ext === "pdf") {
		return htmlToPlainText((await parsePdfText(file)).html);
	}
	if (ext === "xlsx" || ext === "xls" || ext === "csv") {
		return htmlToPlainText((await parseExcelTable(file)).html);
	}
	throw new Error(`暂不支持的文档格式：.${ext}`);
}

/**
 * Transforms a local file into a chat context item.
 * - Images -> compressed base64 data URI image chip (vision model input)
 * - Documents/Notes/Canvases -> extracted plain text/markdown file chip
 * - Unsupported formats -> returns null
 */
export async function importChatFile(
	file: File,
	seq: number,
): Promise<ChatContextItem | null> {
	if (file.type.startsWith("image/")) {
		return createChatImageContextItem(file, seq);
	}
	if (!isImportableChatFile(file)) {
		return null;
	}

	const text = await extractDocumentText(file);
	const truncated = text.slice(0, DOC_TEXT_PREVIEW_LIMIT);
	const suffix =
		text.length > DOC_TEXT_PREVIEW_LIMIT
			? `\n…（共 ${text.length} 字，已截取前 ${DOC_TEXT_PREVIEW_LIMIT} 字）`
			: "";

	return {
		id: `file_${Date.now()}_${seq}`,
		type: "file",
		title: file.name,
		subtitle: `${formatBytes(file.size)} · ${text.length} 字`,
		data: {
			contentPreview: truncated + suffix,
			fileSize: file.size,
			charCount: text.length,
		},
	};
}
