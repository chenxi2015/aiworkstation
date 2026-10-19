import { Store } from "@tanstack/store";
import type { ObsidianTreeNode } from "../components/obsidian/types";
import { fetchMaterials } from "../services/api/creatorClient";
import { fetchDocuments } from "../services/api/editorClient";
import { fetchObsidianTree } from "../services/api/obsidianClient";

/**
 * `@` mention 多源索引：笔记 / 文档 / 素材的轻量标题级缓存。
 *
 * 书签/文件夹数据由 AiAssistantPanel 以 props 传入（已在内存），
 * 本 store 只补齐其余三个跨模块数据源，供 mention 菜单做纯内存前缀检索。
 * 只存标题 + 定位字段，不存正文，拉取成本可忽略。
 */

export interface MentionNoteEntry {
	/** Vault 相对路径（定位主键） */
	relPath: string;
	/** 文件名（含 .md） */
	name: string;
	/** 去掉 .md 的展示名 */
	bare: string;
	/** 所在目录（用于副标题展示） */
	dir: string;
}

export interface MentionDocumentEntry {
	id: number;
	title: string;
	/** 字数/摘要提示 */
	subtitle?: string;
}

export interface MentionMaterialEntry {
	id: number;
	title: string;
	subtitle?: string;
}

export interface MentionIndexState {
	notes: MentionNoteEntry[];
	documents: MentionDocumentEntry[];
	materials: MentionMaterialEntry[];
	/** 是否已完成首次加载 */
	loaded: boolean;
	/** 是否正在加载（防并发重复拉取） */
	loading: boolean;
	/** 最近一次成功加载时间（ms epoch），用于手动刷新判断 */
	loadedAt: number;
}

const initialState: MentionIndexState = {
	notes: [],
	documents: [],
	materials: [],
	loaded: false,
	loading: false,
	loadedAt: 0,
};

export const mentionIndexStore = new Store<MentionIndexState>(initialState);

/** 递归摊平 Obsidian 目录树为笔记条目 */
function flattenNoteTree(nodes: ObsidianTreeNode[]): MentionNoteEntry[] {
	const out: MentionNoteEntry[] = [];
	const walk = (list: ObsidianTreeNode[]) => {
		for (const node of list) {
			if (node.kind === "note") {
				const bare = node.name.replace(/\.md$/i, "");
				const dir = node.relPath.includes("/")
					? node.relPath.split("/").slice(0, -1).join("/")
					: "";
				out.push({ relPath: node.relPath, name: node.name, bare, dir });
			}
			if (node.children) walk(node.children);
		}
	};
	walk(nodes);
	return out;
}

let inFlight: Promise<void> | null = null;

/**
 * 拉取并填充 mention 索引。幂等并发（同时调用共享同一 Promise）。
 * @param force 为 true 时无视已有数据重新拉取（数据源变更后手动刷新）
 */
export function loadMentionIndex(force = false): Promise<void> {
	const s = mentionIndexStore.state;
	if (!force && s.loaded) return Promise.resolve();
	if (inFlight) return inFlight;

	mentionIndexStore.setState((prev) => ({ ...prev, loading: true }));

	inFlight = (async () => {
		// 三个数据源并行，单个失败不影响其他（各自客户端已做 try/catch 兜底）
		const [tree, docs, materials] = await Promise.all([
			fetchObsidianTree(false).catch(() => null),
			fetchDocuments().catch(() => []),
			fetchMaterials().catch(() => []),
		]);

		const notes = tree?.tree ? flattenNoteTree(tree.tree) : [];
		const documents: MentionDocumentEntry[] = (docs ?? []).map((d) => ({
			id: d.id,
			title: d.title || "未命名文档",
			subtitle: d.contentText
				? `${Math.round(d.contentText.length / 1000)}k 字`
				: undefined,
		}));
		const materialsOut: MentionMaterialEntry[] = (materials ?? []).map((m) => ({
			id: m.id,
			title: m.title || "未命名素材",
			subtitle: m.sourceType,
		}));

		mentionIndexStore.setState((prev) => ({
			...prev,
			notes,
			documents,
			materials: materialsOut,
			loaded: true,
			loading: false,
			loadedAt: Date.now(),
		}));
	})()
		.catch((err) => {
			console.warn("[mentionIndexStore] load error:", err);
			mentionIndexStore.setState((prev) => ({ ...prev, loading: false }));
		})
		.finally(() => {
			inFlight = null;
		});

	return inFlight;
}
