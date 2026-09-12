import { useStore } from "@tanstack/react-store";
import { useCallback, useMemo } from "react";
import type { ActiveChatScope } from "../../components/workbench/ai/chat/ChatScopePill";
import type { Folder } from "../../components/workbench/types";
import {
	workbenchContextActions,
	workbenchContextStore,
	type WorkbenchContextState,
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
		const rawMaterial = state.activeMaterial;
		if (!rawMaterial) return { scope: null, toggle: () => {} };
		const isDetached = state.detachedMaterialId === rawMaterial.id;
		return {
			scope: {
				type: "material",
				name: rawMaterial.title || "未命名素材",
				isActive: !isDetached,
			},
			toggle: () => {
				if (isDetached) {
					workbenchContextActions.attachMaterialContext();
				} else {
					workbenchContextActions.detachMaterialContext(rawMaterial.id);
				}
			},
		};
	},
};

const SCOPE_TYPE_NAMES: Record<string, string> = {
	document: "文档",
	material: "素材",
	folder: "文件夹",
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

		// Fallback to selected folder if present
		if (selectedFolder) {
			return {
				scope: {
					type: "folder",
					name: selectedFolder.name,
					isActive: scopeMode === "folder",
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
