/**
 * Skills 扫描器：读取本机散落的 skill 根目录，解析每个 SKILL.md 的
 * YAML frontmatter（仅取扁平字段：name/description/license + metadata.version/author），
 * 并统计目录文件数与体积。
 *
 * 模块拆分：roots(根目录清单) / scanCore(发现与统计) / overview(聚合并缓存) /
 * detail(单 skill 详情) / resource(资源文件读取) / contextBundle(AI 上下文注入) /
 * urlIntercept(外链拦截)。公共 API 统一由此导出。
 */
export {
	loadSkillContextBundle,
	type SkillContextBundle,
} from "./contextBundle.ts";
export { readSkillDetail } from "./detail.ts";
export { scanSkillsOverview } from "./overview.ts";
export { readSkillResourceFile, resolveSkillDir } from "./resource.ts";
export { tryInterceptSkillUrl } from "./urlIntercept.ts";
