import { workbenchDb } from "../../../db/sqlite.ts";
import { resolveAssetAbsPath } from "../../../services/filesRoot.ts";

/**
 * Build a detailed active-material context block for injection into the system prompt.
 * Returns empty string when no activeMaterialId is provided or material is not found.
 */
export function resolveActiveMaterialPrompt(
	activeMaterialId: number | undefined | null,
): string {
	if (!activeMaterialId) return "";

	const material = workbenchDb.getMaterial(activeMaterialId);
	if (!material) return "";

	const contentLength = material.content?.length ?? 0;
	const preview =
		(material.content || "").slice(1000) ? (material.content || "").slice(0, 1000) : (material.content || "(空素材/暂无正文)");
	const previewSuffix =
		contentLength > 1000 ? `\n…（共 ${contentLength} 字）` : "";

	const assetLines: string[] = [];
	if (material.assets && material.assets.length > 0) {
		for (const asset of material.assets) {
			const absPath = resolveAssetAbsPath(asset);
			const sizeStr = asset.sizeBytes
				? ` (${(asset.sizeBytes / (1024 * 1024)).toFixed(1)} MB)`
				: "";
			if (absPath) {
				assetLines.push(
					`    * 本地媒体绝对路径: \`${absPath}\` [类型: ${asset.kind}, 文件名: ${asset.filename}${sizeStr}]`,
				);
			} else if (asset.sourcePath) {
				assetLines.push(
					`    * 关联外部路径: \`${asset.sourcePath}\` [类型: ${asset.kind}]`,
				);
			}
		}
	}

	const pathSection =
		assetLines.length > 0
			? `  - 关联本地物理媒体文件（音视频提取/转录/处理请直接使用，严禁全盘盲搜）:\n${assetLines.join("\n")}`
			: "  - 存储方式: 本地 SQLite 数据库托管，无独立磁盘媒体文件";

	const constraintLine =
		assetLines.length > 0
			? "  💡 本地工具调用提示：本素材关联真实物理文件，若执行音视频转录（如 Whisper）、ffmpeg 剪辑或代码处理，直接使用上述本地绝对路径即可！"
			: "  ⚠️ 核心约束：本素材为纯文本条目，由系统内置 SQLite 数据库托管，磁盘中不存在对应的文件路径，严禁猜测路径或调用文件系统工具寻找素材！";

	return `\n- 【当前选中的创作二创素材（用户当前屏幕聚焦，最高优先级）】:
  - 素材 ID: ${material.id}
  - 标题: 《${material.title}》
  - 状态: ${material.status} | 来源: ${material.sourceType}
  - 批注/要点: ${material.note || "无额外批注"}
${pathSection}
  - 正文摘要预览:
"""
${preview}${previewSuffix}
"""
  💡 提示：用户的提问默认针对此篇素材展开。你可以直接参考上述正文或批注进行二创、润色、改写与问答。
${constraintLine}`;
}
