import { contextBridge, ipcRenderer } from "electron";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "installing"
  | "error";

export interface UpdateState {
  status: UpdateStatus;
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

export type UpdateCheckResult = Omit<UpdateState, "status"> & {
  status: UpdateStatus | "dev";
};

// Expose a minimal, safe API surface to the renderer process.
// Add more methods here only as needed — keep the bridge as thin as possible.
contextBridge.exposeInMainWorld("electronAPI", {
  /** The platform string ("darwin" | "win32" | "linux") */
  platform: process.platform,

  /** Get current application version from main process */
  getVersion: () => {
    return ipcRenderer.invoke("app:get-version");
  },

  /** Get the current updater state machine snapshot */
  getUpdateState: (): Promise<UpdateState> => {
    return ipcRenderer.invoke("updater:get-state");
  },

  /** Subscribe to updater state machine changes from the main process */
  onUpdateState: (callback: (state: UpdateState) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, state: UpdateState) => {
      callback(state);
    };
    ipcRenderer.on("updater:state", subscription);
    return () => {
      ipcRenderer.removeListener("updater:state", subscription);
    };
  },

  /** Trigger an update check (returns the resulting state; "dev" in dev mode) */
  checkForUpdates: (): Promise<UpdateCheckResult> => {
    return ipcRenderer.invoke("updater:check");
  },

  /** Start downloading the available update */
  startDownload: (): Promise<UpdateCheckResult> => {
    return ipcRenderer.invoke("updater:download");
  },

  /** Install the downloaded update (auto restart, or open DMG + quit on unsigned macOS) */
  installUpdate: (): Promise<{ status: string; message?: string; path?: string }> => {
    return ipcRenderer.invoke("updater:install");
  },

  /** Open the downloaded installer file (falls back to the releases page) */
  openDownloadedFile: (): Promise<{ status: string; isLocal?: boolean; path?: string }> => {
    return ipcRenderer.invoke("updater:open-downloaded-file");
  },

  /** Reveal the downloaded installer in the OS file manager */
  showDownloadedInFolder: (): Promise<{ status: string; path?: string; message?: string }> => {
    return ipcRenderer.invoke("updater:show-downloaded-in-folder");
  },

  /** Switch between compact login window and primary dashboard window */
  setWindowMode: (mode: "login" | "main") => {
    return ipcRenderer.invoke("window:set-mode", mode);
  },
});
