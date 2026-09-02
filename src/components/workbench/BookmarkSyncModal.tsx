import {
	Button,
	Label,
	Modal,
	ScrollShadow,
	TextArea,
	TextField,
	toast,
} from "@heroui/react";
import { type ChangeEvent, useState } from "react";
import { WorkbenchStorageService } from "../../services/workbenchStorage";
import type { BookmarkTDKItem, WorkbenchItem } from "./types";

interface BookmarkSyncModalProps {
	isOpen: boolean;
	onClose: () => void;
	onBookmarksImported: (
		newUnclassified: WorkbenchItem[],
		triggerAICallback?: boolean,
	) => void;
}

// Preset popular AI & developer bookmarks for quick testing
const SAMPLE_BOOKMARKS: BookmarkTDKItem[] = [
	{
		id: "bm_1",
		title: "DeepSeek: 深度求索 - 探索通用人工智能",
		url: "https://www.deepseek.com",
		description: "DeepSeek 专注于研究世界领先的通用人工智能技术与开源大模型。",
		keywords: "DeepSeek, 大模型, 人工智能, LLM, 深度求索",
		parentTitle: "AI工具",
		folderPath: "书签栏 / AI常用 / 大模型",
	},
	{
		id: "bm_2",
		title: "GitHub: Let's build from here",
		url: "https://github.com",
		description:
			"GitHub is where over 100 million developers shape the future of software.",
		keywords: "git, github, open source, developer, code",
		parentTitle: "开发工具",
		folderPath: "书签栏 / 研发 / 代码托管",
	},
	{
		id: "bm_3",
		title: "Hugging Face - The AI community building the future",
		url: "https://huggingface.co",
		description:
			"The platform where the machine learning community collaborates on models, datasets, and applications.",
		keywords:
			"machine learning, AI models, datasets, transformers, huggingface",
		parentTitle: "AI社区",
		folderPath: "书签栏 / AI / 开源模型",
	},
	{
		id: "bm_4",
		title: "Midjourney - Generate AI Art and Images",
		url: "https://www.midjourney.com",
		description:
			"Midjourney is an independent research lab exploring new mediums of thought and expanding the imaginative powers of the human species.",
		keywords: "AI art, image generation, midjourney, prompt, design",
		parentTitle: "设计与视觉",
		folderPath: "书签栏 / 设计 / AI绘画",
	},
	{
		id: "bm_5",
		title: "Claude by Anthropic",
		url: "https://claude.ai",
		description:
			"Talk with Claude, an AI assistant made by Anthropic to be helpful, harmless, and honest.",
		keywords: "Claude, Anthropic, AI assistant, LLM, chat",
		parentTitle: "AI助手",
		folderPath: "书签栏 / AI常用 / 对话",
	},
	{
		id: "bm_6",
		title: "Vercel: Build and deploy the best web experiences",
		url: "https://vercel.com",
		description:
			"Vercel's frontend cloud gives developers the frameworks, workflows, and infrastructure to build a faster, more personalized web.",
		keywords: "nextjs, vercel, frontend, deployment, cloud",
		parentTitle: "部署上线",
		folderPath: "书签栏 / 开发 / 运维部署",
	},
	{
		id: "bm_7",
		title: "小红书 - 你的生活指南",
		url: "https://www.xiaohongshu.com",
		description: "年轻人的生活方式平台，在这里发现美好、真实、多元的世界。",
		keywords: "小红书, 种草, 生活方式, 自媒体运营",
		parentTitle: "社交平台",
		folderPath: "书签栏 / 自媒体 / 平台",
	},
	{
		id: "bm_8",
		title: "Shopify - 跨境独立站电商建站平台",
		url: "https://www.shopify.com",
		description: "全球领先的电商平台，帮助商家轻松搭建独立站并开启全球销售。",
		keywords: "电商, 跨境独立站, Shopify, 跨境出海",
		parentTitle: "跨境电商",
		folderPath: "书签栏 / 电商 / 平台",
	},
	{
		id: "bm_9",
		title: "Twitter / X",
		url: "https://x.com",
		description:
			"From breaking news and entertainment to sports and politics, get the full story with all the live commentary.",
		keywords: "twitter, x, social media, news, trends",
		parentTitle: "社交媒体",
		folderPath: "书签栏 / 自媒体 / 海外社交",
	},
	{
		id: "bm_10",
		title: "PromptBase - Midjourney, ChatGPT, DALL-E Prompt Marketplace",
		url: "https://promptbase.com",
		description:
			"Search 100,000+ AI prompts for Midjourney, ChatGPT, DALL-E, Stable Diffusion. Prompt engineering marketplace.",
		keywords:
			"prompt engineering, AI prompts, midjourney prompt, chatgpt prompt",
		parentTitle: "Prompt工程",
		folderPath: "书签栏 / AI / 提示词",
	},
];

