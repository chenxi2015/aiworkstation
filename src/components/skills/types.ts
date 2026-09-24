export type SkillViewMode = "grid" | "list";

export type SkillTab = "all" | "latest" | "alphabetical";

export type SkillInstallStatus =
	| "not_installed"
	| "installing"
	| "installed"
	| "uninstalling";

/** 单个 skill 目录或市场条目的元数据 */
export interface SkillInfo {
	/** 唯一标识 (如 "programming-expert" 或 dirName) */
	id?: string;
	/** frontmatter name，缺省回退目录名 */
	name: string;
	/** frontmatter description */
	description: string;
	version?: string;
	author?: string;
	license?: string;
	/** 目录名（如 "archify"） */
	dirName: string;
	/** skill 目录绝对路径（已安装时有效） */
	dirPath: string;
	/** 所属根目录绝对路径 */
	rootPath: string;
	/** 所属根目录展示名（Codex / Agents / Claude 等） */
	rootLabel: string;
	fileCount: number;
	sizeBytes: number;
	/** 目录内最新文件修改时间（ms epoch） */
	modifiedAt: number;
	hasSkillMd: boolean;

	// === 市场与界面增强属性 ===
	category?: string;
	source?: string;
	stars?: number;
	downloads?: string;
	verified?: boolean;
	needsApiKey?: boolean;
	iconBg?: string;
	iconText?: string;
	installed?: boolean;
	installStatus?: SkillInstallStatus;
	downloadUrl?: string;
}

/** 一个 skill 根目录的扫描结果 */
export interface SkillRootInfo {
	/** 展开后的绝对路径 */
	path: string;
	label: string;
	exists: boolean;
	skillCount: number;
}

export interface SkillsOverview {
	roots: SkillRootInfo[];
	skills: SkillInfo[];
	scannedAt: number;
}

/** skill 详情：SKILL.md 全文 + 文件清单 */
export interface SkillDetail {
	skill: SkillInfo;
	markdown: string | null;
	files: string[];
	/** 文件清单或正文是否被截断 */
	truncated: boolean;
}

export interface InstallSkillResult {
	success: boolean;
	message: string;
	dirPath?: string;
}

export interface UninstallSkillResult {
	success: boolean;
	message: string;
}
