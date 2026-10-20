import { createServerFn } from "@tanstack/react-start";
import type { EditorDocFolder } from "../../../components/editor/types.ts";
import { workbenchDb } from "../../db/sqlite.ts";

/**
 * Server Function: 文档文件夹列表（含每个文件夹的文档计数）
 */
export const listDocumentFolders = createServerFn({ method: "GET" }).handler(
	async (): Promise<EditorDocFolder[]> => {
		return workbenchDb.listDocumentFolders();
	},
);

/**
 * Server Function: 新建文档文件夹（排到列表最前）
 */
export const createDocumentFolder = createServerFn({ method: "POST" })
	.validator((data: { name?: string }) => data)
	.handler(async ({ data }): Promise<EditorDocFolder> => {
		const id = workbenchDb.createDocumentFolder(
			data.name?.trim() || "新建文件夹",
		);
		const folder = workbenchDb.listDocumentFolders().find((f) => f.id === id);
		if (!folder) throw new Error("文件夹创建失败");
		return folder;
	});

/**
 * Server Function: 重命名文档文件夹
 */
export const renameDocumentFolder = createServerFn({ method: "POST" })
	.validator((data: { id: number; name: string }) => data)
	.handler(async ({ data }): Promise<void> => {
		const name = data.name?.trim();
		if (!name) throw new Error("文件夹名称不能为空");
		workbenchDb.renameDocumentFolder(data.id, name);
	});

/**
 * Server Function: 删除文档文件夹（其中文档移回「全部」，不删文档本体）
 */
export const deleteDocumentFolder = createServerFn({ method: "POST" })
	.validator((data: { id: number }) => data)
	.handler(async ({ data }): Promise<void> => {
		workbenchDb.deleteDocumentFolder(data.id);
	});

/**
 * Server Function: 文件夹拖拽排序（按传入顺序重写 sort_order）
 */
export const reorderDocumentFolders = createServerFn({ method: "POST" })
	.validator((data: { orderedIds: number[] }) => data)
	.handler(async ({ data }): Promise<void> => {
		workbenchDb.reorderDocumentFolders(data.orderedIds);
	});

/**
 * Server Function: 移动文档到文件夹（folderId=null 移回「全部」）
 */
export const moveDocumentToFolder = createServerFn({ method: "POST" })
	.validator((data: { id: number; folderId: number | null }) => data)
	.handler(async ({ data }): Promise<void> => {
		if (!workbenchDb.getDocument(data.id)) throw new Error("文档不存在");
		workbenchDb.moveDocumentToFolder(data.id, data.folderId);
	});

