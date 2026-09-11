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

export interface WorkbenchContextState {
	/** Current active module code, e.g. 'editor', 'creator', 'bookmarks' */
	activeModule: string;
	/** Currently active editor document */
	activeDocument: ActiveDocumentContext | null;
	/** Currently active creator material */
	activeMaterial: ActiveMaterialContext | null;
	/** Currently active bookmark folder */
	activeFolder: ActiveFolderContext | null;
}

const initialState: WorkbenchContextState = {
	activeModule: "workbench",
	activeDocument: null,
	activeMaterial: null,
	activeFolder: null,
};

/**
 * Global synchronous store for active workbench context.
 * Serves as the Single Source of Truth for the right-side AI Q&A panel
 * and eliminates lifecycle/network latency when switching documents or modules.
 */
export const workbenchContextStore = new Store<WorkbenchContextState>(initialState);

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
		}));
	},

	setActiveMaterial(material: ActiveMaterialContext | null) {
		const current = workbenchContextStore.state.activeMaterial;
		if (current?.id === material?.id && current?.title === material?.title) return;
		workbenchContextStore.setState((prev) => ({
			...prev,
			activeMaterial: material,
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
};
