import type { ChatContextItem } from "../../../../../types/chatContext";
import type { MaterialKind } from "../../../../creator/materials/types";
import {
	formatBytes,
	getAssetMediaUrl,
	getImageAssets,
	getMaterialKind,
} from "../../../../creator/materials/utils";
import type { Material } from "../../../../creator/types";

/**
 * Formats a clean brief description without system boilerplate text.
 */
export function getMaterialBrief(
	m: Material,
	kind: MaterialKind,
): { text: string; isNote: boolean } {
	if (m.note?.trim()) {
		return { text: `批注：${m.note.trim()}`, isNote: true };
	}

	const raw = (m.content || "").trim();

	// Match system auto-generated boilerplate: "文件素材：xxx (size)，原位引用自：path"
	const match = raw.match(
		/^文件素材：.*?(?:\((.*?)\))?.*?(?:原位引用自：(.*?))?$/,
	);
	if (match) {
		const sizeStr = match[1]?.trim();
		const ext = m.title.split(".").pop()?.toUpperCase();
		if (kind === "image") {
			return {
				text: sizeStr
					? `${ext || "图片"} · ${sizeStr}`
					: `${ext || "图片"} 资产`,
				isNote: false,
			};
		}
		if (kind === "video") {
			return {
				text: sizeStr
					? `${ext || "视频"} 视频 · ${sizeStr}`
					: `${ext || "视频"} 素材`,
				isNote: false,
			};
		}
		if (kind === "audio") {
			return {
				text: sizeStr
					? `${ext || "音频"} 音频 · ${sizeStr}`
					: `${ext || "音频"} 素材`,
				isNote: false,
			};
		}
	}

	if (kind === "image" || kind === "video" || kind === "audio") {
		const size = formatBytes(m.assets?.[0]?.sizeBytes);
		const ext = m.title.split(".").pop()?.toUpperCase();
		const label =
			kind === "image" ? "图片" : kind === "video" ? "视频" : "音频";
		return {
			text: size ? `${ext || label} · ${size}` : `${ext || label} 资产`,
			isNote: false,
		};
	}

	if (kind === "bookmark") {
		return {
			text: raw ? raw.slice(0, 100) : "书签链接",
			isNote: false,
		};
	}

	return {
		text: raw ? raw.slice(0, 100) : "(无正文内容)",
		isNote: false,
	};
}

/**
 * Formats a concise metadata line: folder, character count (docs only), and date.
 */
export function getMaterialMetaText(
	m: Material,
	kind: MaterialKind,
	folderName?: string,
): string {
	const parts: string[] = [];
	parts.push(folderName || "未归档");

	if (kind === "doc") {
		const len = (m.content || "").length;
		if (len > 0) parts.push(`${len} 字`);
	}

	const date = (m.updatedAt || m.createdAt || "").slice(0, 10);
	if (date) parts.push(date);

	return parts.join(" · ");
}

/**
 * Converts a Material entity into a normalized ChatContextItem.
 * Carries primary asset file path and media metadata.
 */
export function toMaterialContextItem(
	m: Material,
	folderName?: string,
): ChatContextItem {
	const kind = getMaterialKind(m);
	let thumbnail: string | undefined;
	if (kind === "image") {
		const imgAsset = getImageAssets(m)[0];
		if (imgAsset) {
			thumbnail = getAssetMediaUrl(imgAsset);
		}
	}
	const primaryAsset = m.assets?.[0];
	const primaryPath = primaryAsset?.sourcePath || undefined;

	return {
		id: `material_${m.id}`,
		type: "material",
		title: m.title,
		subtitle: folderName ?? m.sourceType,
		materialId: m.id,
		filePath: primaryPath,
		thumbnail,
		data: {
			materialKind: kind,
			filePath: primaryPath,
		},
	};
}

