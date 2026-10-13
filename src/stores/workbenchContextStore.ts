import { Store } from "@tanstack/store";

export interface ActiveDocumentContext {
	id: number;
	title: string;
}

export interface ActiveMaterialContext {
	id: number;
	title: string;
}

export interface ActiveFolderContext {
	id: number;
	name: string;
}

export interface ActiveNoteContext {
	path: string;
	title: string;
}

/** 提议卡片确认后的跨页面待执行动作（单槽、一次性消费、60s TTL） */
export interface PendingWorkbenchAction {
	targetObject: {
		kind: "document" | "note";
		module: string;
		documentId?: number;
		notePath?: string;
		title: string;
	};
	actionId: string;
	/** 传给 bridge action 的 payload（通常是改写 instruction） */
	payload?: string;
	/** Unix ms，到期未消费则失效 */
	expiresAt: number;
}

export interface WorkbenchContextState {
	/** Current active module code, e.g. 'editor', 'creator', 'bookmarks' */
	activeModule: string;
	/** Currently active editor document */
	activeDocument: ActiveDocumentContext | null;
	/** Currently active creator material */
	activeMaterial: ActiveMaterialContext | null;
	/** Currently active bookmark folder */
	activeFolder: ActiveFolderContext | null;
	/** Currently active obsidian note */
	activeNote: ActiveNoteContext | null;
	/** When set to a document id, this document is detached from the chat prompt context */
	detachedDocumentId: number | null;
	/** When set to a material id, this material is detached from the chat prompt context */
	detachedMaterialId: number | null;
	/** When set to a note path, this note is detached from the chat prompt context */
	detachedNotePath: string | null;
	/** Single-slot pending action written by a confirmed proposal card */
	pendingAction: PendingWorkbenchAction | null;
}

const initialState: WorkbenchContextState = {
	activeModule: "workbench",
	activeDocument: null,
	activeMaterial: null,
	activeFolder: null,
	activeNote: null,
	detachedDocumentId: null,
	detachedMaterialId: null,
	detachedNotePath: null,
	pendingAction: null,
};

const PENDING_ACTION_TTL_MS = 60_000;

/**
 * Global synchronous store for active workbench context.
 * Serves as the Single Source of Truth for the right-side AI Q&A panel
 * and eliminates lifecycle/network latency when switching documents or modules.
 */
export const workbenchContextStore = new Store<WorkbenchContextState>(
	initialState,
);

export const workbenchContextActions = {
	setActiveModule(activeModule: string) {
		if (workbenchContextStore.state.activeModule === activeModule) return;
		workbenchContextStore.setState((prev) => ({
			...prev,
			activeModule,
		}));
	},

	setActiveDocument(doc: ActiveDocumentContext | null) {
		const current = workbenchContextStore.state.activeDocument;
		if (current?.id === doc?.id && current?.title === doc?.title) return;
		workbenchContextStore.setState((prev) => ({
			...prev,
			activeDocument: doc,
			// Reset detached status when switching to a different document
			detachedDocumentId: null,
		}));
	},

	detachDocumentContext(docId: number) {
		workbenchContextStore.setState((prev) => ({
			...prev,
			detachedDocumentId: docId,
		}));
	},

	attachDocumentContext() {
		workbenchContextStore.setState((prev) => ({
			...prev,
			detachedDocumentId: null,
		}));
	},

	setActiveMaterial(material: ActiveMaterialContext | null) {
		const current = workbenchContextStore.state.activeMaterial;
		if (current?.id === material?.id && current?.title === material?.title)
			return;
		workbenchContextStore.setState((prev) => ({
			...prev,
			activeMaterial: material,
			// Reset detached status when switching to a different material
			detachedMaterialId: null,
		}));
	},

	detachMaterialContext(materialId: number) {
		workbenchContextStore.setState((prev) => ({
			...prev,
			detachedMaterialId: materialId,
		}));
	},

	attachMaterialContext() {
		workbenchContextStore.setState((prev) => ({
			...prev,
			detachedMaterialId: null,
		}));
	},

	setActiveNote(note: ActiveNoteContext | null) {
		const current = workbenchContextStore.state.activeNote;
		if (current?.path === note?.path && current?.title === note?.title) return;
		workbenchContextStore.setState((prev) => ({
			...prev,
			activeNote: note,
			detachedNotePath: null,
		}));
	},

	detachNoteContext(notePath: string) {
		workbenchContextStore.setState((prev) => ({
			...prev,
			detachedNotePath: notePath,
		}));
	},

	attachNoteContext() {
		workbenchContextStore.setState((prev) => ({
			...prev,
			detachedNotePath: null,
		}));
	},

	setActiveFolder(folder: ActiveFolderContext | null) {
		const current = workbenchContextStore.state.activeFolder;
		if (current?.id === folder?.id && current?.name === folder?.name) return;
		workbenchContextStore.setState((prev) => ({
			...prev,
			activeFolder: folder,
		}));
	},

	/** Write the single-slot pending action with a fresh 60s TTL */
	setPendingAction(action: Omit<PendingWorkbenchAction, "expiresAt"> | null) {
		workbenchContextStore.setState((prev) => ({
			...prev,
			pendingAction: action
				? { ...action, expiresAt: Date.now() + PENDING_ACTION_TTL_MS }
				: null,
		}));
	},

	/**
	 * One-time consume: returns the pending action only when it has not
	 * expired; expired or absent actions clear the slot and return null.
	 */
	consumePendingAction(): PendingWorkbenchAction | null {
		const action = workbenchContextStore.state.pendingAction;
		if (!action) return null;
		workbenchContextStore.setState((prev) => ({
			...prev,
			pendingAction: null,
		}));
		if (Date.now() > action.expiresAt) return null;
		return action;
	},

	/** Peek at the current pending action without consuming it */
	getPendingAction(): PendingWorkbenchAction | null {
		const action = workbenchContextStore.state.pendingAction;
		if (!action) return null;
		if (Date.now() > action.expiresAt) {
			workbenchContextStore.setState((prev) => ({
				...prev,
				pendingAction: null,
			}));
			return null;
		}
		return action;
	},
};
