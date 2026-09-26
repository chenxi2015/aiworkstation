import { contextBridge, ipcRenderer } from "electron";

// Expose a minimal, safe API surface to the renderer process.
// Add more methods here only as needed — keep the bridge as thin as possible.
contextBridge.exposeInMainWorld("electronAPI", {
  /** The platform string ("darwin" | "win32" | "linux") */
  platform: process.platform,
});
