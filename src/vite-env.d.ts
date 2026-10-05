/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_CLOUD_API_BASE?: string;
	readonly VITE_APP_VERSION?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

export interface ElectronUpdateDownloadedInfo {
	version?: string;
	releaseNotes?: string | Record<string, unknown>[];
	releaseDate?: string;
}

export interface ElectronCheckUpdateResult {
	status: "success" | "dev" | "error" | string;
	message?: string;
	hasUpdate?: boolean;
	currentVersion?: string;
	latestVersion?: string;
	updateInfo?: unknown;
}

export interface ElectronDownloadProgress {
	percent: number;
	bytesPerSecond?: number;
	transferred?: number;
	total?: number;
}

export interface ElectronAPI {
	platform: "darwin" | "win32" | "linux" | string;
	getVersion?: () => Promise<string>;
	onUpdateDownloaded?: (
		callback: (info: ElectronUpdateDownloadedInfo) => void,
	) => () => void;
	onDownloadProgress?: (
		callback: (progress: ElectronDownloadProgress) => void,
	) => () => void;
	startDownload?: () => Promise<{ status: string; message?: string }>;
	installUpdate?: () => void;
	checkForUpdates?: () => Promise<ElectronCheckUpdateResult>;
}

declare global {
	interface Window {
		electronAPI?: ElectronAPI;
	}
}
