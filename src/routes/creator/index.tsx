import { createFileRoute, redirect } from "@tanstack/react-router";

export interface CreatorIndexSearch {
	tab?: "materials" | "studio" | "archive" | "tools" | "radar" | "workbench" | "drafts";
	mode?: "doc" | "batch" | "drafts";
	doc?: number;
	draft?: number;
	material?: number;
}

export const Route = createFileRoute("/creator/")({
	validateSearch: (search: Record<string, unknown>): CreatorIndexSearch => ({
		tab: typeof search.tab === "string" ? (search.tab as CreatorIndexSearch["tab"]) : undefined,
		mode: typeof search.mode === "string" ? (search.mode as CreatorIndexSearch["mode"]) : undefined,
		doc: typeof search.doc === "number" && Number.isFinite(search.doc) ? search.doc : undefined,
		draft: typeof search.draft === "number" && Number.isFinite(search.draft) ? search.draft : undefined,
		material: typeof search.material === "number" && Number.isFinite(search.material) ? search.material : undefined,
	}),
	beforeLoad: ({ search }) => {
		const tab = search.tab;
		let targetPath = "/creator/materials";
		let mode = search.mode;

		if (tab === "studio") {
			targetPath = "/creator/studio";
		} else if (tab === "workbench") {
			targetPath = "/creator/studio";
			mode = "batch";
		} else if (tab === "drafts") {
			targetPath = "/creator/studio";
			mode = "drafts";
		} else if (tab === "archive") {
			targetPath = "/creator/archive";
		} else if (tab === "tools") {
			targetPath = "/creator/tools";
		} else if (tab === "radar") {
			targetPath = "/creator/radar";
		}

		if (targetPath === "/creator/studio") {
			throw redirect({
				to: "/creator/studio",
				search: {
					mode,
					doc: search.doc,
					draft: search.draft,
					material: search.material,
				},
				replace: true,
			});
		}

		throw redirect({
			to: targetPath as "/creator/materials" | "/creator/archive" | "/creator/tools" | "/creator/radar",
			replace: true,
		});
	},
});
