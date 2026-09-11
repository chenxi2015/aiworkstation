/**
 * Build the folder scope guidance injected into the system prompt.
 * Returns a newline-prefixed string ready to embed into a markdown prompt section.
 */
export function resolveFolderScopePrompt(
	folderId: number | null | undefined,
	folderName: string | undefined,
): string {
	if (folderId != null && folderName) {
		return `\n- 【当前问答限定范围】: 用户已启用【限定文件夹范围】模式，指定聚焦在文件夹「${folderName}」(ID: ${folderId})。除非用户在提问中明确要求跨文件夹或搜索全局，否则所有回答、盘点与分析请严格限制在该文件夹下的书签和资产；若调用 query_bookmarks 工具，请务必传入 folderName: "${folderName}" 或 folderId: ${folderId}。`;
	}
	return "\n- 【当前问答范围】: 全局知识库（涵盖所有文件夹及未分类书签）。";
}