/**
 * Parse Netscape Bookmark HTML file (Standard Chrome / Firefox exported bookmarks)
 */
function parseBookmarkHtml(html: string): BookmarkTDKItem[] {
	const results: BookmarkTDKItem[] = [];
	const parser = new DOMParser();
	const doc = parser.parseFromString(html, "text/html");

	const links = doc.querySelectorAll("a");
	links.forEach((a, idx) => {
		const href = a.getAttribute("href");
		if (href && (href.startsWith("http://") || href.startsWith("https://"))) {
			// Traverse parent DL/H3 hierarchy to find folder path
			const pathSegments: string[] = [];
			let parent = a.parentElement;
			while (parent && parent !== doc.body) {
				if (parent.tagName === "DL") {
					const h3 = parent.previousElementSibling;
					if (h3 && h3.tagName === "H3" && h3.textContent) {
						pathSegments.unshift(h3.textContent.trim());
					}
				}
				parent = parent.parentElement;
			}

			const title = a.textContent?.trim() || href;
			const addDate = a.getAttribute("add_date");
			const dateAdded = addDate
				? Number.parseInt(addDate, 10) * 1000
				: undefined;

			results.push({
				id: `imp_${Date.now()}_${idx}`,
				title,
				url: href,
				parentTitle: pathSegments[pathSegments.length - 1] || "",
				folderPath: pathSegments.join(" / "),
				dateAdded,
			});
		}
	});

	return results;
}

