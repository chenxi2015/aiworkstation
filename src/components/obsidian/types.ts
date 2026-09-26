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
	/** 当前打开的文件是否为 Canvas 白板 */
	isCanvas?: () => boolean;
	/** 白板操作句柄（仅在打开 .canvas 文件且处于可视视图时生效） */
	canvasApi?: ObsidianCanvasApi;
}

/**
 * 白板操作句柄（AI 侧边栏实时写入与渲染使用）
 */
export interface ObsidianCanvasApi {
	/** 批量添加节点与连线，自动排版并平滑聚焦 */
	addElements: (params: {
		nodes: Array<{
			id: string;
			type?: "text" | "file" | "group";
			text?: string;
			file?: string;
			label?: string;
			color?: "1" | "2" | "3" | "4" | "5" | "6";
		}>;
		edges?: Array<{
			fromNode: string;
			toNode: string;
			label?: string;
			color?: "1" | "2" | "3" | "4" | "5" | "6";
			toEnd?: "arrow" | "none";
		}>;
		groups?: Array<{
			id?: string;
			label: string;
			nodeIds: string[];
			color?: "1" | "2" | "3" | "4" | "5" | "6";
		}>;
		layout?: "horizontal_tree" | "vertical_tree" | "grid" | "free";
		referenceNodeId?: string;
	}) => boolean;
	/** 为指定的若干节点创建分组框，自动计算包围盒与内边距 */
	createGroup: (params: {
		label: string;
		nodeIds: string[];
		color?: "1" | "2" | "3" | "4" | "5" | "6";
	}) => boolean;
	/** 更新指定卡片的内容或样式 */
	updateNode: (
		id: string,
		updates: { text?: string; color?: "1" | "2" | "3" | "4" | "5" | "6" },
	) => boolean;
	/** 对现有白板进行几何规整（标准化尺寸、对齐网格、优化连线） */
	tidyLayout: (options?: {
		layout?: "horizontal_tree" | "vertical_tree" | "grid" | "compact";
		standardizeWidth?: boolean;
		alignHandles?: boolean;
		targetNodeIds?: string[];
	}) => boolean;
}


