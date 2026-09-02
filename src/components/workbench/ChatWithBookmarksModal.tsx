import { Button, Modal, toast } from "@heroui/react";
import { useEffect, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import { ItemFavicon } from "./ItemFavicon";
import type { Category, SearchResultItem } from "./types";
import {
	type ChatMessage,
	WorkbenchStorageService,
} from "../../services/workbenchStorage";

interface ChatItem {
	role: "user" | "assistant";
	content: string;
	references?: SearchResultItem[];
	timestamp?: string;
}

interface ChatWithBookmarksModalProps {
	isOpen: boolean;
	onClose: () => void;
	onNavigateToFolder?: (folderId: number | null, category?: Category) => void;
}

const DEFAULT_PROMPTS = [
	"📅 我本周收藏了哪些网站与工具？",
	"⚡ 盘点最近 7 天加入收藏的资源与文档",
	"盘点我收藏的所有 AI 音视频处理与剪辑工具",
	"根据我的书签，推荐一套高效率的自媒体创作工具链",
];

export function ChatWithBookmarksModal({
	isOpen,
	onClose,
	onNavigateToFolder,
}: ChatWithBookmarksModalProps) {
	const [messages, setMessages] = useState<ChatItem[]>([]);
	const [input, setInput] = useState<string>("");
	const [isLoading, setIsLoading] = useState<boolean>(false);
	const messagesEndRef = useRef<HTMLDivElement | null>(null);
	const inputRef = useRef<HTMLTextAreaElement | null>(null);

	const scrollToBottom = () => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	};

	useEffect(() => {
		if (isOpen) {
			scrollToBottom();
		}
	}, [messages, isOpen]);

	const handleSend = async (userPrompt?: string) => {
		const textToSend = (userPrompt || input).trim();
		if (!textToSend || isLoading) return;

		const userMsg: ChatItem = {
			role: "user",
			content: textToSend,
			timestamp: new Date().toLocaleTimeString(),
		};

		setMessages((prev) => [...prev, userMsg]);
		if (!userPrompt) setInput("");
		setIsLoading(true);

		try {
			// Convert ChatItem to ChatMessage format
			const history: ChatMessage[] = messages.map((m) => ({
				role: m.role,
				content: m.content,
			}));

			// Retrieve settings for custom DeepSeek config
			const settings = WorkbenchStorageService.getSettings();
			const llmConfig = {
				apiKey: settings.deepseekApiKey,
				baseUrl: settings.deepseekBaseUrl,
				model: settings.deepseekModel,
			};

			const embeddingConfig = {
				apiKey: settings.embeddingApiKey || settings.deepseekApiKey || "",
				baseUrl: settings.embeddingBaseUrl,
				model: settings.embeddingModel,
			};

			const res = await WorkbenchStorageService.chatWithBookmarks({
				question: textToSend,
				history,
				embeddingConfig,
				llmConfig,
			});

			const assistantMsg: ChatItem = {
				role: "assistant",
				content: res.answer,
				references: res.references,
				timestamp: new Date().toLocaleTimeString(),
			};

			setMessages((prev) => [...prev, assistantMsg]);
		} catch (error: any) {
			console.error("Chat error:", error);
			toast.danger(error.message || "问答检索失败，请检查网络或 AI 配置");
			setMessages((prev) => [
				...prev,
				{
					role: "assistant",
					content: `⚠️ 请求失败: ${error.message || "未知错误，请检查设置中的 DeepSeek API Key"}`,
					timestamp: new Date().toLocaleTimeString(),
				},
			]);
		} finally {
			setIsLoading(false);
		}
	};

	const handleClearHistory = () => {
		setMessages([]);
		toast.success("已清空对话记录");
	};

	return (
		<Modal.Backdrop
			isOpen={isOpen}
			onOpenChange={(open) => !open && onClose()}
			variant="blur"
		>
			<Modal.Container size="lg" className="max-w-4xl w-full mx-auto p-4">
				<Modal.Dialog className="p-0 overflow-hidden flex flex-col h-[85vh] max-h-[85vh] w-full max-w-4xl bg-surface border border-border shadow-2xl rounded-2xl">
					{/* Modal Header */}
					<div className="p-4 px-6 border-b border-border bg-surface-secondary/40 flex items-center justify-between gap-4 shrink-0">
						<div className="flex items-center gap-3 min-w-0 flex-1">
							<div className="w-9 h-9 rounded-xl bg-accent/15 text-accent border border-accent/20 flex items-center justify-center text-lg shrink-0 shadow-xs font-bold">
								💬
							</div>
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-2 flex-wrap min-w-0">
									<h2 className="font-bold text-sm sm:text-base text-foreground truncate">
										Chat with Bookmarks · 知识库智能问答
									</h2>
									<span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/25 shrink-0 whitespace-nowrap">
										✨ RAG 增强
									</span>
								</div>
								<p className="text-[11px] text-muted leading-relaxed truncate mt-0.5">
									基于你的个人本地 SQLite 收藏库，提供精准概念检索、工具链组合与智能问答
								</p>
							</div>
						</div>

						<div className="flex items-center gap-2 shrink-0">
							{messages.length > 0 && (
								<Button
									variant="ghost"
									size="sm"
									className="h-7 text-xs rounded-full text-muted hover:text-foreground border border-border/60 hover:bg-surface-secondary cursor-pointer"
									onPress={handleClearHistory}
								>
									🧹 清空
								</Button>
							)}
							<button
								type="button"
								onClick={onClose}
								className="w-7 h-7 rounded-full flex items-center justify-center text-muted hover:text-foreground hover:bg-surface-secondary cursor-pointer text-xs transition-colors"
								title="关闭"
							>
								✕
							</button>
						</div>
					</div>

					{/* Chat Message Stream */}
					<div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5 text-xs">
						{messages.length === 0 ? (
							<div className="flex flex-col items-center justify-center text-center py-12 px-4 gap-4 my-auto">
								<div className="w-14 h-14 rounded-2xl bg-accent-soft flex items-center justify-center text-accent text-3xl shadow-xs">
									💡
								</div>
								<div>
									<h3 className="font-semibold text-sm text-foreground">
										有什么可以帮你的吗？
									</h3>
									<p className="text-xs text-muted max-w-md mt-1 leading-relaxed">
										你可以向我询问你收藏过的任何工具、文章或干货。我会自动从你的收藏库中检索最契合的素材并为你解答。
									</p>
								</div>

								<div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl w-full mt-2">
									{DEFAULT_PROMPTS.map((prompt) => (
										<button
											key={prompt}
											type="button"
											onClick={() => handleSend(prompt)}
											className="p-3 text-left rounded-xl bg-surface-secondary/60 hover:bg-accent-soft/40 hover:border-accent/40 border border-border text-foreground transition-all cursor-pointer text-[11px] leading-relaxed shadow-2xs group flex items-start gap-2"
										>
											<span className="text-accent opacity-70 group-hover:opacity-100">
												✦
											</span>
											<span className="flex-1">{prompt}</span>
										</button>
									))}
								</div>
							</div>
						) : (
							messages.map((msg, idx) => (
								<div
									key={idx}
									className={`flex flex-col gap-2 ${
										msg.role === "user" ? "items-end" : "items-start"
									}`}
								>
									<div className="flex items-center gap-1.5 text-[10px] text-muted px-1">
										<span>{msg.role === "user" ? "你" : "AI 知识助手"}</span>
										{msg.timestamp && <span>· {msg.timestamp}</span>}
									</div>

									<div
										className={`p-4 rounded-2xl max-w-2xl leading-relaxed text-xs ${
											msg.role === "user"
												? "bg-accent text-accent-foreground rounded-tr-xs shadow-xs"
												: "bg-surface-secondary/70 border border-border text-foreground rounded-tl-xs shadow-2xs"
										}`}
									>
										{msg.role === "user" ? (
											<div className="whitespace-pre-wrap leading-relaxed">
												{msg.content}
											</div>
										) : (
											<div className="prose prose-sm dark:prose-invert max-w-none text-foreground leading-relaxed prose-table:my-2 prose-th:p-2 prose-th:text-xs prose-td:p-2 prose-td:text-xs prose-code:text-accent prose-code:bg-accent/10 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none">
												<Streamdown
													controls={{
														table: { copy: true },
														code: { copy: true },
													}}
												>
													{msg.content}
												</Streamdown>
											</div>
										)}
									</div>

									{msg.references && msg.references.length > 0 && (
										<div className="mt-2 w-full max-w-2xl flex flex-col gap-1.5 p-3 rounded-xl bg-surface border border-border/80">
											<div className="text-[11px] font-medium text-muted flex items-center justify-between">
												<span>
													📚 本地参考来源 ({msg.references.length} 个书签)
												</span>
												<span className="text-[10px] opacity-70">
													来自 SQLite 向量检索
												</span>
											</div>

											<div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
												{msg.references.map((ref, rIdx) => (
													<div
														key={ref.id || rIdx}
														className="p-2 rounded-lg bg-surface-secondary/50 border border-border/60 flex items-start gap-2 text-xs"
													>
														<div className="w-6 h-6 rounded bg-surface border border-border/60 flex items-center justify-center shrink-0 mt-0.5 overflow-hidden">
															<ItemFavicon
																url={ref.url}
																favicon={ref.favicon}
																type={ref.type}
																size="xs"
															/>
														</div>
														<div className="flex-1 min-w-0">
															<a
																href={ref.url}
																target="_blank"
																rel="noreferrer"
																className="font-medium text-[11px] text-foreground hover:text-accent truncate block"
															>
																{ref.name}
															</a>
															<div className="flex items-center gap-1.5 mt-0.5 text-[9px] text-muted flex-wrap">
																{ref.folderName && (
																	<span className="truncate max-w-[80px]">
																		📁 {ref.folderName}
																	</span>
																)}
																{ref.dateAdded && (
																	<span className="text-muted/80">
																		🕒 {new Date(ref.dateAdded).toLocaleDateString()}
																	</span>
																)}
																{ref.similarityPercent ? (
																	<span className="text-accent font-medium">
																		{ref.similarityPercent}% 匹配
																	</span>
																) : ref.matchReason ? (
																	<span className="text-accent/90 font-medium">
																		✨ 精准命中
																	</span>
																) : null}
															</div>
														</div>
														<div className="flex items-center gap-1 shrink-0">
															{ref.folderId !== undefined &&
																onNavigateToFolder && (
																	<button
																		type="button"
																		onClick={() => {
																			onNavigateToFolder(
																				ref.folderId || null,
																				ref.category as Category,
																			);
																			onClose();
																		}}
																		className="p-1 text-[10px] text-muted hover:text-foreground cursor-pointer rounded hover:bg-surface"
																		title="在工作台中定位"
																	>
																		📂
																	</button>
																)}
															{ref.url && (
																<a
																	href={ref.url}
																	target="_blank"
																	rel="noreferrer"
																	className="p-1 text-[10px] text-muted hover:text-accent shrink-0 rounded hover:bg-surface"
																	title="打开链接"
																>
																	↗
																</a>
															)}
														</div>
													</div>
												))}
											</div>
										</div>
									)}
								</div>
							))
						)}

						{/* Loading state */}
						{isLoading && (
							<div className="flex flex-col gap-2 items-start">
								<div className="flex items-center gap-1.5 text-[10px] text-muted px-1">
									<span>AI 知识助手</span>
									<span>· 思考中</span>
								</div>
								<div className="p-4 rounded-2xl bg-surface-secondary/70 border border-border text-foreground rounded-tl-xs shadow-2xs flex items-center gap-3">
									<div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
									<span className="text-xs text-muted">
										正在检索书签并组织回答...
									</span>
								</div>
							</div>
						)}
						<div ref={messagesEndRef} />
					</div>

					{/* Input Bar Footer */}
					<div className="p-4 border-t border-border bg-surface-secondary/40 shrink-0 flex flex-col gap-2">
						<div className="flex items-end gap-2 bg-surface border border-border/80 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20 rounded-xl p-2 transition-all shadow-xs">
							<textarea
								ref={inputRef}
								value={input}
								onChange={(e) => setInput(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter" && !e.shiftKey) {
										e.preventDefault();
										handleSend();
									}
								}}
								placeholder="向你的收藏库提问... (按 Enter 发送，Shift + Enter 换行)"
								rows={2}
								className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted focus:outline-none resize-none px-2 py-1 leading-relaxed"
							/>
							<Button
								variant="primary"
								size="sm"
								className="rounded-lg h-8 px-3.5 text-xs font-medium shrink-0"
								onPress={() => handleSend()}
								isDisabled={!input.trim() || isLoading}
							>
								{isLoading ? "发送中..." : "发送 ↵"}
							</Button>
						</div>

						<div className="flex items-center justify-between text-[10px] text-muted px-1">
							<span>基于本地 SQLite 知识库 RAG 架构</span>
							<span>按 Enter 发送 · 支持多轮追问</span>
						</div>
					</div>
				</Modal.Dialog>
			</Modal.Container>
		</Modal.Backdrop>
	);
}
