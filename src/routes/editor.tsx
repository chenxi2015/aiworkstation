import { createFileRoute } from "@tanstack/react-router";
import { EditorApp } from "../components/editor/EditorApp";
import { EditorSkeleton } from "../components/workbench/skeletons";
import { workbenchLoader } from "./-workbenchLoader";

/** 创作模块深链参数：直接打开指定文档 */
export interface EditorSearch {
	doc?: number;
}

export const Route = createFileRoute("/editor")({
	validateSearch: (search: Record<string, unknown>): EditorSearch => ({
		doc:
			typeof search.doc === "number" && Number.isFinite(search.doc)
				? search.doc
				: undefined,
	}),
	loader: workbenchLoader,
	pendingComponent: EditorSkeleton,
	pendingMs: 200,
	component: EditorPage,
});

function EditorPage() {
	const { unclassified, settings, folders } = Route.useLoaderData();
	const search = Route.useSearch();
	return (
		<EditorApp
			unclassifiedCount={unclassified.length}
			navLayout={settings.navLayout}
			folders={folders}
			initialDocId={search.doc}
		/>
	);
}
