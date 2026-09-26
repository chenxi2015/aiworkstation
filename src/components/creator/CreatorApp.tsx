import { Archive, Library, PenSquare, Radar, Wrench } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { NavLayoutEntry } from "../../modules/registry";
import { fetchDrafts, fetchMaterials } from "../../services/api/creatorClient";
import { workbenchContextActions } from "../../stores/workbenchContextStore";
import { EditorApp } from "../editor/EditorApp";
import type { Folder } from "../workbench/types";
import { ArchiveTab } from "./ArchiveTab";
import { DraftsTab } from "./DraftsTab";
import { MaterialsTab } from "./MaterialsTab";
import { PlaceholderTab } from "./PlaceholderTab";
import type { DraftWithMaterial, Material } from "./types";
import { WorkbenchTab } from "./WorkbenchTab";

export interface CreatorAppProps {
	unclassifiedCount: number;
	navLayout?: NavLayoutEntry[];
	folders: Folder[];
	/** 深链：初始 Tab（默认素材库） */
	initialTab?: CreatorTab;
	/** 深链：创作台初始模式（默认文档创作） */
	initialStudioMode?: StudioMode;
	/** 深链：创作台直接打开指定文档 */
	initialDocId?: number;
	/** 深链：直接打开该草稿的编辑抽屉 */
	initialDraftId?: number;
	/** 深链：初始选中素材 */
	initialMaterialId?: number;
}

type CreatorTab = "materials" | "studio" | "archive" | "tools" | "radar";
type StudioMode = "doc" | "batch" | "drafts";

const TABS: Array<{ id: CreatorTab; label: string; icon: typeof PenSquare }> = [
	{ id: "materials", label: "素材库", icon: Library },
	{ id: "studio", label: "创作台", icon: PenSquare },
	{ id: "archive", label: "归档", icon: Archive },
	{ id: "tools", label: "工具箱", icon: Wrench },
	{ id: "radar", label: "热点雷达", icon: Radar },
];

/**
 * 自媒体模块主页（docs/selfmedia-merge-plan.md）：
 * 素材库 / 创作台(文档创作+一键处理+草稿进度) / 归档 / 工具箱 / 热点雷达。
 * 主线：素材 → 创作 → 归档；热点 → 创作 → 归档。
 */
export function CreatorApp({
	unclassifiedCount: _unclassifiedCount,
	navLayout: _navLayout,
	folders: _folders,
	initialTab,
	initialStudioMode,
	initialDocId,
	initialDraftId,
	initialMaterialId,
}: CreatorAppProps) {
	const [activeTab, setActiveTab] = useState<CreatorTab>(
		initialTab ?? "materials",
	);
	const [studioMode, setStudioMode] = useState<StudioMode>(
		initialStudioMode ?? (initialDraftId ? "drafts" : "doc"),
	);
	const [materials, setMaterials] = useState<Material[]>([]);
	const [drafts, setDrafts] = useState<DraftWithMaterial[]>([]);
	const [loading, setLoading] = useState(true);
	const [selectedMaterialId, setSelectedMaterialId] = useState<number | null>(
		initialMaterialId ?? null,
	);
	/** 素材库「导入创作台」后待打开的文档 id（EditorApp 按需挂载时消费） */
	const [pendingDocId, setPendingDocId] = useState<number | null>(null);

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

	// Sync currently active material to workbenchContextStore
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

	/** 素材库「导入创作台」：跳到创作台文档创作模式并打开新文档 */
	const handleImportToStudio = useCallback((docId: number) => {
		setPendingDocId(docId);
		setStudioMode("doc");
		setActiveTab("studio");
	}, []);

	return (
		<div className="h-full bg-surface dark:bg-background text-foreground flex flex-col overflow-hidden">
			<div className="border-b border-border bg-surface/60 shrink-0">
				<div className="mx-auto px-6 flex items-center gap-1">
					{TABS.map((tab) => {
						const Icon = tab.icon;
						const active = activeTab === tab.id;
						return (
							<button
								key={tab.id}
								type="button"
								onClick={() => {
									// 子模式切换条已隐藏：点「创作台」始终回到文档创作
									if (tab.id === "studio") setStudioMode("doc");
									setActiveTab(tab.id);
								}}
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
						onImportToStudio={handleImportToStudio}
					/>
				)}
				{activeTab === "studio" && (
					<div className="flex-1 flex flex-col min-h-0">
						{/* 子模式切换条暂时隐藏（2026-09 定案：创作台默认文档创作；
						    一键处理/草稿进度仍可通过深链 ?tab=studio&mode=batch|drafts 与素材库「去二创」直达） */}
						{/* 子模式按需挂载：保证文档/草稿列表数据新鲜（素材导入创作台后能立即看到新文档） */}
						{studioMode === "doc" && (
							<div className="flex-1 min-h-0 flex flex-col">
								<EditorApp initialDocId={pendingDocId ?? initialDocId} />
							</div>
						)}
						{studioMode === "batch" && (
							<div className="flex-1 min-h-0 flex flex-col overflow-hidden">
								<WorkbenchTab
									materials={materials}
									loading={loading}
									selectedMaterialId={selectedMaterialId}
									onSelectMaterial={setSelectedMaterialId}
									onChanged={reload}
									onGoMaterials={() => setActiveTab("materials")}
								/>
							</div>
						)}
						{studioMode === "drafts" && (
							<div className="flex-1 min-h-0 flex flex-col overflow-hidden">
								<DraftsTab
									drafts={drafts}
									loading={loading}
									onChanged={reload}
									initialEditDraftId={initialDraftId}
								/>
							</div>
						)}
					</div>
				)}
				{activeTab === "archive" && <ArchiveTab />}
				{activeTab === "tools" && (
					<PlaceholderTab
						icon={Wrench}
						title="工具箱"
						description="音频处理、视频爬取、音频分离等本地创作工具，将在这里陆续上线。"
					/>
				)}
				{activeTab === "radar" && (
					<PlaceholderTab
						icon={Radar}
						title="热点雷达"
						description="监控小红书、抖音、微信视频号等平台的热点话题，一键转为素材进入「热点 → 创作 → 归档」流水线。"
					/>
				)}
			</main>
		</div>
	);
}