export function BookmarkSyncModal({
	isOpen,
	onClose,
	onBookmarksImported,
}: BookmarkSyncModalProps) {
	const [rawText, setRawText] = useState("");
	const [activeTab, setActiveTab] = useState<"preset" | "file" | "paste">(
		"preset",
	);

	const handleImportSample = async (withAICallback = false) => {
		await WorkbenchStorageService.addBookmarksToDb(SAMPLE_BOOKMARKS);
		const { unclassified: updated } =
			await WorkbenchStorageService.fetchAllFromDb();
		toast.success(`已成功导入 ${SAMPLE_BOOKMARKS.length} 个书签至 SQLite`);
		onBookmarksImported(updated, withAICallback);
		onClose();
	};

	const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = async (event) => {
			const content = event.target?.result as string;
			if (!content) return;

			let items: BookmarkTDKItem[] = [];

			if (file.name.endsWith(".json")) {
				try {
					const parsed = JSON.parse(content);
					items = Array.isArray(parsed) ? parsed : Object.values(parsed);
				} catch {
					toast.danger("JSON 文件解析失败，请检查格式");
					return;
				}
			} else {
				// Parse HTML bookmarks
				items = parseBookmarkHtml(content);
			}

			if (items.length === 0) {
				toast.warning("未在文件中找到有效的网页书签链接");
				return;
			}

			await WorkbenchStorageService.addBookmarksToDb(items);
			const { unclassified: updated } =
				await WorkbenchStorageService.fetchAllFromDb();
			toast.success(`已从文件解析并保存 ${items.length} 个书签至 SQLite`);
			onBookmarksImported(updated, false);
			onClose();
		};
		reader.readAsText(file);
	};

	const handlePasteImport = async () => {
		const trimmed = rawText.trim();
		if (!trimmed) {
			toast.info("请先输入或粘贴书签文本/链接");
			return;
		}

		let items: BookmarkTDKItem[] = [];

		if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
			try {
				const parsed = JSON.parse(trimmed);
				items = Array.isArray(parsed) ? parsed : [parsed];
			} catch {
				// Fallback to line by line parsing
			}
		}

		if (items.length === 0) {
			const lines = trimmed
				.split("\n")
				.map((l) => l.trim())
				.filter(Boolean);
			items = lines
				.map((line, idx) => {
					const parts = line.split(/[\s\t,]+/);
					const url =
						parts.find(
							(p) => p.startsWith("http://") || p.startsWith("https://"),
						) || line;
					const title = parts.filter((p) => p !== url).join(" ") || url;
					return {
						id: `paste_${Date.now()}_${idx}`,
						title,
						url,
					};
				})
				.filter((i) => i.url.startsWith("http"));
		}

		if (items.length === 0) {
			toast.warning("未能解析出有效的 URL 链接");
			return;
		}

		await WorkbenchStorageService.addBookmarksToDb(items);
		const { unclassified: updated } =
			await WorkbenchStorageService.fetchAllFromDb();
		toast.success(`已成功导入 ${items.length} 个书签至 SQLite`);
		onBookmarksImported(updated, false);
		onClose();
	};

	return (
		<Modal.Backdrop
			isOpen={isOpen}
			onOpenChange={(open) => !open && onClose()}
			variant="blur"
		>
			<Modal.Container size="md">
				<Modal.Dialog>
					<Modal.CloseTrigger />
					<Modal.Header>
						<Modal.Heading>同步 / 导入书签到 AI 工作台</Modal.Heading>
					</Modal.Header>

					<Modal.Body className="flex flex-col gap-4 text-xs">
						{/* Tab Switcher */}
						<div className="flex items-center gap-1 p-1 bg-surface-secondary rounded-xl border border-border">
							<button
								type="button"
								onClick={() => setActiveTab("preset")}
								className={`flex-1 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
									activeTab === "preset"
										? "bg-surface text-foreground shadow-xs font-semibold"
										: "text-muted hover:text-foreground"
								}`}
							>
								⚡ 预置测试书签
							</button>
							<button
								type="button"
								onClick={() => setActiveTab("file")}
								className={`flex-1 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
									activeTab === "file"
										? "bg-surface text-foreground shadow-xs font-semibold"
										: "text-muted hover:text-foreground"
								}`}
							>
								📁 导入书签文件
							</button>
							<button
								type="button"
								onClick={() => setActiveTab("paste")}
								className={`flex-1 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
									activeTab === "paste"
										? "bg-surface text-foreground shadow-xs font-semibold"
										: "text-muted hover:text-foreground"
								}`}
							>
								📝 粘贴链接/JSON
							</button>
						</div>

						{/* Content 1: Preset */}
						{activeTab === "preset" && (
							<div className="flex flex-col gap-3">
								<p className="text-muted leading-relaxed">
									立即载入包含
									DeepSeek、GitHub、HuggingFace、Midjourney、Claude、Shopify 等
									10 个精选多样化书签 TDK 样例，用于测试 AI 分门别类效果。
								</p>

								<ScrollShadow className="max-h-[220px] overflow-y-auto pr-1">
									<div className="space-y-1.5">
										{SAMPLE_BOOKMARKS.map((bm) => (
											<div
												key={bm.id}
												className="p-2 rounded-lg bg-surface-secondary border border-border flex items-center justify-between gap-2"
											>
												<div className="truncate flex-1">
													<div className="font-medium text-foreground truncate">
														{bm.title}
													</div>
													<div className="text-[10px] text-muted truncate">
														{bm.url}
													</div>
												</div>
												<span className="shrink-0 text-[10px] text-muted bg-surface px-1 py-0.5 rounded border border-border">
													{bm.parentTitle}
												</span>
											</div>
										))}
									</div>
								</ScrollShadow>

								<div className="flex items-center gap-2 pt-2">
									<Button
										variant="secondary"
										size="sm"
										className="flex-1 rounded-full"
										onPress={() => handleImportSample(false)}
									>
										放入未分类池
									</Button>
									<Button
										variant="primary"
										size="sm"
										className="flex-1 rounded-full shadow-sm"
										onPress={() => handleImportSample(true)}
									>
										⚡ 导入并立即 AI 分类
									</Button>
								</div>
							</div>
						)}

						{/* Content 2: File Import */}
						{activeTab === "file" && (
							<div className="flex flex-col gap-3 py-2">
								<p className="text-muted leading-relaxed">
									支持从 Chrome 浏览器书签管理器导出的{" "}
									<code>bookmarks.html</code> 或 JSON
									结构文件，自动提取每个书签的名称、链接与完整目录路径。
								</p>

								<label className="border-2 border-dashed border-border hover:border-accent/60 bg-surface-secondary/50 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-colors text-center group">
									<svg
										className="w-8 h-8 text-muted group-hover:text-accent mb-2 transition-colors"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="1.8"
									>
										<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
										<polyline points="17 8 12 3 7 8" />
										<line x1="12" y1="3" x2="12" y2="15" />
									</svg>
									<span className="font-semibold text-foreground mb-0.5">
										点击选择或拖拽书签文件到此处
									</span>
									<span className="text-[11px] text-muted">
										支持 .html (Chrome/Edge/Firefox书签) 或 .json 文件
									</span>
									<input
										type="file"
										accept=".html,.htm,.json"
										className="hidden"
										onChange={handleFileUpload}
									/>
								</label>
							</div>
						)}

						{/* Content 3: Paste */}
						{activeTab === "paste" && (
							<div className="flex flex-col gap-3">
								<TextField value={rawText} onChange={setRawText}>
									<Label>粘贴书签链接列表或 JSON 数组</Label>
									<TextArea
										placeholder={
											"每行一条链接，或格式如：\nhttps://github.com GitHub代码托管\nhttps://deepseek.com DeepSeek官网"
										}
										rows={6}
										variant="secondary"
									/>
								</TextField>

								<Button
									variant="primary"
									size="sm"
									className="rounded-full shadow-sm"
									onPress={handlePasteImport}
								>
									导入到未分类池
								</Button>
							</div>
						)}
					</Modal.Body>

					<Modal.Footer className="flex items-center justify-end">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="rounded-full"
							onPress={onClose}
						>
							关闭
						</Button>
					</Modal.Footer>
				</Modal.Dialog>
			</Modal.Container>
		</Modal.Backdrop>
	);
}
