import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useCreatorContext } from "../../components/creator/CreatorContext";
import { DraftsTab } from "../../components/creator/DraftsTab";
import type { DraftWithMaterial, Material } from "../../components/creator/types";
import { WorkbenchTab } from "../../components/creator/WorkbenchTab";
import { EditorApp } from "../../components/editor/EditorApp";
import { fetchDrafts, fetchMaterials } from "../../services/api/creatorClient";
import { workbenchContextActions } from "../../stores/workbenchContextStore";

export interface CreatorStudioSearch {
	mode?: "doc" | "batch" | "drafts" | "audio" | "video";
	doc?: number;
	draft?: number;
	material?: number;
}

const STUDIO_MODES = new Set(["doc", "batch", "drafts", "audio", "video"]);

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
					: typeof search.doc === "string" && Number.isFinite(Number(search.doc))
						? Number(search.doc)
						: undefined,
			draft:
				typeof search.draft === "number" && Number.isFinite(search.draft)
					? search.draft
					: typeof search.draft === "string" && Number.isFinite(Number(search.draft))
						? Number(search.draft)
						: undefined,
			material:
				typeof search.material === "number" && Number.isFinite(search.material)
					? search.material
					: typeof search.material === "string" && Number.isFinite(Number(search.material))
						? Number(search.material)
						: undefined,
		};
	},
	component: StudioPage,
});

/**
 * Creator Studio Page:
 * Default: Full-featured TipTap AI rich-text editor (mode="doc").
 * Supports deep-link secondary modes: batch processing ("batch") & drafts queue ("drafts").
 */
function StudioPage() {
	const navigate = useNavigate();
	const search = Route.useSearch();
	const { folders, unclassifiedCount, navLayout } = useCreatorContext();

	const mode = search.mode ?? (search.draft ? "drafts" : "doc");
	const isCanvasMode = mode === "doc" || mode === "audio" || mode === "video";

	const [materials, setMaterials] = useState<Material[]>([]);
	const [drafts, setDrafts] = useState<DraftWithMaterial[]>([]);
	const [loading, setLoading] = useState(!isCanvasMode);
	const [selectedMaterialId, setSelectedMaterialId] = useState<number | null>(
		search.material ?? null,
	);

	const reloadSecondaryData = useCallback(async () => {
		if (isCanvasMode) return;
		setLoading(true);
		try {
			const [m, d] = await Promise.all([fetchMaterials(), fetchDrafts()]);
			setMaterials(m);
			setDrafts(d);
			setSelectedMaterialId((prev) => {
				if (prev && m.some((item) => item.id === prev)) return prev;
				return m[0]?.id ?? null;
			});
		} finally {
			setLoading(false);
		}
	}, [isCanvasMode]);

	useEffect(() => {
		if (!isCanvasMode) {
			void reloadSecondaryData();
		}
	}, [isCanvasMode, reloadSecondaryData]);

	// Sync active material context to workbenchContextStore
	useEffect(() => {
		if (selectedMaterialId) {
			const mat = materials.find((m) => m.id === selectedMaterialId);
			if (mat) {
				workbenchContextActions.setActiveMaterial({
					id: mat.id,
					title: mat.title || "未命名素材",
				});
				return;
			}
		}
		workbenchContextActions.setActiveMaterial(null);
	}, [selectedMaterialId, materials]);

	useEffect(() => {
		return () => {
			workbenchContextActions.setActiveMaterial(null);
		};
	}, []);

	return (
		<div className="flex-1 min-h-0 flex flex-col overflow-hidden">
			{isCanvasMode && (
				<div className="flex-1 min-h-0 flex flex-col">
					<EditorApp
						embedded
						unclassifiedCount={unclassifiedCount}
						navLayout={navLayout}
						folders={folders}
						initialDocId={search.doc}
					/>
				</div>
			)}
			{mode === "batch" && (
				<div className="flex-1 min-h-0 flex flex-col overflow-hidden">
					<WorkbenchTab
						materials={materials}
						loading={loading}
						selectedMaterialId={selectedMaterialId}
						onSelectMaterial={setSelectedMaterialId}
						onChanged={reloadSecondaryData}
						onGoMaterials={() => {
							void navigate({ to: "/creator/materials" });
						}}
					/>
				</div>
			)}
			{mode === "drafts" && (
				<div className="flex-1 min-h-0 flex flex-col overflow-hidden">
					<DraftsTab
						drafts={drafts}
						loading={loading}
						onChanged={reloadSecondaryData}
						initialEditDraftId={search.draft}
					/>
				</div>
			)}
		</div>
	);
}
