import type {
	AIClassificationResult,
	BookmarkTDKItem,
	ItemType,
	WorkbenchSettings,
} from "../components/workbench/types";

export const DEFAULT_DEEPSEEK_KEY =
	import.meta.env.VITE_DEEPSEEK_API_KEY ||
	(typeof process !== "undefined" ? process.env?.DEEPSEEK_API_KEY : "") ||
	"";
export const DEFAULT_DEEPSEEK_BASE_URL =
	import.meta.env.VITE_DEEPSEEK_BASE_URL ||
	(typeof process !== "undefined" ? process.env?.DEEPSEEK_BASE_URL : "") ||
	"https://api.deepseek.com";
export const DEFAULT_DEEPSEEK_MODEL =
	import.meta.env.VITE_DEEPSEEK_MODEL ||
	(typeof process !== "undefined" ? process.env?.DEEPSEEK_MODEL : "") ||
	"deepseek-chat";

/**
 * Options for AI bookmark classification
 */
export interface ClassifyOptions {
	settings?: Partial<WorkbenchSettings>;
	existingCategories: string[];
	existingFolders: Array<{ name: string; category: string; desc?: string }>;
	onProgress?: (current: number, total: number, message: string) => void;
	signal?: AbortSignal;
}

/**
 * Clean and normalize JSON string returned by LLM
 */
function cleanJsonOutput(raw: string): string {
	let text = raw.trim();
	// Remove markdown code blocks if wrapped
	if (text.startsWith("```")) {
		const lines = text.split("\n");
		if (lines[0].startsWith("```")) {
			lines.shift();
		}
		if (lines.length > 0 && lines[lines.length - 1].startsWith("```")) {
			lines.pop();
		}
		text = lines.join("\n").trim();
	}
	return text;
}

/**
 * AI Classifier service powered by DeepSeek API
 */
