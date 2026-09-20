import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveObsidianVaultDir } from "./vault.ts";

/**
 * Dataview 查询引擎（常用子集，服务端执行）：
 * - 查询类型：TABLE [WITHOUT ID] / LIST / TASK
 * - FROM：#标签（含子标签前缀匹配）、"文件夹"、-取反，AND 组合
 * - WHERE：field = "v" / != / !field / field / contains(field, "v") /
 *   any(file.tasks, (t) => !t.fullyCompleted)，AND 组合；不认识的表达式忽略
 * - SORT：file.mday / file.ctime / file.name / frontmatter 字段，ASC|DESC
 * - LIMIT n（默认上限 200 行）
 * - TABLE 列：frontmatter 字段、file.name/link/mday/ctime/folder/size/tasks、
 *   (date(today) - file.mday).day 形式的日期差，AS "别名"
 */

export interface DataviewTaskItem {
	relPath: string;
	name: string;
	text: string;
	completed: boolean;
}

export interface DataviewRow {
	relPath: string;
	name: string;
	values: (string | number | null)[];
}

export interface DataviewResult {
	type: "table" | "list" | "task";
	columns: string[];
	rows: DataviewRow[];
	tasks: DataviewTaskItem[];
	error?: string;
}

interface FileMeta {
	relPath: string;
	name: string;
	folder: string;
	mtime: number;
	ctime: number;
	size: number;
	frontmatter: Record<string, unknown>;
	tags: string[];
	tasks: { text: string; completed: boolean }[];
}

const SKIP_DIRS = new Set([".obsidian", ".trash", "node_modules"]);
const MAX_FILES = 1500;
const MAX_DEPTH = 8;
const MAX_READ_BYTES = 256 * 1024;
const ROW_LIMIT = 200;

let cache: { at: number; files: FileMeta[] } | null = null;
const CACHE_MS = 15_000;

export function invalidateDataviewCache(): void {
	cache = null;
}

// ── Vault 扫描 + 元数据提取 ─────────────────────────────────

async function collectFiles(
	dir: string,
	base: string,
	out: string[],
	depth: number,
): Promise<void> {
	if (depth > MAX_DEPTH || out.length >= MAX_FILES) return;
	let entries: import("node:fs").Dirent[];
	try {
		entries = await fs.readdir(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		if (out.length >= MAX_FILES) break;
		if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			await collectFiles(full, base, out, depth + 1);
		} else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
			out.push(full);
		}
	}
}

