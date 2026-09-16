import { createFileRoute } from "@tanstack/react-router";
import { CreatorApp } from "../components/creator/CreatorApp";
import { ModuleSkeleton } from "../components/workbench/skeletons";
import { workbenchLoader } from "./-workbenchLoader";

/** 自媒体模块深链参数：指定 Tab、直接打开草稿编辑器或选中素材 */
export interface CreatorSearch {
	tab?: "materials" | "workbench" | "drafts";
	/** 直接打开该草稿的编辑抽屉（进度台） */
	draft?: number;
	/** 选中指定素材（素材库/工作台） */
	material?: number;
}

const CREATOR_TABS = new Set(["materials", "workbench", "drafts"]);

export const Route = createFileRoute("/creator")({
	validateSearch: (search: Record<string, unknown>): CreatorSearch => ({
		tab:
			typeof search.tab === "string" && CREATOR_TABS.has(search.tab)
				? (search.tab as CreatorSearch["tab"])
				: undefined,
		draft:
			typeof search.draft === "number" && Number.isFinite(search.draft)
				? search.draft
				: undefined,
		material:
			typeof search.material === "number" && Number.isFinite(search.material)
				? search.material
				: undefined,
	}),
	loader: workbenchLoader,
	pendingComponent: ModuleSkeleton,
	pendingMs: 200,
	component: CreatorPage,
});

function CreatorPage() {
	const { unclassified, settings, folders } = Route.useLoaderData();
	const search = Route.useSearch();
	return (
		<CreatorApp
			unclassifiedCount={unclassified.length}
			navLayout={settings.navLayout}
			folders={folders}
			initialTab={search.tab}
			initialDraftId={search.draft}
			initialMaterialId={search.material}
		/>
	);
}
