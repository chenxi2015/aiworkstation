import {
	autocompletion,
	type Completion,
	type CompletionContext,
	type CompletionResult,
} from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import { fetchObsidianTree } from "../../../services/api/obsidianClient";
import type { ObsidianTreeNode } from "../types";

export interface VaultNoteSuggestion {
	name: string;
	relPath: string;
}

let cachedSuggestions: { list: VaultNoteSuggestion[]; at: number } | null =
	null;
const CACHE_TTL_MS = 30_000;

/** Invalidate cached suggestions on mutations */
export function invalidateWikilinkSuggestions(): void {
	cachedSuggestions = null;
}

async function getVaultNoteSuggestions(): Promise<VaultNoteSuggestion[]> {
	if (cachedSuggestions && Date.now() - cachedSuggestions.at < CACHE_TTL_MS) {
		return cachedSuggestions.list;
	}
	const treeData = await fetchObsidianTree(false);
	const list: VaultNoteSuggestion[] = [];
	const walk = (nodes: ObsidianTreeNode[]) => {
		for (const node of nodes) {
			if (node.kind === "note") {
				list.push({ name: node.name, relPath: node.relPath });
			} else {
				walk(node.children ?? []);
			}
		}
	};
	walk(treeData.tree);
	cachedSuggestions = { list, at: Date.now() };
	return list;
}

/** Rank note candidates by relevance to query */
function matchScore(note: VaultNoteSuggestion, query: string): number {
	if (!query) return 0;
	const nameLower = note.name.toLowerCase();
	const pathLower = note.relPath.toLowerCase();
	if (nameLower === query) return 100;
	if (nameLower.startsWith(query)) return 80;
	if (nameLower.includes(query)) return 50;
	if (pathLower.includes(query)) return 30;
	return -1;
}

/** Autocompletion source for Obsidian [[wikilinks]] */
async function wikilinkCompletionSource(
	context: CompletionContext,
): Promise<CompletionResult | null> {
	// Match pattern [[... preceding the cursor
	const match = context.matchBefore(/\[\[([^\]\n]*)/);
	if (!match) return null;

	const from = match.from + 2;
	const query = match.text.slice(2).trim().toLowerCase();
	const notes = await getVaultNoteSuggestions();

	const scored = notes
		.map((note) => ({ note, score: matchScore(note, query) }))
		.filter((item) => item.score >= 0)
		.sort((a, b) => b.score - a.score || a.note.name.localeCompare(b.note.name))
		.slice(0, 30);

	const options: Completion[] = scored.map(({ note }) => ({
		label: note.name,
		detail: note.relPath.includes("/")
			? note.relPath.replace(/\.md$/i, "")
			: undefined,
		type: "file",
		apply: (view, completion, applyFrom, applyTo) => {
			const after = view.state.doc.sliceString(applyTo, applyTo + 2);
			const hasClosing = after === "]]";
			const replacement = `${completion.label}]]`;
			view.dispatch({
				changes: {
					from: applyFrom,
					to: hasClosing ? applyTo + 2 : applyTo,
					insert: replacement,
				},
				selection: { anchor: applyFrom + replacement.length },
			});
		},
	}));

	return {
		from,
		options,
		filter: false,
	};
}

/**
 * Returns CodeMirror autocompletion extension configured for Obsidian [[wikilinks]].
 */
export function wikilinkAutocomplete(): Extension {
	return autocompletion({
		override: [wikilinkCompletionSource],
		defaultKeymap: true,
		closeOnBlur: true,
		activateOnTyping: true,
		maxRenderedOptions: 30,
	});
}
