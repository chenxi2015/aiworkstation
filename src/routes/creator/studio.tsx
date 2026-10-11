import { createFileRoute, redirect } from "@tanstack/react-router";
import { EditorApp } from "../../components/editor/EditorApp";

export interface CreatorStudioSearch {
	mode?: "doc" | "audio" | "video";
	doc?: number;
}

const STUDIO_MODES = new Set(["doc", "audio", "video"]);

export const Route = createFileRoute("/creator/studio")({
	validateSearch: (search: Record<string, unknown>): CreatorStudioSearch => {
		let mode: CreatorStudioSearch["mode"];
		if (typeof search.mode === "string" && STUDIO_MODES.has(search.mode)) {
			mode = search.mode as CreatorStudioSearch["mode"];
		}
		return {
			mode,
			doc:
				typeof search.doc === "number" && Number.isFinite(search.doc)
					? search.doc
					: typeof search.doc === "string" &&
							Number.isFinite(Number(search.doc))
						? Number(search.doc)
						: undefined,
		};
	},
	beforeLoad: ({ search }) => {
		const rawSearch = search as Record<string, unknown>;
		if (
			rawSearch.mode === "drafts" ||
			rawSearch.mode === "batch" ||
			"draft" in rawSearch ||
			"material" in rawSearch
		) {
			throw redirect({
				to: "/creator/studio",
				search: {
					mode: "doc",
					doc:
						typeof rawSearch.doc === "number" && Number.isFinite(rawSearch.doc)
							? rawSearch.doc
							: undefined,
				},
				replace: true,
			});
		}
	},
	component: StudioPage,
});

/**
 * Creator Studio Page:
 * Default: Full-featured TipTap AI rich-text editor (mode="doc").
 */
function StudioPage() {
	const search = Route.useSearch();

	return (
		<div className="flex-1 min-h-0 flex flex-col overflow-hidden">
			<div className="flex-1 min-h-0 flex flex-col">
				<EditorApp initialDocId={search.doc} />
			</div>
		</div>
	);
}
