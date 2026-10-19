import { ElectronCrawlerWorker } from "./worker.js";

let crawlerWorker: ElectronCrawlerWorker | null = null;

/**
 * Initializes and starts the background Electron Crawler Worker
 */
export function setupElectronCrawler(serverPort: number): void {
	if (crawlerWorker) {
		crawlerWorker.stop();
	}
	crawlerWorker = new ElectronCrawlerWorker(serverPort);
	crawlerWorker.start();
}

/**
 * Stops the background crawler worker during shutdown
 */
export function destroyElectronCrawler(): void {
	if (crawlerWorker) {
		crawlerWorker.stop();
		crawlerWorker = null;
	}
}

export * from "./types.js";
export * from "./service.js";
export * from "./worker.js";

