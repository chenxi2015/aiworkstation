import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { assertPathWithinRoot } from "../../ai/fs/fsSafety.ts";
import { resolveObsidianVaultDir } from "../../services/obsidian/vault.ts";

const MIME_BY_EXT: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
	svg: "image/svg+xml",
	bmp: "image/bmp",
	avif: "image/avif",
	mp4: "video/mp4",
	mov: "video/quicktime",
	webm: "video/webm",
	mkv: "video/x-matroska",
	m4v: "video/x-m4v",
	mp3: "audio/mpeg",
	wav: "audio/wav",
	m4a: "audio/mp4",
	ogg: "audio/ogg",
	flac: "audio/flac",
	pdf: "application/pdf",
};

const ASSET_EXTS = new Set(Object.keys(MIME_BY_EXT));

/** 递归在磁盘上按文件名查找资源（树只索引 md，资源需走文件系统） */
function findAssetByName(
	dir: string,
	basename: string,
	depth: number,
): string | null {
	if (depth > 8) return null;
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return null;
	}
	for (const entry of entries) {
		if (entry.name.startsWith(".")) continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			const hit = findAssetByName(full, basename, depth + 1);
			if (hit) return hit;
		} else if (entry.name === basename) {
			const ext = path.extname(entry.name).replace(/^\./, "").toLowerCase();
			if (ASSET_EXTS.has(ext)) return full;
		}
	}
	return null;
}

/**
 * GET /api/obsidian/asset?path=<vault 相对路径>&name=<短文件名兜底>
 * 只读回读 Vault 内的图片/音视频/PDF 资源（路径穿越防护，限 vault 根目录内）。
 * name 用于 Obsidian 短路径写法（![[image.png]]），全库按文件名查找。
 */
export async function handleObsidianAssetRequest(
	req: IncomingMessage,
	res: ServerResponse,
): Promise<void> {
	if (req.method !== "GET") {
		res.statusCode = 405;
		res.end("Method not allowed");
		return;
	}
	try {
		const url = new URL(req.url ?? "", "http://localhost");
		const relPath = url.searchParams.get("path") ?? "";
		const name = url.searchParams.get("name") ?? "";
		const vault = resolveObsidianVaultDir();

		let absPath: string | null = null;
		if (relPath) {
			const candidate = path.resolve(vault.path, relPath);
			assertPathWithinRoot(candidate, vault.path);
			if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
				absPath = candidate;
			}
		}
		if (!absPath && name) {
			const found = findAssetByName(vault.path, path.basename(name), 0);
			if (found) {
				assertPathWithinRoot(found, vault.path);
				absPath = found;
			}
		}
		if (!absPath) {
			res.statusCode = 404;
			res.end("资源不存在");
			return;
		}
		const ext = path.extname(absPath).replace(/^\./, "").toLowerCase();
		res.setHeader(
			"Content-Type",
			MIME_BY_EXT[ext] ?? "application/octet-stream",
		);
		res.setHeader("Content-Length", fs.statSync(absPath).size);
		res.setHeader("Cache-Control", "private, max-age=3600");
		fs.createReadStream(absPath).pipe(res);
	} catch (err: unknown) {
		const errMsg = err instanceof Error ? err.message : String(err);
		res.statusCode = 403;
		res.end(errMsg);
	}
}
