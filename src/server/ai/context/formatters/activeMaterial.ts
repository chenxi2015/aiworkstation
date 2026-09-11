import { workbenchDb } from "../../../db/sqlite.ts";

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
	const preview = (material.content || "").slice(0, 1000) || "(空素材/暂无正文)";
	const previewSuffix = contentLength > 1000 ? `\n…（共 ${contentLength} 字）` : "";

	return `\n- 【当前选中的自媒体二创素材（用户当前屏幕聚焦，最高优先级）】:
  - 素材 ID: ${material.id}
  - 标题: 《${material.title}》
  - 状态: ${material.status} | 来源: ${material.sourceType}
  - 批注/要点: ${material.note || "无额外批注"}
  - 正文摘要预览:
"""
${preview}${previewSuffix}
"""
  💡 提示：用户的提问默认针对此篇素材展开。你可以直接参考上述正文或批注进行二创、润色、改写与问答。
  ⚠️ 核心约束：本素材由系统内置 SQLite 数据库托管，【磁盘中不存在任何对应的文件路径】！严禁猜测路径或调用文件系统工具寻找素材！`;
}
