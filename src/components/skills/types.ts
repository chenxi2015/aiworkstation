/**
 * Skills 模块共享类型（Server Functions 与 UI 共用）
 */

/** 单个 skill 目录的扫描结果 */
export interface SkillInfo {
	/** frontmatter name，缺省回退目录名 */
	name: string;
	/** frontmatter description */
	description: string;
	version?: string;
	author?: string;
	license?: string;
	/** 目录名（如 "archify"） */
	dirName: string;
	/** skill 目录绝对路径 */
	dirPath: string;
	/** 所属根目录绝对路径 */
	rootPath: string;
	/** 所属根目录展示名（Codex / Agents / Claude） */
	rootLabel: string;
	fileCount: number;
	sizeBytes: number;
	/** 目录内最新文件修改时间（ms epoch） */
	modifiedAt: number;
	hasSkillMd: boolean;
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
