import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { LibraryElement } from "../../shared/excalidraw/libraryItem.ts";
import { getItemBounds } from "../../shared/excalidraw/libraryItem.ts";
import builtinCatalog from "./data/excalidrawCatalog.json" with { type: "json" };

/**
 * Local-first access to the public Excalidraw library catalog.
 *
 * - Catalog metadata (`excalidrawCatalog.json`) is bundled in the repo for
 *   instant 100% offline search without touching GitHub.
 * - `.excalidrawlib` files are read from `~/.aiworkstation/excalidraw-libs`
 *   (permanent local cache). If a file is missing on a fresh machine, we try
 *   domestic-friendly CDNs (`libraries.excalidraw.com`, `fastly.jsdelivr.net`,
 *   `cdn.jsdelivr.net`) before falling back to GitHub raw.
 */

const MIRROR_BASES = [
	"https://libraries.excalidraw.com",
	"https://fastly.jsdelivr.net/gh/excalidraw/excalidraw-libraries@main",
	"https://cdn.jsdelivr.net/gh/excalidraw/excalidraw-libraries@main",
	"https://raw.githubusercontent.com/excalidraw/excalidraw-libraries/main",
];
const CACHE_DIR = join(homedir(), ".aiworkstation", "excalidraw-libs");
const MAX_BYTES = 20 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 5_000;

export interface CatalogEntry {
	id: string;
	name: string;
	description: string;
	source: string;
	authors?: { name: string }[];
	itemNames?: string[];
}

export interface LibraryItem {
	index: number;
	name?: string;
	elements: LibraryElement[];
}

function getCacheFilePath(relPath: string): string {
	return join(CACHE_DIR, relPath.replace(/[^\w.-]/g, "_"));
}

/** Check whether a catalog library file is already cached on local disk. */
export function isLibraryCached(source: string): boolean {
	try {
		return existsSync(getCacheFilePath(`libraries/${source}`));
	} catch {
		return false;
	}
}

/** Read from permanent disk cache first; on miss, try CDN mirrors in order. */
async function cachedFetch(relPath: string): Promise<string> {
	const file = getCacheFilePath(relPath);
	try {
		const info = await stat(file);
		if (info.size > 10) {
			return await readFile(file, "utf8");
		}
	} catch {
		// cache miss
	}

	let lastError = "所有镜像均不可达";
	for (const base of MIRROR_BASES) {
		try {
			const res = await fetch(`${base}/${relPath}`, {
				signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			});
			if (!res.ok) {
				lastError = `${base} HTTP ${res.status}`;
				continue;
			}
			const text = await res.text();
			if (Buffer.byteLength(text) > MAX_BYTES) {
				throw new Error(`图库文件超过 ${MAX_BYTES} 字节上限`);
			}
			await mkdir(CACHE_DIR, { recursive: true });
			await writeFile(file, text, "utf8");
			return text;
		} catch (err) {
			const msg = (err as Error).message;
			if (msg.includes("字节上限")) {
				throw err;
			}
			lastError = msg;
		}
	}
	throw new Error(`图库下载失败 (${relPath}): ${lastError}`);
}

export async function loadCatalog(): Promise<CatalogEntry[]> {
	return builtinCatalog as CatalogEntry[];
}

/** Rank catalog entries by token hits in name / description / item names, preferring cached libraries. */
export async function searchCatalog(
	query: string,
	limit = 8,
	onlyCached = false,
): Promise<CatalogEntry[]> {
	const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
	const catalog = await loadCatalog();
	const scored = catalog
		.filter((entry) => !onlyCached || isLibraryCached(entry.source))
		.map((entry) => {
			const name = entry.name.toLowerCase();
			const rest =
				`${entry.description} ${(entry.itemNames ?? []).join(" ")}`.toLowerCase();
			const hitScore = tokens.reduce(
				(sum, t) => sum + (name.includes(t) ? 3 : 0) + (rest.includes(t) ? 1 : 0),
				0,
			);
			const cachedBonus = hitScore > 0 && isLibraryCached(entry.source) ? 0.5 : 0;
			return { entry, score: hitScore + cachedBonus };
		});
	return scored
		.filter((s) => s.score > 0)
		.sort((a, b) => b.score - a.score)
		.slice(0, limit)
		.map((s) => s.entry);
}

/** Normalize v1 (array of arrays) and v2 (`libraryItems`/`library`) formats. */
function normalizeItems(raw: unknown): LibraryItem[] {
	const lib = raw as {
		libraryItems?: unknown[];
		library?: unknown[];
		items?: unknown[];
	};
	const list = lib?.libraryItems ?? lib?.library ?? lib?.items;
	if (!Array.isArray(list)) throw new Error("图库文件缺少 libraryItems");
	return list.flatMap((item, index) => {
		const elements = Array.isArray(item)
			? item
			: (item as { elements?: unknown }).elements;
		if (!Array.isArray(elements) || elements.length === 0) return [];
		return [
			{
				index,
				name: (item as { name?: string }).name,
				elements: elements as LibraryElement[],
			},
		];
	});
}

/** Load all items of one catalog library; `source` must be catalog-listed. */
export async function loadLibraryItems(source: string): Promise<LibraryItem[]> {
	const catalog = await loadCatalog();
	if (!catalog.some((e) => e.source === source)) {
		throw new Error(`图库 ${source} 不在官方目录中`);
	}
	const text = await cachedFetch(`libraries/${source}`);
	return normalizeItems(JSON.parse(text));
}

/** One-line description of an item so the model can pick by size and text. */
export function describeItem(item: LibraryItem): string {
	const b = getItemBounds(item.elements);
	const texts = item.elements
		.filter((e) => e.type === "text" && typeof e.text === "string")
		.map((e) => String(e.text).replace(/\s+/g, " ").slice(0, 16))
		.slice(0, 3);
	const hasImage = item.elements.some((e) => e.fileId);
	return `#${item.index} ${item.name ?? "(未命名)"} · ${item.elements.length} 元素 · ${Math.round(b.width)}x${Math.round(b.height)}${texts.length ? ` · 文字: ${texts.join("/")}` : ""}${hasImage ? " · 含图片(不可用)" : ""}`;
}
