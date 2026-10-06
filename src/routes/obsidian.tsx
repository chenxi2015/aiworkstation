import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";
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
	staleTime: Number.POSITIVE_INFINITY,
	pendingComponent: ObsidianSkeleton,
	pendingMs: 200,
	component: ObsidianPage,
});

function ObsidianPage() {
	const { unclassified, settings, folders } = Route.useLoaderData();
	const search = Route.useSearch();

	// Silently sync note query parameter without triggering full TanStack Router navigation transactions
	const handleNoteChange = useCallback((path: string | null) => {
		if (typeof window === "undefined") return;
		try {
			const url = new URL(window.location.href);
			if (path) {
				url.searchParams.set("note", path);
			} else {
				url.searchParams.delete("note");
			}
			window.history.replaceState(null, "", url.toString());
		} catch {
			// Ignore URL update error
		}
	}, []);

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
