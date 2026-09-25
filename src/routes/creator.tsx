import { createFileRoute } from "@tanstack/react-router";
import { CreatorApp } from "../components/creator/CreatorApp";
import { CreatorSkeleton } from "../components/workbench/skeletons";
import { workbenchLoader } from "./-workbenchLoader";

/**
 * 自媒体模块深链参数（docs/selfmedia-merge-plan.md）：
 * 指定子板块 Tab、创作台模式、直接打开文档/草稿编辑器或选中素材。
 * 兼容历史值：tab=workbench → studio(mode=batch)，tab=drafts → studio(mode=drafts)。
 */
export interface CreatorSearch {
	tab?: "materials" | "studio" | "archive" | "tools" | "radar";
	/** 创作台模式：文档创作 / 一键处理（批量） / 草稿进度 */
	mode?: "doc" | "batch" | "drafts";
	/** 直接打开指定创作文档（创作台） */
	doc?: number;
	/** 直接打开该草稿的编辑抽屉（创作台 · 草稿进度） */
	draft?: number;
	/** 选中指定素材（素材库/工作台） */
	material?: number;
}

const CREATOR_TABS = new Set([
	"materials",
	"studio",
	"archive",
	"tools",
	"radar",
]);
const STUDIO_MODES = new Set(["doc", "batch", "drafts"]);

export const Route = createFileRoute("/creator")({
	validateSearch: (search: Record<string, unknown>): CreatorSearch => {
		let tab: CreatorSearch["tab"];
		let mode: CreatorSearch["mode"];
		if (typeof search.tab === "string") {
			if (CREATOR_TABS.has(search.tab)) {
				tab = search.tab as CreatorSearch["tab"];
			} else if (search.tab === "workbench") {
				tab = "studio";
				mode = "batch";
			} else if (search.tab === "drafts") {
				tab = "studio";
				mode = "drafts";
			}
		}
		if (typeof search.mode === "string" && STUDIO_MODES.has(search.mode)) {
			mode = search.mode as CreatorSearch["mode"];
		}
		return {
			tab,
			mode,
			doc:
				typeof search.doc === "number" && Number.isFinite(search.doc)
					? search.doc
					: undefined,
			draft:
				typeof search.draft === "number" && Number.isFinite(search.draft)
					? search.draft
					: undefined,
			material:
				typeof search.material === "number" && Number.isFinite(search.material)
					? search.material
					: undefined,
		};
	},
	loader: workbenchLoader,
	pendingComponent: CreatorSkeleton,
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
			initialStudioMode={search.mode}
			initialDocId={search.doc}
			initialDraftId={search.draft}
			initialMaterialId={search.material}
		/>
	);
}
