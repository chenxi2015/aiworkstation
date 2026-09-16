import { createFileRoute } from "@tanstack/react-router";
import { DashboardApp } from "../components/dashboard/DashboardApp";
import { DashboardSkeleton } from "../components/workbench/skeletons";
import { getWorkbenchSummary } from "../server/functions/dashboard";
import { workbenchLoader } from "./-workbenchLoader";

export const Route = createFileRoute("/workbench")({
	loader: async () => {
		const [base, summary] = await Promise.all([
			workbenchLoader(),
			getWorkbenchSummary(),
		]);
		return { ...base, summary };
	},
	pendingComponent: DashboardSkeleton,
	pendingMs: 200,
	component: WorkbenchPage,
});

/** 工作台模块：跨模块汇总的可自定义仪表盘（widget 注册表见 src/modules/widgetRegistry.ts） */
function WorkbenchPage() {
	const { settings, unclassified, folders, summary } = Route.useLoaderData();
	return (
		<DashboardApp
			settings={settings}
			unclassified={unclassified}
			folders={folders}
			summary={summary}
		/>
	);
}