function cleanScalar(value: string): string {
	const trimmed = value.trim();
	const quoted = trimmed.match(/^(["'])([\s\S]*)\1$/);
	return quoted ? (quoted[2] ?? "") : trimmed;
}

/** 轻量 YAML 子集解析（标量 / 行内数组 / 短横线列表） */
function parseFrontmatter(yaml: string): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	let lastKey: string | null = null;
	for (const rawLine of yaml.split("\n")) {
		const line = rawLine.replace(/\s+$/, "");
		if (!line.trim() || line.trim().startsWith("#")) continue;
		const listItem = line.match(/^\s+-\s+(.*)$/);
		if (listItem && lastKey) {
			const prev = out[lastKey];
			const arr = Array.isArray(prev)
				? prev
				: prev == null || prev === ""
					? []
					: [prev];
			arr.push(cleanScalar(listItem[1] ?? ""));
			out[lastKey] = arr;
			continue;
		}
		const kv = line.match(/^([^\s:#][^:]*):\s*(.*)$/);
		if (kv) {
			const key = (kv[1] ?? "").trim();
			lastKey = key;
			const value = (kv[2] ?? "").trim();
			if (!value) {
				out[key] = "";
				continue;
			}
			const inlineArr = value.match(/^\[(.*)\]$/);
			if (inlineArr) {
				out[key] = (inlineArr[1] ?? "")
					.split(",")
					.map(cleanScalar)
					.filter(Boolean);
			} else {
				out[key] = cleanScalar(value);
			}
		}
	}
	return out;
}

function extractMeta(
	relPath: string,
	raw: string,
	stat: { mtimeMs: number; birthtimeMs: number; size: number },
): FileMeta {
	let frontmatter: Record<string, unknown> = {};
	let body = raw;
	const fmMatch = raw.match(/^---\n([\s\S]*?)\n---(\n|$)/);
	if (fmMatch) {
		frontmatter = parseFrontmatter(fmMatch[1] ?? "");
		body = raw.slice(fmMatch[0].length);
	}

	const tags = new Set<string>();
	const fmTags = frontmatter.tags ?? frontmatter.tag;
	const fmTagList = Array.isArray(fmTags)
		? fmTags
		: typeof fmTags === "string"
			? fmTags.split(/[\s,]+/)
			: [];
	for (const t of fmTagList) {
		const cleaned = String(t).replace(/^#/, "").trim();
		if (cleaned) tags.add(cleaned);
	}
	const tagRe = /(?<![\w\p{L}\p{N}/])#([\p{L}\p{N}_][\p{L}\p{N}_/-]*)/gu;
	let m = tagRe.exec(body);
	while (m) {
		if (m[1]) tags.add(m[1]);
		m = tagRe.exec(body);
	}

	const tasks: { text: string; completed: boolean }[] = [];
	for (const line of body.split("\n")) {
		const t = line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/);
		if (t) tasks.push({ text: (t[2] ?? "").trim(), completed: t[1] !== " " });
	}

	return {
		relPath,
		name: path.basename(relPath).replace(/\.md$/i, ""),
		folder: path.dirname(relPath) === "." ? "" : path.dirname(relPath),
		mtime: stat.mtimeMs,
		ctime: stat.birthtimeMs,
		size: stat.size,
		frontmatter,
		tags: [...tags],
		tasks,
	};
}

async function loadFiles(): Promise<FileMeta[]> {
	if (cache && Date.now() - cache.at < CACHE_MS) return cache.files;
	const { path: root } = resolveObsidianVaultDir();
	const absFiles: string[] = [];
	await collectFiles(root, root, absFiles, 0);
	const files = await Promise.all(
		absFiles.map(async (abs) => {
			try {
				const relPath = path.relative(root, abs);
				const stat = await fs.stat(abs);
				const fh = await fs.open(abs, "r");
				try {
					const buf = Buffer.alloc(Math.min(stat.size, MAX_READ_BYTES));
					await fh.read(buf, 0, buf.length, 0);
					return extractMeta(relPath, buf.toString("utf8"), stat);
				} finally {
					await fh.close();
				}
			} catch {
				return null;
			}
		}),
	);
	const result = files.filter((f): f is FileMeta => f !== null);
	cache = { at: Date.now(), files: result };
	return result;
}

// ── 查询解析 ────────────────────────────────────────────────

interface Column {
	expr: string;
	alias: string;
}

interface Query {
	type: "table" | "list" | "task";
	withoutId: boolean;
	columns: Column[];
	sources: { tag?: string; folder?: string; negate: boolean }[];
	where: string[];
	sortField: string;
	sortDesc: boolean;
	limit: number;
}

const CLAUSE_RE = /^(TABLE|LIST|TASK|FROM|WHERE|SORT|LIMIT)\b/i;

function parseQuery(source: string): Query {
	const query: Query = {
		type: "table",
		withoutId: false,
		columns: [],
		sources: [],
		where: [],
		sortField: "",
		sortDesc: false,
		limit: ROW_LIMIT,
	};
	// 折叠多行子句：非关键字开头的行并入上一条
	const clauses: string[] = [];
	for (const rawLine of source.split("\n")) {
		const line = rawLine.trim();
		if (!line) continue;
		if (CLAUSE_RE.test(line) || !clauses.length) clauses.push(line);
		else clauses[clauses.length - 1] += ` ${line}`;
	}
	for (const clause of clauses) {
		const head = clause.match(CLAUSE_RE);
		if (!head) continue;
		const keyword = (head[1] ?? "").toUpperCase();
		const rest = clause.slice(head[0].length).trim();
		switch (keyword) {
			case "TABLE": {
				let body = rest;
				if (/^WITHOUT\s+ID\b/i.test(body)) {
					query.withoutId = true;
					body = body.replace(/^WITHOUT\s+ID\b/i, "").trim();
				}
				query.type = "table";
				if (body) query.columns = splitTopLevel(body).map(parseColumn);
				break;
			}
			case "LIST":
				query.type = "list";
				break;
			case "TASK":
				query.type = "task";
				break;
			case "FROM": {
				for (const term of rest.split(/\s+AND\s+|,/i)) {
					const t = term.trim();
					if (!t) continue;
					const negate = t.startsWith("-");
					const bare = negate ? t.slice(1).trim() : t;
					if (bare.startsWith("#")) {
						query.sources.push({ tag: bare.slice(1), negate });
					} else {
						const folder = cleanScalar(bare);
						if (folder) query.sources.push({ folder, negate });
					}
				}
				break;
			}
			case "WHERE":
				query.where = rest
					.split(/\s+AND\s+/i)
					.map((s) => s.trim())
					.filter(Boolean);
				break;
			case "SORT": {
				const sm = rest.match(/^(\S+)\s*(ASC|DESC)?$/i);
				if (sm) {
					query.sortField = sm[1] ?? "";
					query.sortDesc = (sm[2] ?? "").toUpperCase() === "DESC";
				}
				break;
			}
			case "LIMIT": {
				const n = Number.parseInt(rest, 10);
				if (Number.isFinite(n) && n > 0) query.limit = Math.min(n, ROW_LIMIT);
				break;
			}
		}
	}
	return query;
}

/** 顶层逗号切分（括号/引号内不切） */
function splitTopLevel(text: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let quote = "";
	let start = 0;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (quote) {
			if (ch === quote) quote = "";
		} else if (ch === '"' || ch === "'") {
			quote = ch;
		} else if (ch === "(") {
			depth++;
		} else if (ch === ")") {
			depth--;
		} else if (ch === "," && depth === 0) {
			parts.push(text.slice(start, i));
			start = i + 1;
		}
	}
	parts.push(text.slice(start));
	return parts.map((p) => p.trim()).filter(Boolean);
}

function parseColumn(text: string): Column {
	const aliasMatch = text.match(/^([\s\S]*?)\s+AS\s+"([^"]*)"$/i);
	if (aliasMatch) {
		return { expr: (aliasMatch[1] ?? "").trim(), alias: aliasMatch[2] ?? "" };
	}
	return { expr: text.trim(), alias: text.trim() };
}

// ── 查询执行 ────────────────────────────────────────────────

function fmGet(file: FileMeta, key: string): unknown {
	if (key in file.frontmatter) return file.frontmatter[key];
	const lower = key.toLowerCase();
	for (const k of Object.keys(file.frontmatter)) {
		if (k.toLowerCase() === lower) return file.frontmatter[k];
	}
	return undefined;
}

function displayValue(value: unknown): string | number | null {
	if (value == null || value === "") return null;
	if (typeof value === "number") return value;
	if (Array.isArray(value)) return value.map(String).join(", ");
	return String(value);
}

function evalColumn(expr: string, file: FileMeta): string | number | null {
	const e = expr.trim();
	switch (e) {
		case "file.name":
		case "file.link":
			return file.name;
		case "file.folder":
			return file.folder || "/";
		case "file.size":
			return file.size;
		case "file.mday":
			return new Date(file.mtime).toISOString().slice(0, 10);
		case "file.ctime":
			return new Date(file.ctime).toISOString().slice(0, 10);
		case "file.tasks":
			return file.tasks.length;
	}
	// (date(today) - file.mday).day 形式的日期差
	const diffMatch = e.match(
		/^\(?\s*date\(today\)\s*-\s*file\.(mday|ctime)\s*\)?\.day$/i,
	);
	if (diffMatch) {
		const base = diffMatch[1] === "ctime" ? file.ctime : file.mtime;
		return Math.floor((Date.now() - base) / 86_400_000);
	}
	const literal = e.match(/^"([\s\S]*)"$/);
	if (literal) return literal[1] ?? "";
	return displayValue(fmGet(file, e));
}

function matchSources(file: FileMeta, query: Query): boolean {
	for (const source of query.sources) {
		let hit = false;
		if (source.tag) {
			const tag = source.tag;
			hit = file.tags.some((t) => t === tag || t.startsWith(`${tag}/`));
		} else if (source.folder) {
			const folder = source.folder.replace(/^\/+|\/+$/g, "");
			// 宽容匹配：完整路径前缀（Dataview 语义）或路径中的任意一段目录链
			hit =
				file.folder === folder ||
				file.folder.startsWith(`${folder}/`) ||
				file.folder.endsWith(`/${folder}`) ||
				file.folder.includes(`/${folder}/`);
		}
		if (source.negate ? hit : !hit) return false;
	}
	return true;
}

function matchWhere(file: FileMeta, term: string): boolean {
	// any(file.tasks, (t) => !t.fullyCompleted)
	const anyTasks = term.match(
		/^any\(file\.tasks,\s*\(?t\)?\s*=>\s*(!?)t\.(fullyCompleted|completed)\)$/i,
	);
	if (anyTasks) {
		const wantCompleted = !anyTasks[1];
		return file.tasks.some((t) => t.completed === wantCompleted);
	}
	const contains = term.match(/^contains\(([\w-]+),\s*"([^"]*)"\)$/i);
	if (contains) {
		const value = fmGet(file, contains[1] ?? "");
		const needle = (contains[2] ?? "").toLowerCase();
		if (Array.isArray(value))
			return value.some((v) => String(v).toLowerCase().includes(needle));
		return String(value ?? "")
			.toLowerCase()
			.includes(needle);
	}
	const compare = term.match(/^([\w-]+)\s*(!=|=)\s*"?([^"]*)"?$/);
	if (compare) {
		const value = displayValue(fmGet(file, compare[1] ?? ""));
		const eq = compare[2] === "=";
		return eq
			? String(value ?? "") === (compare[3] ?? "")
			: String(value ?? "") !== (compare[3] ?? "");
	}
	const negTruth = term.match(/^!([\w-]+)$/);
	if (negTruth) return !fmGet(file, negTruth[1] ?? "");
	const truth = term.match(/^([\w-]+)$/);
	if (truth) return Boolean(fmGet(file, truth[1] ?? ""));
	// 不认识的表达式不过滤（宁可多显示也不错杀）
	return true;
}

function sortValue(file: FileMeta, field: string): string | number {
	switch (field) {
		case "file.mday":
			return file.mtime;
		case "file.ctime":
			return file.ctime;
		case "file.name":
			return file.name;
		case "file.folder":
			return file.folder;
		case "file.size":
			return file.size;
	}
	const value = fmGet(file, field);
	if (typeof value === "number") return value;
	return String(value ?? "");
}

export async function runDataviewQuery(
	source: string,
): Promise<DataviewResult> {
	const empty: DataviewResult = {
		type: "table",
		columns: [],
		rows: [],
		tasks: [],
	};
	try {
		const query = parseQuery(source);
		if (!clausesHaveType(source)) {
			return {
				...empty,
				error: "无法识别的 Dataview 查询（支持 TABLE / LIST / TASK）",
			};
		}
		const files = (await loadFiles()).filter(
			(f) =>
				matchSources(f, query) && query.where.every((w) => matchWhere(f, w)),
		);
		if (query.sortField) {
			const field = query.sortField;
			files.sort((a, b) => {
				const va = sortValue(a, field);
				const vb = sortValue(b, field);
				const cmp =
					typeof va === "number" && typeof vb === "number"
						? va - vb
						: String(va).localeCompare(String(vb), "zh-Hans-CN");
				return query.sortDesc ? -cmp : cmp;
			});
		}
		const limited = files.slice(0, query.limit);

		if (query.type === "task") {
			return {
				type: "task",
				columns: [],
				rows: [],
				tasks: limited.flatMap((f) =>
					f.tasks.map((t) => ({
						relPath: f.relPath,
						name: f.name,
						text: t.text,
						completed: t.completed,
					})),
				),
			};
		}
		if (query.type === "list") {
			return {
				type: "list",
				columns: [],
				rows: limited.map((f) => ({
					relPath: f.relPath,
					name: f.name,
					values: [],
				})),
				tasks: [],
			};
		}
		// TABLE：默认带 File 列（WITHOUT ID 除外）
		const columns = query.columns.length
			? query.columns
			: [{ expr: "file.link", alias: "File" }];
		const headColumns = query.withoutId
			? columns.map((c) => c.alias)
			: ["File", ...columns.map((c) => c.alias)];
		const rows: DataviewRow[] = limited.map((f) => ({
			relPath: f.relPath,
			name: f.name,
			values: query.withoutId
				? columns.map((c) => evalColumn(c.expr, f))
				: [f.name, ...columns.map((c) => evalColumn(c.expr, f))],
		}));
		return { type: "table", columns: headColumns, rows, tasks: [] };
	} catch (err) {
		return {
			...empty,
			error: err instanceof Error ? err.message : "Dataview 查询失败",
		};
	}
}

function clausesHaveType(source: string): boolean {
	return /^\s*(TABLE|LIST|TASK)\b/im.test(source);
}
