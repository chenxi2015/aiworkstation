import { createFileRoute } from "@tanstack/react-router";
import { WorkbenchApp, WorkbenchSkeleton } from "../components/workbench";
import { workbenchLoader } from "./-workbenchLoader";

export const Route = createFileRoute("/workbench")({
	loader: workbenchLoader,
	pendingComponent: WorkbenchSkeleton,
	pendingMs: 200,
	component: WorkbenchPage,
});

/** 工作台模块：锁定 category=workbench 的文件夹视图（后续进化为可自定义仪表盘） */
function WorkbenchPage() {
	const initialData = Route.useLoaderData();
	return <WorkbenchApp initialData={initialData} fixedCategory="workbench" />;
}
