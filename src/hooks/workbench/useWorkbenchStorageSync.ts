import { useCallback, useEffect, useRef, useState } from "react";
import type {
	Category,
	Folder,
	WorkbenchItem,
	WorkbenchSettings,
} from "../../components/workbench/types";
import {
	DEFAULT_SETTINGS,
	WorkbenchStorageService,
} from "../../services/workbenchStorage";

export interface InitialWorkbenchData {
	folders?: Folder[];
	unclassified?: WorkbenchItem[];
	settings?: WorkbenchSettings;
	initialCategory?: Category;
}

export const ACTIVE_CATEGORY_STORAGE_KEY = "aiworkstation_active_category";

/**
 * Persist active category across cookie and storage so SSR and CSR stay perfectly aligned
 */
export function saveActiveCategory(cat: string) {
	if (typeof window === "undefined") return;
	try {
		sessionStorage.setItem(ACTIVE_CATEGORY_STORAGE_KEY, cat);
		localStorage.setItem(ACTIVE_CATEGORY_STORAGE_KEY, cat);
		document.cookie = `${ACTIVE_CATEGORY_STORAGE_KEY}=${encodeURIComponent(cat)}; path=/; max-age=31536000; SameSite=Lax`;
	} catch {
		// Ignore storage errors
	}
}

export function getStoredActiveCategory(): string | null {
	if (typeof window === "undefined") return null;
	try {
		const match = document.cookie.match(
			new RegExp(`(?:^|;\\s*)${ACTIVE_CATEGORY_STORAGE_KEY}=([^;]+)`),
		);
		if (match) {
			return decodeURIComponent(match[1]);
		}
		const session = sessionStorage.getItem(ACTIVE_CATEGORY_STORAGE_KEY);
		if (session) return session;
		const local = localStorage.getItem(ACTIVE_CATEGORY_STORAGE_KEY);
		if (local) return local;
	} catch {
		// Ignore storage access restrictions
	}
	return null;
}

/**
 * Sub-hook responsible for managing core data state, persistence, and cross-tab/focus synchronization
 */
export function useWorkbenchStorageSync(initialData?: InitialWorkbenchData) {
	const [folders, setFolders] = useState<Folder[]>(
		() => initialData?.folders ?? [],
	);
	const [unclassified, setUnclassified] = useState<WorkbenchItem[]>(
		() => initialData?.unclassified ?? [],
	);
	const [settings, setSettings] = useState<WorkbenchSettings>(
		() => initialData?.settings ?? DEFAULT_SETTINGS,
	);
	const [isInitialLoading, setIsInitialLoading] = useState(() => !initialData);

	const [activeCategory, setActiveCategory] = useState<Category>(() => {
		// 1. Initial category from server (read directly from request cookie during SSR)
		if (initialData?.initialCategory) {
			return initialData.initialCategory;
		}
		// 2. Client fallback from cookie/storage
		const stored = getStoredActiveCategory();
		if (stored) return stored as Category;

		// 3. Fallback to unclassified if no folders exist but items exist
		if (
			initialData?.folders &&
			initialData.folders.length === 0 &&
			initialData.unclassified &&
			initialData.unclassified.length > 0
		) {
			return "未分类";
		}
		return "工作台";
	});

	// Keep a ref to the latest activeCategory to avoid stale closures in reloadFromDb
	const activeCategoryRef = useRef(activeCategory);
	useEffect(() => {
		activeCategoryRef.current = activeCategory;
	}, [activeCategory]);

	// Keep Cookie and local storage in sync with activeCategory
	useEffect(() => {
		saveActiveCategory(activeCategory);
	}, [activeCategory]);

	// Sync settings from SQLite DB if initial settings lack API key
	useEffect(() => {
		if (!settings.apiKey) {
			WorkbenchStorageService.fetchSettingsFromDb().then((dbSettings) => {
				if (dbSettings?.apiKey) {
					setSettings(dbSettings);
				}
			});
		}
	}, [settings.apiKey]);

	// Load initial data from SQLite
	const reloadFromDb = useCallback(async () => {
		try {
			const { folders: loadedFolders, unclassified: loadedUnclassified } =
				await WorkbenchStorageService.fetchAllFromDb();
			const loadedSettings =
				await WorkbenchStorageService.fetchSettingsFromDb();

			setFolders(loadedFolders);
			setUnclassified(loadedUnclassified);
			setSettings(loadedSettings);

			// If no folders exist but there are unclassified items, switch to unclassified view
			if (loadedFolders.length === 0 && loadedUnclassified.length > 0) {
				setActiveCategory("未分类");
			}
			return { loadedFolders, loadedUnclassified, loadedSettings };
		} finally {
			setIsInitialLoading(false);
		}
	}, []);

	// Initial fetch if no initialData provided
	useEffect(() => {
		if (!initialData) {
			reloadFromDb();
		}
	}, [initialData, reloadFromDb]);

	// Sync data on window focus / visibility change, and listen for broadcast / postMessage events
	useEffect(() => {
		const handleVisibilityOrFocus = () => {
			if (document.visibilityState === "visible") {
				reloadFromDb();
			}
		};

		// Listen for message events from extension or other tabs
		const handleMessage = (event: MessageEvent) => {
			if (
				event.data?.type === "WORKBENCH_RELOAD" ||
				event.data?.type === "BOOKMARK_COLLECTED"
			) {
				reloadFromDb();
			}
		};

		// BroadcastChannel for cross-tab or cross-window instant notification
		let channel: BroadcastChannel | null = null;
		try {
			channel = new BroadcastChannel("aiworkstation_sync");
			channel.onmessage = (event) => {
				if (
					event.data?.type === "WORKBENCH_RELOAD" ||
					event.data?.type === "BOOKMARK_COLLECTED"
				) {
					reloadFromDb();
				}
			};
		} catch {
			// BroadcastChannel might not be supported in some environments
		}

		window.addEventListener("focus", handleVisibilityOrFocus);
		document.addEventListener("visibilitychange", handleVisibilityOrFocus);
		window.addEventListener("message", handleMessage);

		return () => {
			window.removeEventListener("focus", handleVisibilityOrFocus);
			document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
			window.removeEventListener("message", handleMessage);
			channel?.close();
		};
	}, [reloadFromDb]);

	return {
		folders,
		setFolders,
		unclassified,
		setUnclassified,
		settings,
		setSettings,
		activeCategory,
		setActiveCategory,
		activeCategoryRef,
		isInitialLoading,
		reloadFromDb,
	};
}
