import { useStore } from "@tanstack/react-store";
import { useCallback, useMemo } from "react";
import type { ActiveChatScope } from "../../components/workbench/ai/chat/chatScopeTypes";
import type { Folder } from "../../components/workbench/types";
import {
	type WorkbenchContextState,
	workbenchContextActions,
	workbenchContextStore,
} from "../../stores/workbenchContextStore";

export interface UseChatScopeOptions {
	activeModule?: string;
	selectedFolder?: Folder | null;
	scopeMode?: "global" | "folder";
	onToggleFolderScope?: () => void;
}

export interface UseChatScopeResult {
	activeScope: ActiveChatScope | null;
	toggleScope: () => void;
	isFolderScoped: boolean;
	placeholder: string;
}

interface ScopeResolution {
	scope: ActiveChatScope | null;
	toggle: () => void;
}

type ScopeResolver = (state: WorkbenchContextState) => ScopeResolution;

/**
 * Module-level scope resolution strategies.
 * Extend this map to support new modules without modifying the Q&A panel.
 */
const MODULE_SCOPE_RESOLVERS: Record<string, ScopeResolver> = {
	editor: (state) => {
		const rawDoc = state.activeDocument;
		if (!rawDoc) return { scope: null, toggle: () => {} };
		const isDetached = state.detachedDocumentId === rawDoc.id;
		return {
			scope: {
				type: "document",
				name: rawDoc.title || "未命名文档",
				isActive: !isDetached,
				documentId: rawDoc.id,
			},
			toggle: () => {
				if (isDetached) {
					workbenchContextActions.attachDocumentContext();
				} else {
					workbenchContextActions.detachDocumentContext(rawDoc.id);
				}
			},
		};
	},
	creator: (state) => {
		// 1. In creator studio (Editor), prioritize active writing document
		const rawDoc = state.activeDocument;
		if (rawDoc) {
			const isDetached = state.detachedDocumentId === rawDoc.id;
			return {
				scope: {
					type: "document",
					name: rawDoc.title || "未命名文档",
					isActive: !isDetached,
					documentId: rawDoc.id,
				},
				toggle: () => {
					if (isDetached) {
						workbenchContextActions.attachDocumentContext();
					} else {
						workbenchContextActions.detachDocumentContext(rawDoc.id);
					}
				},
			};
		}

		// 2. In creator materials, fall back to active material
		const rawMaterial = state.activeMaterial;
		if (rawMaterial) {
			const isDetached = state.detachedMaterialId === rawMaterial.id;
			return {
				scope: {
					type: "material",
					name: rawMaterial.title || "未命名素材",
					isActive: !isDetached,
					materialId: rawMaterial.id,
				},
				toggle: () => {
					if (isDetached) {
						workbenchContextActions.attachMaterialContext();
					} else {
						workbenchContextActions.detachMaterialContext(rawMaterial.id);
					}
				},
			};
		}

		return { scope: null, toggle: () => {} };
	},
	obsidian: (state) => {
		const rawNote = state.activeNote;
		if (!rawNote) return { scope: null, toggle: () => {} };
		const isDetached = state.detachedNotePath === rawNote.path;
		return {
			scope: {
				type: "note",
				name:
					rawNote.title ||
					rawNote.path.split("/").pop()?.replace(/\.md$/i, "") ||
					"未命名笔记",
				isActive: !isDetached,
				notePath: rawNote.path,
			},
			toggle: () => {
				if (isDetached) {
					workbenchContextActions.attachNoteContext();
				} else {
					workbenchContextActions.detachNoteContext(rawNote.path);
				}
			},
		};
	},
	workbench: (state) => {
		// 1. If a specific bookmark item is active
		const rawBookmark = state.activeBookmark;
		if (rawBookmark) {
			return {
				scope: {
					type: "bookmark",
					name: rawBookmark.title || "未命名书签",
					isActive: true,
					bookmarkId: rawBookmark.id,
					url: rawBookmark.url,
					iconUrl: rawBookmark.icon,
					folderId: rawBookmark.folderId ?? undefined,
				},
				toggle: () => {
					workbenchContextActions.setActiveBookmark(null);
				},
			};
		}

		// 2. If an active folder is set in store
		const rawFolder = state.activeFolder;
		if (rawFolder) {
			return {
				scope: {
					type: "folder",
					name: rawFolder.name,
					isActive: true,
					folderId: rawFolder.id,
				},
				toggle: () => {
					workbenchContextActions.setActiveFolder(null);
				},
			};
		}

		return { scope: null, toggle: () => {} };
	},
};

const SCOPE_TYPE_NAMES: Record<string, string> = {
	document: "文档",
	material: "素材",
	folder: "文件夹",
	note: "笔记",
	bookmark: "书签",
};

/**
 * Custom hook to manage global vs. local scoped entity Q&A state.
 * Implements strategy pattern for modular, extensible scope management across all workbench modules.
 */
export function useChatScope({
	activeModule,
	selectedFolder,
	scopeMode = "global",
	onToggleFolderScope,
}: UseChatScopeOptions = {}): UseChatScopeResult {
	const contextState = useStore(workbenchContextStore);
	const currentMod = activeModule ?? contextState.activeModule;

	const resolution = useMemo<ScopeResolution>(() => {
		const resolver = MODULE_SCOPE_RESOLVERS[currentMod];
		if (resolver) {
			const res = resolver(contextState);
			if (res.scope) return res;
		}

		// Fallback to active document if open
		if (contextState.activeDocument) {
			const rawDoc = contextState.activeDocument;
			const isDetached = contextState.detachedDocumentId === rawDoc.id;
			return {
				scope: {
					type: "document",
					name: rawDoc.title || "未命名文档",
					isActive: !isDetached,
					documentId: rawDoc.id,
				},
				toggle: () => {
					if (isDetached) {
						workbenchContextActions.attachDocumentContext();
					} else {
						workbenchContextActions.detachDocumentContext(rawDoc.id);
					}
				},
			};
		}

		// Fallback to selected folder if present
		if (selectedFolder) {
			return {
				scope: {
					type: "folder",
					name: selectedFolder.name,
					isActive: scopeMode === "folder",
					folderId: selectedFolder.id,
				},
				toggle: () => {
					onToggleFolderScope?.();
				},
			};
		}

		return {
			scope: null,
			toggle: () => {},
		};
	}, [
		currentMod,
		contextState,
		selectedFolder,
		scopeMode,
		onToggleFolderScope,
	]);

	const toggleScope = useCallback(() => {
		resolution.toggle();
	}, [resolution]);

	const isFolderScoped = Boolean(
		resolution.scope?.type === "folder"
			? resolution.scope.isActive
			: scopeMode === "folder" && selectedFolder,
	);

	const placeholder = useMemo(() => {
		const scope = resolution.scope;
		if (!scope?.isActive) {
			return "发消息、输入 @ 引用书签或文件夹...";
		}
		const typeName = SCOPE_TYPE_NAMES[scope.type] || "内容";
		return `针对当前${typeName}提问，或输入 @ 引用...`;
	}, [resolution.scope]);

	return {
		activeScope: resolution.scope,
		toggleScope,
		isFolderScoped,
		placeholder,
	};
}
