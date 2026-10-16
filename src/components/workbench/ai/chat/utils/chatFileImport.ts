import { formatBytes } from "../../../../creator/materials/utils";
import {
	parseExcelTable,
	parsePdfText,
	parseWordDocx,
} from "../../../../editor/importers";
import type { ChatContextItem } from "../../../../../types/chatContext";

/**
 * 素材库导入支持的文档扩展名（模型可消费为纯文本的类型）。
 * 音频/视频刻意不支持：当前走 OpenAI 兼容 chat 协议，消息体没有音/视频输入段，
 * 且本地无 ASR 转写流水线，导入后模型也无法读取内容。
 */
const TEXT_DOC_EXTENSIONS = new Set([
	"txt",
	"md",
	"markdown",
	"csv",
	"json",
	"log",
]);

const RICH_DOC_EXTENSIONS = new Set(["docx", "pdf", "xlsx", "xls"]);

/** 单个文档注入 prompt 的文本上限（防止超大文档撑爆上下文窗口） */
const DOC_TEXT_PREVIEW_LIMIT = 20_000;

/** 从 HTML 提取纯文本（用于 docx/xlsx/pdf 解析结果） */
function htmlToPlainText(html: string): string {
	if (typeof window === "undefined") return html;
	const div = document.createElement("div");
	div.innerHTML = html;
	return (div.textContent || "").replace(/\s+\n/g, "\n").trim();
}

function getExtension(name: string): string {
	const idx = name.lastIndexOf(".");
	return idx >= 0 ? name.slice(idx + 1).toLowerCase() : "";
}

/** 判断文件是否为可导入的素材（图片或文档；音视频返回 false） */
export function isImportableChatFile(file: File): boolean {
	if (file.type.startsWith("image/")) return true;
	if (file.type.startsWith("audio/") || file.type.startsWith("video/"))
		return false;
	const ext = getExtension(file.name);
	return TEXT_DOC_EXTENSIONS.has(ext) || RICH_DOC_EXTENSIONS.has(ext);
}

/** 读取图片为 base64 dataURL（沿用现有图片附件通道） */
function readImageAsContextItem(
	file: File,
	seq: number,
): Promise<ChatContextItem> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () =>
			resolve({
				id: `img_${Date.now()}_${seq}`,
				type: "image",
				title: file.name,
				subtitle: formatBytes(file.size),
				thumbnail: reader.result as string,
			});
		reader.onerror = () => reject(new Error(`读取图片失败：${file.name}`));
		reader.readAsDataURL(file);
	});
}

/** 提取文档纯文本（txt/md 直读；docx/pdf/xlsx 走现有 importers） */
async function extractDocumentText(file: File): Promise<string> {
	const ext = getExtension(file.name);
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
 * 将本地文件转换为聊天上下文附件。
 * 图片 → image chip（base64 进模型视觉通道）；文档 → file chip（提取纯文本进 prompt）。
 * 音频/视频返回 null（由调用方 toast 说明不支持的原因）。
 */
export async function importChatFile(
	file: File,
	seq: number,
): Promise<ChatContextItem | null> {
	if (file.type.startsWith("image/")) {
		return readImageAsContextItem(file, seq);
	}
	if (file.type.startsWith("audio/") || file.type.startsWith("video/")) {
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
