import { contextBridge, ipcRenderer } from "electron";

export interface UpdateDownloadedInfo {
  version?: string;
  releaseNotes?: string | Record<string, unknown>[];
  releaseDate?: string;
}

// Expose a minimal, safe API surface to the renderer process.
// Add more methods here only as needed — keep the bridge as thin as possible.
contextBridge.exposeInMainWorld("electronAPI", {
  /** The platform string ("darwin" | "win32" | "linux") */
  platform: process.platform,

  /** Get current application version from main process */
  getVersion: () => {
    return ipcRenderer.invoke("app:get-version");
  },

  /** Subscribe to update-downloaded notification from main process */
  onUpdateDownloaded: (callback: (info: UpdateDownloadedInfo) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, info: UpdateDownloadedInfo) => {
      callback(info);
    };
    ipcRenderer.on("updater:update-downloaded", subscription);
    return () => {
      ipcRenderer.removeListener("updater:update-downloaded", subscription);
    };
  },

  /** Ask main process to quit and install update */
  installUpdate: () => {
    return ipcRenderer.invoke("updater:install");
  },

  /** Ask main process to open the downloaded update file in OS file explorer / Finder */
  openDownloadedFile: () => {
    return ipcRenderer.invoke("updater:open-downloaded-file");
  },

  /** Ask main process to check for updates manually */
  checkForUpdates: () => {
    return ipcRenderer.invoke("updater:check-for-updates");
  },

  /** Switch between compact login window and primary dashboard window */
  setWindowMode: (mode: "login" | "main") => {
    return ipcRenderer.invoke("window:set-mode", mode);
  },
});

