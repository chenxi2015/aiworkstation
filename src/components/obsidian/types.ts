/**
 * Obsidian 模块共享类型（Server Functions 与 UI 共用）
 *
 * 模块约定：Vault 目录是唯一事实源，不落库、不拷贝；
 * 目录结构即分类，Markdown 文件直接读写。
 */

/** Vault 根目录信息 */
export interface ObsidianVaultInfo {
	/** 展开后的绝对路径 */
	path: string;
	/** 设置中的原始配置值 */
	configured: string;
	exists: boolean;
	noteCount: number;
}

/** 目录树节点：文件夹或 Markdown 笔记 */
export interface ObsidianTreeNode {
	name: string;
	/** 相对 Vault 根目录的路径 */
	relPath: string;
	kind: "folder" | "note" | "file";
	/** 笔记字节数（文件夹为 0） */
	size: number;
	/** 修改时间（ms epoch） */
	mtime: number;
	children?: ObsidianTreeNode[];
}

export interface ObsidianTree {
	vault: ObsidianVaultInfo;
	tree: ObsidianTreeNode[];
	scannedAt: number;
}

/** 笔记全文（mtime 为冲突检测基线） */
export interface ObsidianNoteContent {
	relPath: string;
	name: string;
	content: string;
	size: number;
	mtime: number;
	truncated: boolean;
}

/** 保存结果：mtime 基线与磁盘不一致时 conflict=true */
export interface ObsidianSaveResult {
	success: boolean;
	conflict?: boolean;
	mtime?: number;
	/**
	 * git 式自动合并成功后的合并内容（base→theirs 的改动干净地合入 ours）。
	 * 存在时调用方需用其替换当前草稿。
	 */
	merged?: string;
	error?: string;
}

/** 增删改移动等结构操作的统一结果 */
export interface ObsidianMutationResult {
	success: boolean;
	relPath?: string;
	error?: string;
}

/**
 * 笔记面板向页面层暴露的操作句柄（AI 侧边栏桥接调用）
 * 写入经 CodeMirror 回流后由防抖自动保存落盘（mtime 乐观并发 + 三方合并）。
 */
export interface ObsidianNoteApi {
	getTitle: () => string | null;
	hasNote: () => boolean;
	getContent: () => string;
	/** 有未保存修改时先保存，保证 AI 读到的是最新内容 */
	flushSave: () => Promise<void>;
	/** 将 Markdown 追加到笔记末尾 */
	appendMarkdown: (md: string) => boolean;
	/** 用 Markdown 替换整篇笔记（调用方需先确认） */
	replaceMarkdown: (md: string) => boolean;
	/** 发起双栏通篇改写/创作流程 */
	onStartRewritePipeline?: (
		instruction?: string,
		modeLabel?: string,
	) => Promise<void>;
	/** 切换双栏比对视图 */
	toggleSplitCompare?: () => void;
	/** 撤销当前编辑 */
	undo?: () => boolean;
	/** 重做当前编辑 */
	redo?: () => boolean;
	/** 是否可撤销 */
	canUndo?: () => boolean;
	/** 是否可重做 */
	canRedo?: () => boolean;
}
