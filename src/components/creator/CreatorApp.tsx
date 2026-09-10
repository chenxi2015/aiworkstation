import { Inbox, Library, PenSquare } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { NavLayoutEntry } from "../../modules/registry";
import { fetchDrafts, fetchMaterials } from "../../services/api/creatorClient";
import { useWorkbenchQuickActions } from "../workbench/layout/useWorkbenchQuickActions";
import { WorkbenchHeader } from "../workbench/layout/WorkbenchHeader";
import type { Folder } from "../workbench/types";
import { DraftsTab } from "./DraftsTab";
import { MaterialsTab } from "./MaterialsTab";
import type { DraftWithMaterial, Material } from "./types";
import { WorkbenchTab } from "./WorkbenchTab";

export interface CreatorAppProps {
	unclassifiedCount: number;
	navLayout?: NavLayoutEntry[];
	folders: Folder[];
}

type CreatorTab = "workbench" | "materials" | "drafts";

const TABS: Array<{ id: CreatorTab; label: string; icon: typeof PenSquare }> = [
	{ id: "workbench", label: "二创工作台", icon: PenSquare },
	{ id: "materials", label: "素材库", icon: Library },
	{ id: "drafts", label: "草稿箱", icon: Inbox },
];

/**
 * 自媒体模块主页：素材 → AI 二创 → 审稿定稿 → 导出 工作流（docs/creator-plan.md）
 */
export function CreatorApp({
	unclassifiedCount,
	navLayout,
	folders,
}: CreatorAppProps) {
	const { actionProps, modals } = useWorkbenchQuickActions({ folders });
	const [activeTab, setActiveTab] = useState<CreatorTab>("workbench");
	const [materials, setMaterials] = useState<Material[]>([]);
	const [drafts, setDrafts] = useState<DraftWithMaterial[]>([]);
	const [loading, setLoading] = useState(true);
	const [selectedMaterialId, setSelectedMaterialId] = useState<number | null>(
		null,
	);

	const reload = useCallback(async () => {
		const [m, d] = await Promise.all([fetchMaterials(), fetchDrafts()]);
		setMaterials(m);
		setDrafts(d);
		setLoading(false);
		setSelectedMaterialId((prev) => {
			if (prev && m.some((item) => item.id === prev)) return prev;
			return m[0]?.id ?? null;
		});
	}, []);

	useEffect(() => {
		reload();
	}, [reload]);

	/** 素材库「去二创」：选中素材并跳回工作台 */
	const handleGoCreate = useCallback((materialId: number) => {
		setSelectedMaterialId(materialId);
		setActiveTab("workbench");
	}, []);

	return (
		<div className="h-screen bg-surface dark:bg-background text-foreground flex flex-col overflow-hidden">
			<WorkbenchHeader
				unclassifiedCount={unclassifiedCount}
				navLayout={navLayout}
				{...actionProps}
			/>
			<div className="border-b border-border bg-surface/60 shrink-0">
				<div className="max-w-7xl mx-auto px-6 flex items-center gap-1">
					{TABS.map((tab) => {
						const Icon = tab.icon;
						const active = activeTab === tab.id;
						return (
							<button
								key={tab.id}
								type="button"
								onClick={() => setActiveTab(tab.id)}
								className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors cursor-pointer ${
									active
										? "border-accent text-accent"
										: "border-transparent text-muted hover:text-foreground"
								}`}
							>
								<Icon className="w-3.5 h-3.5" />
								{tab.label}
								{tab.id === "materials" && materials.length > 0 && (
									<span className="ml-1 px-1.5 py-0.5 rounded-full bg-muted/10 text-[10px] text-muted">
										{materials.length}
									</span>
								)}
								{tab.id === "drafts" && drafts.length > 0 && (
									<span className="ml-1 px-1.5 py-0.5 rounded-full bg-muted/10 text-[10px] text-muted">
										{drafts.length}
									</span>
								)}
							</button>
						);
					})}
				</div>
			</div>
			<main className="flex-1 overflow-hidden flex flex-col min-h-0">
				{activeTab === "materials" && (
					<MaterialsTab
						materials={materials}
						loading={loading}
						onChanged={reload}
						onGoCreate={handleGoCreate}
					/>
				)}
				{activeTab === "workbench" && (
					<WorkbenchTab
						materials={materials}
						loading={loading}
						selectedMaterialId={selectedMaterialId}
						onSelectMaterial={setSelectedMaterialId}
						onChanged={reload}
						onGoMaterials={() => setActiveTab("materials")}
					/>
				)}
				{activeTab === "drafts" && (
					<DraftsTab drafts={drafts} loading={loading} onChanged={reload} />
				)}
			</main>
			{modals}
		</div>
	);
}
