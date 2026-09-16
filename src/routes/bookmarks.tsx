import { createFileRoute } from "@tanstack/react-router";
import { WorkbenchApp, WorkbenchSkeleton } from "../components/workbench";
import { workbenchLoader } from "./-workbenchLoader";

/** 书签模块深链参数：从工作台仪表盘等入口定位到具体分类/文件夹/书签 */
export interface BookmarksSearch {
	/** 切换分类筛选（如「未分类」） */
	category?: string;
	/** 定位并进入指定文件夹 */
	folder?: number;
	/** 定位指定书签条目（自动找到所在文件夹并高亮） */
	item?: string;
	/** 直接打开死链巡检弹窗 */
	deadlinks?: boolean;
}

export const Route = createFileRoute("/bookmarks")({
	validateSearch: (search: Record<string, unknown>): BookmarksSearch => ({
		category:
			typeof search.category === "string" && search.category
				? search.category
				: undefined,
		folder:
			typeof search.folder === "number" && Number.isFinite(search.folder)
				? search.folder
				: undefined,
		item:
			typeof search.item === "string" && search.item
				? search.item
				: undefined,
		deadlinks: search.deadlinks === true ? true : undefined,
	}),
	loader: workbenchLoader,
	pendingComponent: WorkbenchSkeleton,
	pendingMs: 200,
	component: BookmarksPage,
});

/** 书签模块：全量书签浏览（分类筛选条：全部/未分类/自定义分组） */
function BookmarksPage() {
	const initialData = Route.useLoaderData();
	const search = Route.useSearch();
	return (
		<WorkbenchApp
			initialData={initialData}
			showCategoryFilter
			deepLink={search}
		/>
	);
}
