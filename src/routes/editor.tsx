import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * 「创作」模块已并入「自媒体」（docs/selfmedia-merge-plan.md）：
 * /editor?doc=N → /creator?tab=studio&mode=doc&doc=N，保留历史深链。
 */
export const Route = createFileRoute("/editor")({
	validateSearch: (search: Record<string, unknown>): { doc?: number } => ({
		doc:
			typeof search.doc === "number" && Number.isFinite(search.doc)
				? search.doc
				: undefined,
	}),
	beforeLoad: ({ search }) => {
		throw redirect({
			to: "/creator/studio",
			search: { mode: "doc", doc: search.doc },
			replace: true,
		});
	},
});
