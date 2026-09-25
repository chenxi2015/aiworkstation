import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useCreatorContext } from "../../components/creator/CreatorContext";
import { MaterialsTab } from "../../components/creator/MaterialsTab";
import type { Material } from "../../components/creator/types";
import { fetchMaterials } from "../../services/api/creatorClient";

export const Route = createFileRoute("/creator/materials")({
	component: MaterialsPage,
});

/**
 * Materials library page:
 * Browsing, previewing, and managing media assets, with direct import into the studio.
 */
function MaterialsPage() {
	const navigate = useNavigate();
	const { setMaterialsCount } = useCreatorContext();
	const [materials, setMaterials] = useState<Material[]>([]);
	const [loading, setLoading] = useState(true);

	const reload = useCallback(async () => {
		try {
			const m = await fetchMaterials();
			setMaterials(m);
			setMaterialsCount(m.length);
		} finally {
			setLoading(false);
		}
	}, [setMaterialsCount]);

	useEffect(() => {
		void reload();
	}, [reload]);

	const handleImportToStudio = useCallback(
		(docId: number) => {
			void navigate({
				to: "/creator/studio",
				search: { doc: docId, mode: "doc" },
			});
		},
		[navigate],
	);

	return (
		<MaterialsTab
			materials={materials}
			loading={loading}
			onChanged={reload}
			onImportToStudio={handleImportToStudio}
		/>
	);
}
