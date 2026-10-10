/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_CLOUD_API_BASE?: string;
	readonly VITE_APP_VERSION?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

export type ElectronUpdateStatus =
	| "idle"
	| "checking"
	| "available"
	| "not-available"
	| "downloading"
	| "downloaded"
	| "installing"
	| "error";

export interface ElectronUpdateState {
	status: ElectronUpdateStatus;
	currentVersion: string;
	latestVersion?: string;
	releaseNotes?: string;
	releaseDate?: string;
	progress?: number;
	downloadedFile?: string;
	canAutoInstall: boolean;
	checkedAt?: number;
	error?: string;
}

export type ElectronUpdateCheckResult = Omit<ElectronUpdateState, "status"> & {
	status: ElectronUpdateStatus | "dev";
};

export interface ElectronAPI {
	platform: "darwin" | "win32" | "linux" | string;
	getVersion?: () => Promise<string>;
	getUpdateState?: () => Promise<ElectronUpdateState>;
	onUpdateState?: (
		callback: (state: ElectronUpdateState) => void,
	) => () => void;
	checkForUpdates?: () => Promise<ElectronUpdateCheckResult>;
	startDownload?: () => Promise<ElectronUpdateCheckResult>;
	installUpdate?: () => Promise<{
		status: string;
		message?: string;
		path?: string;
	}>;
	openDownloadedFile?: () => Promise<{
		status: string;
		isLocal?: boolean;
		path?: string;
	}>;
	showDownloadedInFolder?: () => Promise<{
		status: string;
		path?: string;
		message?: string;
	}>;
	setWindowMode?: (mode: "login" | "main") => Promise<{ success: boolean }>;
}

declare global {
	interface Window {
		electronAPI?: ElectronAPI;
	}
}