export class AIClassifierService {
	/**
	 * Classify a single batch of bookmark TDK items
	 */
	private static async classifyBatch(
		batch: BookmarkTDKItem[],
		existingCategories: string[],
		existingFolders: Array<{ name: string; category: string }>,
		settings: Partial<WorkbenchSettings>,
		signal?: AbortSignal,
	): Promise<AIClassificationResult[]> {
		const apiKey = settings.deepseekApiKey || DEFAULT_DEEPSEEK_KEY;
		const baseUrl = settings.deepseekBaseUrl || DEFAULT_DEEPSEEK_BASE_URL;
		const model = settings.deepseekModel || DEFAULT_DEEPSEEK_MODEL;

		const systemPrompt = `You are an expert AI content organizer and taxonomy architect for an AI Workstation.
Your task is to analyze an array of web bookmarks with their TDK metadata (Title, Description, Keywords, URL, and folder hierarchy) and categorize them into appropriate workspace categories and theme folders.

Available workspace categories:
${JSON.stringify(existingCategories)}

Existing reference folders:
${JSON.stringify(existingFolders.slice(0, 30))}

Guidelines for categorization:
1. "category": Pick the most fitting workspace category from the available list, or suggest a new logical category if none fits.
2. "folderName": Pick an existing folder name if the topic matches well, or create a concise 2-6 word topic folder name (e.g. "Prompt工程", "短视频剪辑", "电商选品", "前端开发", "AI绘图", "推特运营").
3. "folderDesc": A brief 1-sentence description of the folder's theme.
4. "itemType": Must be strictly one of ["tool", "link", "doc", "skill", "note"]:
   - "tool": Interactive SaaS, online tools, calculators, generators, extensions, dev platforms.
   - "link": Informational links, blogs, social profiles, repositories, articles, news.
   - "doc": Official documentation, cheat-sheets, guides, tutorials, specifications.
   - "skill": Automation workflows, prompts, agents, scripts, CLI tools.
   - "note": Notes, inspirations, references, materials.
5. "summary": A concise 1-sentence summary (in Chinese) explaining what this website is.
6. "tags": An array of 2-3 relevant topic tags in Chinese.
7. "reason": Brief justification for the classification.

Output format: Return ONLY a valid JSON object with key "items", whose value is an array of objects.
Each element must match:
{
  "id": string | number,
  "title": string,
  "url": string,
  "category": string,
  "folderName": string,
  "folderDesc": string,
  "itemType": "tool" | "link" | "doc" | "skill" | "note",
  "summary": string,
  "tags": string[],
  "reason": string
}`;

		const userPayload = batch.map((item) => ({
			id: item.id,
			title: item.title,
			url: item.url,
			description: item.description || "",
			keywords: item.keywords || "",
			folderPath: item.folderPath || item.parentTitle || "",
		}));

		const response = await fetch(
			`${baseUrl.replace(/\/+$/, "")}/chat/completions`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${apiKey}`,
				},
				body: JSON.stringify({
					model,
					messages: [
						{ role: "system", content: systemPrompt },
						{
							role: "user",
							content: `Please classify the following ${batch.length} bookmarks:\n${JSON.stringify(userPayload, null, 2)}`,
						},
					],
					temperature: 0.2,
					response_format: { type: "json_object" },
				}),
				signal,
			},
		);

		if (!response.ok) {
			const errorText = await response.text().catch(() => "");
			throw new Error(
				`DeepSeek API error (${response.status}): ${errorText || response.statusText}`,
			);
		}

		const data = await response.json();
		const rawContent = data.choices?.[0]?.message?.content || "{}";
		const cleaned = cleanJsonOutput(rawContent);

		let parsed: any;
		try {
			parsed = JSON.parse(cleaned);
			if (!Array.isArray(parsed)) {
				const possibleArray = Object.values(parsed).find((val) =>
					Array.isArray(val),
				);
				if (possibleArray) {
					parsed = possibleArray;
				} else {
					parsed = [parsed];
				}
			}
		} catch (err) {
			console.error("Failed to parse DeepSeek response JSON:", rawContent, err);
			throw new Error("Failed to parse AI classification result JSON");
		}

		// Map and validate results
		return batch.map((item) => {
			const matched = (parsed as any[]).find(
				(p) => String(p.id) === String(item.id) || p.url === item.url,
			);

			const validTypes: ItemType[] = ["tool", "link", "doc", "skill", "note"];
			const rawType = matched?.itemType?.toLowerCase();
			const itemType: ItemType = validTypes.includes(rawType)
				? rawType
				: "link";

			return {
				id: item.id,
				title: item.title || matched?.title || item.url,
				url: item.url,
				category: matched?.category || "未分类",
				folderName: matched?.folderName || item.parentTitle || "常用收藏",
				folderDesc: matched?.folderDesc || "",
				itemType,
				summary: matched?.summary || item.title,
				tags: Array.isArray(matched?.tags) ? matched.tags : [],
				reason: matched?.reason || "Based on TDK analysis",
			};
		});
	}

	/**
	 * Classify all bookmarks in chunks with progress reporting
	 */
	static async classifyBookmarks(
		bookmarks: BookmarkTDKItem[],
		options: ClassifyOptions,
	): Promise<AIClassificationResult[]> {
		if (!bookmarks || bookmarks.length === 0) {
			return [];
		}

		const batchSize = options.settings?.batchSize || 15;
		const results: AIClassificationResult[] = [];
		const total = bookmarks.length;

		for (let i = 0; i < total; i += batchSize) {
			if (options.signal?.aborted) {
				throw new Error("AI classification cancelled");
			}

			const chunk = bookmarks.slice(i, i + batchSize);
			const chunkIndex = Math.floor(i / batchSize) + 1;
			const totalChunks = Math.ceil(total / batchSize);

			options.onProgress?.(
				i,
				total,
				`正在由 DeepSeek 分析第 ${chunkIndex}/${totalChunks} 批书签 TDK (${chunk.length} 个)...`,
			);

			try {
				const batchResults = await this.classifyBatch(
					chunk,
					options.existingCategories,
					options.existingFolders,
					options.settings || {},
					options.signal,
				);
				results.push(...batchResults);
			} catch (err: any) {
				console.warn(
					`Batch ${chunkIndex} AI classification failed, using fallback:`,
					err,
				);
				// Fallback to heuristic classification on batch failure
				const fallbackBatch = chunk.map((item) => ({
					id: item.id,
					title: item.title,
					url: item.url,
					category: "未分类",
					folderName: item.parentTitle || "常用收藏",
					folderDesc: "未分类书签归集",
					itemType: (item.url.includes("github.com")
						? "tool"
						: "link") as ItemType,
					summary: item.title,
					tags: item.keywords ? item.keywords.split(",").slice(0, 3) : [],
					reason: `AI classification error: ${err?.message || "Unknown error"}`,
				}));
				results.push(...fallbackBatch);
			}
		}

		options.onProgress?.(total, total, `分类完成，共处理 ${total} 个书签`);
		return results;
	}
}
