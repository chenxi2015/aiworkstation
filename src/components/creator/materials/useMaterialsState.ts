import { toast } from "@heroui/react";
import { useCallback, useEffect, useState } from "react";
import {
	batchDeleteMaterialsRpc,
	createDocumentFromMaterialRpc,
	deleteMaterialFolderRpc,
	deleteMaterialRpc,
	fetchMaterialFolders,
	openMaterialAssetsDirRpc,
	updateMaterialRpc,
} from "../../../services/api/creatorClient";
import type { Material, MaterialFolder } from "../types";
import type { FolderSelection, TypeTab } from "./types";
import { getMaterialKind } from "./utils";

interface UseMaterialsStateProps {
	materials: Material[];
	onChanged: () => Promise<void>;
	onImportToStudioSuccess: (docId: number) => void;
}

export function useMaterialsState({
	materials,
	onChanged,
	onImportToStudioSuccess,
}: UseMaterialsStateProps) {
	const [folders, setFolders] = useState<MaterialFolder[]>([]);
	const [selection, setSelection] = useState<FolderSelection>("all");
	const [typeTab, setTypeTab] = useState<TypeTab>("all");
	const [viewMode, setViewMode] = useState<"list" | "grid">(() =>
		typeof window !== "undefined" &&
		window.localStorage.getItem("creator.materials.viewMode") === "grid"
			? "grid"
			: "list",
	);
	const [selectMode, setSelectMode] = useState(false);
	const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
	const [batchBusy, setBatchBusy] = useState(false);
	const [importingId, setImportingId] = useState<number | null>(null);
	const [openingDirId, setOpeningDirId] = useState<number | null>(null);

	// Modals & confirmation dialog states
	const [showImportModal, setShowImportModal] = useState(false);
	const [folderModal, setFolderModal] = useState<{
		folder: MaterialFolder | null;
	} | null>(null);
	const [deletingFolder, setDeletingFolder] = useState<MaterialFolder | null>(
		null,
	);
	const [deleteFolderBusy, setDeleteFolderBusy] = useState(false);
	const [archiving, setArchiving] = useState<Material | null>(null);
	const [archiveBusy, setArchiveBusy] = useState(false);
	const [deleting, setDeleting] = useState<Material | null>(null);
	const [showMoveModal, setShowMoveModal] = useState(false);
	const [confirmBatchDelete, setConfirmBatchDelete] = useState(false);
	const [playingMaterial, setPlayingMaterial] = useState<Material | null>(null);
	const [playingAssetId, setPlayingAssetId] = useState<number | null>(null);
	const [previewingMaterial, setPreviewingMaterial] = useState<Material | null>(
		null,
	);
	const [previewingAssetId, setPreviewingAssetId] = useState<number | null>(
		null,
	);

	const handlePlayVideo = useCallback(
		(material: Material, assetId?: number) => {
			setPlayingMaterial(material);
			setPlayingAssetId(assetId ?? null);
		},
		[],
	);

	const closeVideoModal = useCallback(() => {
		setPlayingMaterial(null);
		setPlayingAssetId(null);
	}, []);

	const handlePreviewImage = useCallback(
		(material: Material, assetId?: number) => {
			setPreviewingMaterial(material);
			setPreviewingAssetId(assetId ?? null);
		},
		[],
	);

	const closeImageModal = useCallback(() => {
		setPreviewingMaterial(null);
		setPreviewingAssetId(null);
	}, []);

	const [search, setSearch] = useState("");
	const [refreshing, setRefreshing] = useState(false);

	const loadFolders = useCallback(async () => {
		setFolders(await fetchMaterialFolders());
	}, []);

	useEffect(() => {
		loadFolders();
	}, [loadFolders]);

	const handleChanged = useCallback(async () => {
		await Promise.all([onChanged(), loadFolders()]);
	}, [onChanged, loadFolders]);

	// Fallback to "all" if selected folder was deleted
	useEffect(() => {
		if (
			typeof selection === "number" &&
			!folders.some((f) => f.id === selection)
		) {
			setSelection("all");
		}
	}, [selection, folders]);

	const currentFolder =
		typeof selection === "number"
			? (folders.find((f) => f.id === selection) ?? null)
			: null;

	const folderFiltered = materials.filter((m) => {
		if (selection === "all") return true;
		if (selection === "unfiled") return !m.folderId;
		if (selection === "starred") return Boolean(m.starred);
		return m.folderId === selection;
	});

	const keyword = search.trim().toLowerCase();
	const visibleMaterials = folderFiltered
		.filter((m) => (typeTab === "all" ? true : getMaterialKind(m) === typeTab))
		.filter((m) =>
			keyword
				? m.title.toLowerCase().includes(keyword) ||
					m.content.toLowerCase().includes(keyword) ||
					(m.note ?? "").toLowerCase().includes(keyword)
				: true,
		);

	const getTypeCount = (tabId: TypeTab) => {
		if (tabId === "all") return folderFiltered.length;
		return folderFiltered.filter((m) => getMaterialKind(m) === tabId).length;
	};

	const unfiledCount = materials.filter((m) => !m.folderId).length;
	const starredCount = materials.filter((m) => m.starred).length;

	// Incremental display limit for smooth rendering performance
	const PAGE_SIZE = 48;
	const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Reset display pagination whenever active filters change
	useEffect(() => {
		setDisplayLimit(PAGE_SIZE);
	}, [selection, typeTab, search]);

	const displayedMaterials = visibleMaterials.slice(0, displayLimit);
	const hasMore = visibleMaterials.length > displayLimit;

	const loadMore = useCallback(() => {
		setDisplayLimit((prev) =>
			Math.min(prev + PAGE_SIZE, visibleMaterials.length),
		);
	}, [visibleMaterials.length]);

	const toggleViewMode = (mode: "list" | "grid") => {
		setViewMode(mode);
		try {
			window.localStorage.setItem("creator.materials.viewMode", mode);
		} catch {
			// Silently ignore if localStorage is unavailable
		}
	};

	const toggleSelect = (id: number) => {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const exitSelectMode = () => {
		setSelectMode(false);
		setSelectedIds(new Set());
	};

	const allVisibleSelected =
		visibleMaterials.length > 0 &&
		visibleMaterials.every((m) => selectedIds.has(m.id));

	const toggleSelectAll = () => {
		setSelectedIds(
			allVisibleSelected
				? new Set()
				: new Set(visibleMaterials.map((m) => m.id)),
		);
	};

	const handleRefresh = async () => {
		setRefreshing(true);
		try {
			await handleChanged();
		} finally {
			setRefreshing(false);
		}
	};

	const handleOpenDir = async (material: Material) => {
		setOpeningDirId(material.id);
		try {
			await openMaterialAssetsDirRpc({ id: material.id });
		} catch (err) {
			toast.danger(
				`打开目录失败：${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setOpeningDirId(null);
		}
	};

	const handleToggleStar = async (material: Material) => {
		try {
			await updateMaterialRpc({
				id: material.id,
				starred: !material.starred,
			});
			await handleChanged();
		} catch (err) {
			toast.danger(
				`收藏失败：${err instanceof Error ? err.message : String(err)}`,
			);
		}
	};

	const handleImportToStudio = async (material: Material) => {
		setImportingId(material.id);
		try {
			const { documentId } = await createDocumentFromMaterialRpc(material.id);
			toast.success(`「${material.title}」已导入创作台`);
			onImportToStudioSuccess(documentId);
		} catch (err) {
			toast.danger(
				`导入失败：${err instanceof Error ? err.message : String(err)}`,
			);
			await handleChanged();
		} finally {
			setImportingId(null);
		}
	};

	const handleBatchArchive = async () => {
		if (selectedIds.size === 0) return;
		setBatchBusy(true);
		try {
			for (const id of selectedIds) {
				await updateMaterialRpc({ id, status: "archived" });
			}
			toast.success(`已归档 ${selectedIds.size} 条素材`);
			exitSelectMode();
			await handleChanged();
		} catch (err) {
			toast.danger(
				`批量归档失败：${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setBatchBusy(false);
		}
	};

	const handleBatchMove = async (folderId: number | null) => {
		if (selectedIds.size === 0) return;
		setBatchBusy(true);
		try {
			for (const id of selectedIds) {
				await updateMaterialRpc({ id, folderId });
			}
			toast.success(`已移动 ${selectedIds.size} 条素材`);
			setShowMoveModal(false);
			exitSelectMode();
			await handleChanged();
		} catch (err) {
			toast.danger(
				`批量移动失败：${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setBatchBusy(false);
		}
	};

	const handleBatchDelete = async () => {
		if (selectedIds.size === 0) return;
		setBatchBusy(true);
		try {
			const ids = Array.from(selectedIds);
			const { deletedCount } = await batchDeleteMaterialsRpc({ ids });
			toast.success(`已删除 ${deletedCount} 条素材`);
			setConfirmBatchDelete(false);
			exitSelectMode();
			await handleChanged();
		} catch (err) {
			toast.danger(
				`批量删除失败：${err instanceof Error ? err.message : String(err)}`,
			);
			await handleChanged();
		} finally {
			setBatchBusy(false);
		}
	};

	const handleArchive = async () => {
		if (!archiving) return;
		setArchiveBusy(true);
		try {
			await updateMaterialRpc({ id: archiving.id, status: "archived" });
			toast.success(`素材「${archiving.title}」已归档`);
			setArchiving(null);
			await handleChanged();
		} catch (err) {
			toast.danger(
				`归档失败：${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setArchiveBusy(false);
		}
	};

	const handleDelete = async () => {
		if (!deleting) return;
		try {
			await deleteMaterialRpc({ id: deleting.id });
			toast.success(`素材「${deleting.title}」已删除`);
			setDeleting(null);
			await handleChanged();
		} catch (err) {
			toast.danger(
				`删除失败：${err instanceof Error ? err.message : String(err)}`,
			);
		}
	};

	const handleDeleteFolder = async () => {
		if (!deletingFolder) return;
		setDeleteFolderBusy(true);
		try {
			await deleteMaterialFolderRpc({ id: deletingFolder.id });
			toast.success(`文件夹「${deletingFolder.name}」已删除，素材已移回未归档`);
			setDeletingFolder(null);
			await handleChanged();
		} catch (err) {
			toast.danger(
				`删除失败：${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setDeleteFolderBusy(false);
		}
	};

	return {
		folders,
		selection,
		setSelection,
		currentFolder,
		folderFiltered,
		visibleMaterials,
		displayedMaterials,
		hasMore,
		loadMore,
		typeTab,
		setTypeTab,
		viewMode,
		toggleViewMode,
		search,
		setSearch,
		refreshing,
		unfiledCount,
		starredCount,
		getTypeCount,
		// Selection
		selectMode,
		setSelectMode,
		selectedIds,
		toggleSelect,
		toggleSelectAll,
		allVisibleSelected,
		exitSelectMode,
		// Operations
		batchBusy,
		importingId,
		openingDirId,
		handleRefresh,
		handleOpenDir,
		handleToggleStar,
		handleImportToStudio,
		handleBatchArchive,
		handleBatchMove,
		handleBatchDelete,
		handleArchive,
		handleDelete,
		handleDeleteFolder,
		handleChanged,
		// Modals
		showImportModal,
		setShowImportModal,
		folderModal,
		setFolderModal,
		deletingFolder,
		setDeletingFolder,
		deleteFolderBusy,
		archiving,
		setArchiving,
		archiveBusy,
		deleting,
		setDeleting,
		showMoveModal,
		setShowMoveModal,
		confirmBatchDelete,
		setConfirmBatchDelete,
		playingMaterial,
		playingAssetId,
		handlePlayVideo,
		closeVideoModal,
		previewingMaterial,
		previewingAssetId,
		handlePreviewImage,
		closeImageModal,
	};
}
