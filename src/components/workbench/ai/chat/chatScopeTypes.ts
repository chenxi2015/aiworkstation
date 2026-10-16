import type { ComponentType } from "react";

/**
 * 当前聊天作用域对象（当前文档/笔记/素材/文件夹）。
 * 曾由 ChatScopePill 以「全局 ⇄ 限定」开关呈现，现改为输入框上方内建 chip 表达：
 * isActive 时合成 chip，× 掉即 detach。
 */
export interface ActiveChatScope {
	type: "folder" | "document" | "material" | "note" | string;
	name: string;
	isActive: boolean;
	icon?: ComponentType<{ className?: string }>;
	/** Vault-relative note path when type === 'note' */
	notePath?: string;
	/** Document ID when type === 'document' */
	documentId?: number;
	/** Material ID when type === 'material' */
	materialId?: number;
	/** Folder ID when type === 'folder' */
	folderId?: number;
}
