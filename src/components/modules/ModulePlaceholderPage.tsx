import { getModuleByCode, type NavLayoutEntry } from "../../modules/registry";
import { WorkbenchHeader } from "../workbench/layout/WorkbenchHeader";

export interface ModulePlaceholderPageProps {
	moduleCode: string;
	unclassifiedCount: number;
	navLayout?: NavLayoutEntry[];
}

/** 各模块的规划功能要点（占位页展示） */
const MODULE_PLANS: Record<string, string[]> = {
	creator: [
		"采集：插件抓取推文/小红书/公众号内容入库",
		"二创：AI 批量生成回复草稿与二创文案",
		"审稿：草稿箱人工过一遍，确认后一键分发",
	],
	learn: [
		"将文件夹分类设为 learn 即可把资源挂靠到本模块",
		"学习计划与进度跟踪（规划中）",
	],
	editor: [
		"Markdown 编辑与实时预览操作台（规划中）",
		"文本片段管理与版本对比（规划中）",
	],
	ecommerce: [
		"将文件夹分类设为 ecommerce 即可把资源挂靠到本模块",
		"选品与运营工作流（规划中）",
	],
};

/**
 * Placeholder for module routes whose dedicated features are still planned.
 * Keeps the global module navigation so wayfinding stays consistent.
 */
export function ModulePlaceholderPage({
	moduleCode,
	unclassifiedCount,
	navLayout,
}: ModulePlaceholderPageProps) {
	const module = getModuleByCode(moduleCode);
	if (!module) return null;
	const Icon = module.icon;
	const plans = MODULE_PLANS[moduleCode] ?? [];

	return (
		<div className="h-screen bg-surface dark:bg-background text-foreground flex flex-col overflow-hidden">
			<WorkbenchHeader
				unclassifiedCount={unclassifiedCount}
				navLayout={navLayout}
			/>
			<main className="flex-1 flex items-center justify-center p-8 overflow-y-auto">
				<div className="max-w-md w-full rounded-2xl border border-border bg-surface-secondary/40 p-8 text-center shadow-xs">
					<div className="w-14 h-14 rounded-2xl bg-accent-soft text-accent flex items-center justify-center mx-auto mb-4">
						<Icon className="w-7 h-7" />
					</div>
					<h1 className="text-xl font-bold tracking-tight text-foreground">
						{module.label}
					</h1>
					<p className="text-xs text-muted mt-2 leading-relaxed">
						{module.description}
					</p>
					{plans.length > 0 && (
						<ul className="mt-5 space-y-2 text-left">
							{plans.map((plan) => (
								<li
									key={plan}
									className="flex items-start gap-2 text-xs text-foreground/80 leading-relaxed"
								>
									<span className="mt-1.5 h-1 w-1 rounded-full bg-accent shrink-0" />
									<span>{plan}</span>
								</li>
							))}
						</ul>
					)}
					<p className="mt-6 text-[11px] text-muted font-mono">
						category = {module.code} · 模块功能建设中
					</p>
				</div>
			</main>
		</div>
	);
}
