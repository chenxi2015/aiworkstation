import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import { createServer, Socket } from "node:net";
import { isDev, resolveDataDir, resolveFromRoot, SERVER_CONFIG } from "./config.js";

let serverProcess: ChildProcess | null = null;
let currentPort: number = SERVER_CONFIG.DEFAULT_PORT;

/**
 * Find an available TCP port starting from the preferred port
 */
export function findFreePort(preferred: number = SERVER_CONFIG.DEFAULT_PORT): Promise<number> {
	return new Promise((resolve) => {
		const server = createServer();
		server.listen(preferred, SERVER_CONFIG.HOST, () => {
			const addr = server.address() as { port: number };
			server.close(() => resolve(addr.port));
		});
		server.on("error", () => {
			// Preferred port is in use; let OS assign an available one
			const randomServer = createServer();
			randomServer.listen(0, SERVER_CONFIG.HOST, () => {
				const addr = randomServer.address() as { port: number };
				randomServer.close(() => resolve(addr.port));
			});
		});
	});
}

/**
 * Poll until the HTTP server accepts TCP connections
 */
export function waitForServer(
	port: number,
	timeout: number = SERVER_CONFIG.STARTUP_TIMEOUT_MS,
): Promise<void> {
	const deadline = Date.now() + timeout;
	return new Promise((resolve, reject) => {
		const tryConnect = () => {
			const socket = new Socket();
			socket.connect(port, SERVER_CONFIG.HOST, () => {
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

/**
 * Launch the embedded Nitro server as a background Node.js child process
 */
export async function startNitroServer(): Promise<number> {
	currentPort = await findFreePort(SERVER_CONFIG.DEFAULT_PORT);
	const serverEntry = resolveFromRoot(".output", "server", "index.mjs");
	const dataDir = resolveDataDir();

	try {
		if (!fs.existsSync(dataDir)) {
			fs.mkdirSync(dataDir, { recursive: true });
		}
	} catch (err) {
		console.error("[electron] Failed to ensure data directory exists:", dataDir, err);
	}

	serverProcess = spawn(process.execPath, [serverEntry], {
		cwd: dataDir,
		env: {
			...process.env,
			PORT: String(currentPort),
			HOST: SERVER_CONFIG.HOST,
			NODE_ENV: "production",
			// Instruct Electron binary to run as pure Node.js CLI runtime
			ELECTRON_RUN_AS_NODE: "1",
			AIWORKSTATION_DATA_DIR: dataDir,
			...(process.env.VITE_CLOUD_API_BASE
				? { VITE_CLOUD_API_BASE: process.env.VITE_CLOUD_API_BASE }
				: {}),
		},
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

	await waitForServer(currentPort);
	console.log(`[electron] Nitro server ready on port ${currentPort}`);

	return currentPort;
}

/**
 * Terminate the embedded Nitro server process
 */
export function stopNitroServer(): void {
	if (serverProcess) {
		serverProcess.kill();
		serverProcess = null;
	}
}

/**
 * Get current running port of the local Nitro server
 */
export function getServerPort(): number {
	return currentPort;
}
