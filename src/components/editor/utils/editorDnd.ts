/**
 * 编辑器三栏布局的拖拽 id 与 payload 约定。
 * 前缀 ed- 避免与工作台网格（folder:/item:）的拖拽 id 冲突。
 */

export const EDITOR_ALL_DROP_ID = "edfolder:all";

/** 实体类型：配合 droppable 的 accept 做类型级互斥（比 group 更强的隔离） */
export const EDITOR_FOLDER_TYPE = "editor-folder";
export const EDITOR_DOC_TYPE = "editor-doc";

export const editorFolderRowId = (folderId: number) => `edfolder:${folderId}`;
export const editorDocRowId = (docId: number) => `eddoc:${docId}`;

export type EditorFolderDragData = {
	kind: "editor-folder";
	folderId: number;
};

export type EditorDocDragData = {
	kind: "editor-doc";
	docId: number;
	/** 拖拽源所在文件夹（null = 全部/未归档） */
	folderId: number | null;
};

export type EditorDragData = EditorFolderDragData | EditorDocDragData;

/** 解析文件夹放置目标：文件夹 id / "all" / null（非文件夹目标） */
export function parseEditorFolderTarget(
	id: string | number | undefined,
): number | "all" | null {
	if (id === undefined) return null;
	const raw = String(id);
	if (raw === EDITOR_ALL_DROP_ID) return "all";
	if (raw.startsWith("edfolder:")) {
		const folderId = Number(raw.slice(9));
		return Number.isFinite(folderId) ? folderId : null;
	}
	return null;
}
