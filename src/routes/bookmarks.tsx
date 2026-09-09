import { createFileRoute } from "@tanstack/react-router";
import { WorkbenchApp, WorkbenchSkeleton } from "../components/workbench";
import { workbenchLoader } from "./-workbenchLoader";

export const Route = createFileRoute("/bookmarks")({
	loader: workbenchLoader,
	pendingComponent: WorkbenchSkeleton,
	pendingMs: 200,
	component: BookmarksPage,
});

/** 书签模块：全量书签浏览（分类筛选条：全部/未分类/自定义分组） */
function BookmarksPage() {
	const initialData = Route.useLoaderData();
	return <WorkbenchApp initialData={initialData} showCategoryFilter />;
}
