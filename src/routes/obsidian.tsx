import { createFileRoute } from "@tanstack/react-router";
import { ObsidianApp } from "../components/obsidian/ObsidianApp";
import { ObsidianSkeleton } from "../components/workbench/skeletons";
import { workbenchLoader } from "./-workbenchLoader";

/** Obsidian 模块深链参数：按相对路径直接打开某篇笔记 */
export interface ObsidianSearch {
	note?: string;
}

export const Route = createFileRoute("/obsidian")({
	validateSearch: (search: Record<string, unknown>): ObsidianSearch => ({
		note:
			typeof search.note === "string" && search.note ? search.note : undefined,
	}),
	loader: workbenchLoader,
	pendingComponent: ObsidianSkeleton,
	pendingMs: 200,
	component: ObsidianPage,
});

function ObsidianPage() {
	const { unclassified, settings, folders } = Route.useLoaderData();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();

	const handleNoteChange = (path: string | null) => {
		const targetNote = path ?? undefined;
		if (search.note !== targetNote) {
			navigate({
				search: (prev) => ({
					...prev,
					note: targetNote,
				}),
				replace: true,
			});
		}
	};

	return (
		<ObsidianApp
			unclassifiedCount={unclassified.length}
			navLayout={settings.navLayout}
			folders={folders}
			settings={settings}
			initialNotePath={search.note}
			onNoteChange={handleNoteChange}
		/>
	);
}
