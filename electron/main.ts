import { app, BrowserWindow, dialog, screen, shell } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, Socket } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Path resolution ──────────────────────────────────────────────────────────
// In production the main process lives in:  <app>/resources/app/electron/main.js
// The Nitro server bundle lives in:         <app>/resources/app/.output/server/index.mjs
// In development we run from the repo root.
const isDev = !app.isPackaged;

function resolveFromRoot(...parts: string[]): string {
  if (app.isPackaged) {
    // extraResources are placed in Contents/Resources/ (process.resourcesPath)
    return path.join(process.resourcesPath, ...parts);
  }
  // Dev: __dirname = electron/, go up one level to repo root
  return path.resolve(__dirname, "..", ...parts);
}

// ── Find a free TCP port ──────────────────────────────────────────────────────
function findFreePort(preferred = 3888): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(preferred, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      server.close(() => resolve(addr.port));
    });
    server.on("error", () => {
      // preferred port is busy, let OS assign one
      const s2 = createServer();
      s2.listen(0, "127.0.0.1", () => {
        const addr = s2.address() as { port: number };
        s2.close(() => resolve(addr.port));
      });
    });
  });
}

// ── Wait until the HTTP server is accepting connections ───────────────────────
function waitForServer(port: number, timeout = 15_000): Promise<void> {
  const deadline = Date.now() + timeout;
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = new Socket();
      socket.connect(port, "127.0.0.1", () => {
        socket.destroy();
        resolve();
      });
      socket.on("error", () => {
        socket.destroy();
        if (Date.now() > deadline) {
          reject(new Error(`Server on port ${port} did not start in time`));
        } else {
          setTimeout(tryConnect, 200);
        }
      });
    };
    tryConnect();
  });
}

// ── Globals ───────────────────────────────────────────────────────────────────
let serverProcess: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;
let serverPort = 3888;

// ── Start the embedded Nitro server ──────────────────────────────────────────
async function startServer(): Promise<void> {
  serverPort = await findFreePort(3888);

  const serverEntry = resolveFromRoot(".output", "server", "index.mjs");

  const userDataPath = app.getPath("userData");
  try {
    const fs = await import("node:fs");
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
  } catch {}

  serverProcess = spawn(process.execPath, [serverEntry], {
    cwd: userDataPath,
    env: {
      ...process.env,
      PORT: String(serverPort),
      HOST: "127.0.0.1",
      NODE_ENV: "production",
      // Crucial: instruct Electron binary to run as pure Node.js CLI runtime.
      // Without this, Electron launches as a GUI app and creates a duplicate Dock icon!
      ELECTRON_RUN_AS_NODE: "1",
      // Data directory: ~/Library/Application Support/<AppName> or equivalent
      AIWORKSTATION_DATA_DIR: userDataPath,
    },
    // Pipe stdio so server errors can be logged even in production
    stdio: isDev ? "inherit" : ["ignore", "pipe", "pipe"],
  });

  if (!isDev && serverProcess.stderr) {
    serverProcess.stderr.on("data", (chunk: Buffer) => {
      console.error("[electron][server-stderr]", chunk.toString().trim());
    });
  }

  serverProcess.on("error", (err) => {
    console.error("[electron] server process error:", err);
  });

  await waitForServer(serverPort);
  console.log(`[electron] Nitro server ready on port ${serverPort}`);
}

// ── Create the main BrowserWindow ─────────────────────────────────────────────
async function createWindow(): Promise<void> {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: workWidth, height: workHeight } = primaryDisplay.workAreaSize;

  // Optimized for 1080p displays (1920x1080, work area typically ~1920x1000).
  // 1680x960 accommodates the 4-column widget dashboard + AI panel comfortably.
  const optimalWidth = Math.min(1680, workWidth);
  const optimalHeight = Math.min(960, workHeight);

  mainWindow = new BrowserWindow({
    width: optimalWidth,
    height: optimalHeight,
    // Minimum dimensions based on Figure 2 (uncompressed dashboard cards + AI sidebar)
    minWidth: Math.min(1366, workWidth),
    minHeight: Math.min(800, workHeight),
    center: true,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    ...(process.platform === "darwin"
      ? { trafficLightPosition: { x: 18, y: 20 } }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      // Allow loading from localhost
      webSecurity: true,
    },
    show: false, // show only after page loads to avoid flash
  });

  mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    if (isDev) mainWindow?.webContents.openDevTools();
  });

  // Retry loading if initial connection refused while server warms up
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[electron] Page load failed: ${validatedURL} (${errorCode} - ${errorDescription})`);
    if (errorCode === -102 /* ERR_CONNECTION_REFUSED */) {
      setTimeout(() => {
        mainWindow?.loadURL(`http://127.0.0.1:${serverPort}`);
      }, 500);
    }
  });

  // Enable DevTools shortcut (F12 or Cmd+Alt+I) even in packaged app for diagnostics
  mainWindow.webContents.on("before-input-event", (_event, input) => {
    const isDevToolsKey =
      input.key === "F12" ||
      ((input.meta || input.control) && input.alt && input.key.toLowerCase() === "i");
    if (isDevToolsKey && input.type === "keyDown") {
      mainWindow?.webContents.toggleDevTools();
    }
  });

  // Open external links in the system browser, not inside the app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(`http://127.0.0.1:${serverPort}`)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
// Enforce single instance — prevents duplicate dock icons when running repeatedly
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  // If a second instance tries to open, focus the existing window
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    // Set dock icon in dev mode (packaged app uses build/icon.icns automatically)
    if (isDev && process.platform === "darwin") {
      const devIconPath = resolveFromRoot("build", "icon.png");
      app.dock?.setIcon(devIconPath);
    }

    try {
      await startServer();
      await createWindow();
    } catch (err) {
      console.error("[electron] Startup failed:", err);
      dialog.showErrorBox(
        "Application Startup Error",
        `Failed to start local service:\n${err instanceof Error ? err.message : String(err)}`
      );
      app.quit();
    }

    // macOS: re-create window when dock icon is clicked
    app.on("activate", async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        await createWindow();
      }
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  const cleanup = () => {
    if (serverProcess) {
      serverProcess.kill();
      serverProcess = null;
    }
  };

  app.on("before-quit", cleanup);
  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
}
