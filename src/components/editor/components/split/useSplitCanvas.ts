import { toast } from "@heroui/react";
import type { Editor } from "@tiptap/core";
import { type JSONContent, useEditor } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	fetchDocumentVersions,
	snapshotVersionRpc,
	streamRewriteText,
} from "../../../../services/api/editorClient";
import { getEditorBaseExtensions } from "../../extensions/baseExtensions";
import { SlashCommands } from "../../extensions/slashCommand";
import type { SlashMenuState } from "../../hooks/useRichTextEditor";
import {
	markdownToHtml,
	markdownToTiptapDoc,
	tiptapJsonToMarkdown,
} from "../../markdown";
import {
	buildHighlightedMarkdown,
	computeDiffWordDelta,
	markdownToPlainText,
} from "../../utils/diffHelper";
import type { SlashCommandMenuRef } from "../SlashCommandMenu";
import {
	type DocumentVersion,
	PRESET_MODES,
	type SplitCanvasMode,
	type ViewMode,
} from "./types";

export interface UseSplitCanvasOptions {
	leftEditor: Editor;
	docTitle?: string;
	docId: number;
	stylePreset?: string;
	instruction?: string;
	modeLabel?: string;
	onAccept: (
		cleanDocJson: Parameters<Editor["commands"]["setContent"]>[0],
	) => void;
	onSaveAsNewDocument?: (title: string, markdown: string) => Promise<void>;
}

/**
 * Custom hook to manage dual-canvas state, TipTap instances, version pool,
 * AI streaming generation, sync scrolling, and database persistence.
 */
export function useSplitCanvas({
	leftEditor,
	docTitle,
	docId,
	stylePreset,
	instruction,
	modeLabel,
	onAccept,
	onSaveAsNewDocument,
}: UseSplitCanvasOptions) {
	// 1. Initial base markdown and HTML extracted from left TipTap editor
	const initialBaseMarkdown = useMemo(() => {
		try {
			const md = tiptapJsonToMarkdown(leftEditor.getJSON());
			return md.trim() || leftEditor.getText().trim();
		} catch {
			return leftEditor.getText().trim();
		}
	}, [leftEditor]);

	const initialBaseHtml = useMemo(() => {
		return markdownToHtml(initialBaseMarkdown);
	}, [initialBaseMarkdown]);

	// 2. Version State Pool (v0 base + v_draft initial practice clone + db snapshots + live iterations)
	const [versions, setVersions] = useState<DocumentVersion[]>(() => {
		const v0: DocumentVersion = {
			id: "v0",
			label: "v0: 当前正文 (Base)",
			mode: "original",
			content: initialBaseMarkdown,
			createdAt: Date.now(),
			origin: "human",
			isSavedToDb: true,
		};
		const vDraft: DocumentVersion = {
			id: "v_draft",
			label: "演练草稿 (副本)",
			mode: "manual",
			content: initialBaseMarkdown,
			createdAt: Date.now(),
			origin: "human",
			isSavedToDb: false,
		};
		return [v0, vDraft];
	});

	const [leftVersionId, setLeftVersionId] = useState<string>("v0");
	const [rightVersionId, setRightVersionId] = useState<string>("v_draft");
	const [diffViewMode, setDiffViewMode] = useState<ViewMode>("clean");
	const [isSavingVersion, setIsSavingVersion] = useState(false);

	// Load historical versions from SQLite on mount
	useEffect(() => {
		if (!docId) return;
		let isMounted = true;
		void fetchDocumentVersions(docId).then((dbVers) => {
			if (!isMounted || !dbVers || dbVers.length === 0) return;
			const mappedDbVersions: DocumentVersion[] = dbVers.map((dv) => {
				let contentMd = "";
				try {
					const parsed = JSON.parse(dv.content);
					contentMd = tiptapJsonToMarkdown(parsed) || dv.content;
				} catch {
					contentMd = dv.content;
				}
				const dateStr = dv.createdAt
					? new Date(dv.createdAt).toLocaleTimeString([], {
							hour: "2-digit",
							minute: "2-digit",
						})
					: "";
				return {
					id: `db_${dv.id}`,
					label: `v${dv.version}: ${dv.note || (dv.origin === "ai" ? "AI 改写" : "历史快照")}${dateStr ? ` (${dateStr})` : ""}`,
					mode: dv.origin === "ai" ? "rewrite" : "manual",
					content: contentMd,
					createdAt: dv.createdAt
						? new Date(dv.createdAt).getTime()
						: Date.now(),
					dbVersionId: dv.id,
					origin: dv.origin,
					isSavedToDb: true,
				};
			});

			setVersions((prev) => {
				const existingIds = new Set(prev.map((v) => v.id));
				const newUnique = mappedDbVersions.filter(
					(v) => !existingIds.has(v.id),
				);
				return [...prev, ...newUnique];
			});
		});
		return () => {
			isMounted = false;
		};
	}, [docId]);

	// Current active version models
	const activeLeftVersion = useMemo(
		() => versions.find((v) => v.id === leftVersionId) || versions[0],
		[versions, leftVersionId],
	);

	const activeRightVersion = useMemo(
		() =>
			versions.find((v) => v.id === rightVersionId) ||
			versions[versions.length - 1] ||
			versions[0],
		[versions, rightVersionId],
	);

	// 3. Slash Menu state for Right TipTap Editor
	const [slashMenu, setSlashMenu] = useState<SlashMenuState | null>(null);
	const slashMenuRef = useRef<SlashCommandMenuRef>(null);

	// 4. Left Read-only Rich Text Editor instance (initialized with normalized HTML)
	const leftPreviewEditor = useEditor({
		extensions: getEditorBaseExtensions(),
		content: initialBaseHtml || leftEditor.getJSON(),
		editable: false,
		immediatelyRender: false,
	});

	// 5. Right Editable Rich Text Editor instance initialized with normalized HTML clone
	const rightEditor = useEditor({
		extensions: [
			...getEditorBaseExtensions({
				placeholder: "等待 AI 生成或直接在此输入草稿，键入 '/' 呼出格式菜单...",
			}),
			SlashCommands.configure({
				suggestion: {
					render: () => ({
						onStart: (props) => {
							setSlashMenu({
								query: props.query,
								range: props.range,
								clientRect: props.clientRect ?? null,
								command: props.command,
							});
						},
						onUpdate: (props) => {
							setSlashMenu((prev) =>
								prev
									? {
											...prev,
											query: props.query,
											range: props.range,
											clientRect: props.clientRect ?? null,
										}
									: null,
							);
						},
						onKeyDown: (props) => {
							if (slashMenuRef.current) {
								return slashMenuRef.current.onKeyDown(props.event);
							}
							return false;
						},
						onExit: () => {
							setSlashMenu(null);
						},
					}),
				},
			}),
		],
		content: initialBaseHtml || leftEditor.getJSON(),
		editable: true,
		immediatelyRender: false,
	});

	// Word counts tracking actual visible text length
	const leftWordCount = useMemo(() => {
		return markdownToPlainText(activeLeftVersion?.content || "").length;
	}, [activeLeftVersion?.content]);

	const [rightWordCount, setRightWordCount] = useState<number>(() => {
		return markdownToPlainText(initialBaseMarkdown).length;
	});

	// Keep right word count in sync when active right version switches
	useEffect(() => {
		if (activeRightVersion?.content) {
			setRightWordCount(markdownToPlainText(activeRightVersion.content).length);
		}
	}, [activeRightVersion?.content]);

	useEffect(() => {
		if (!rightEditor) return;
		const updateCount = () => {
			if (diffViewMode === "diff") return;
			const text = rightEditor.getText();
			const md = tiptapJsonToMarkdown(rightEditor.getJSON()) || text;
			setRightWordCount(markdownToPlainText(md).length);
			// Update current version content in memory
			setVersions((prev) => {
				// If currently on v0 (immutable base), fork automatically to v_draft
				if (rightVersionId === "v0") {
					const hasDraft = prev.some((v) => v.id === "v_draft");
					if (hasDraft) {
						return prev.map((v) =>
							v.id === "v_draft"
								? {
										...v,
										content: md,
										mode: "manual",
										label: "演练草稿 (精修)",
									}
								: v,
						);
					}
					return [
						...prev,
						{
							id: "v_draft",
							label: "演练草稿 (精修)",
							mode: "manual",
							content: md,
							createdAt: Date.now(),
							origin: "human",
							isSavedToDb: false,
						},
					];
				}

				return prev.map((v) =>
					v.id === rightVersionId
						? {
								...v,
								content: md,
								mode: v.mode === "original" ? "manual" : v.mode,
								label:
									v.label.includes("(精修)") || v.label.includes("草稿")
										? v.label
										: `${v.label} (精修)`,
							}
						: v,
				);
			});

			if (rightVersionId === "v0") {
				setRightVersionId("v_draft");
			}
		};
		rightEditor.on("update", updateCount);
		return () => {
			rightEditor.off("update", updateCount);
		};
	}, [rightEditor, rightVersionId, diffViewMode]);

	// AI Streaming & Mode states
	const [selectedMode, setSelectedMode] = useState<SplitCanvasMode | null>(
		() => {
			if (modeLabel) {
				const matched = PRESET_MODES.find((m) => m.label === modeLabel);
				if (matched) return matched.id;
			}
			return null;
		},
	);
	const [customPrompt, setCustomPrompt] = useState(instruction || "");
	const [isStreaming, setIsStreaming] = useState(false);

	const leftScrollRef = useRef<HTMLDivElement>(null);
	const rightScrollRef = useRef<HTMLDivElement>(null);
	const isScrollingRef = useRef<"left" | "right" | null>(null);
	const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const abortControllerRef = useRef<AbortController | null>(null);
	const hasAutoTriggeredRef = useRef(false);

	// Synchronized smooth scrolling between columns
	const handleLeftScroll = useCallback(() => {
		if (isScrollingRef.current === "right") return;
		isScrollingRef.current = "left";
		if (leftScrollRef.current && rightScrollRef.current) {
			const left = leftScrollRef.current;
			const right = rightScrollRef.current;
			const maxScrollLeft = left.scrollHeight - left.clientHeight;
			const maxScrollRight = right.scrollHeight - right.clientHeight;
			if (maxScrollLeft > 0 && maxScrollRight > 0) {
				if (Math.abs(maxScrollLeft - maxScrollRight) <= 32) {
					right.scrollTop = Math.min(left.scrollTop, maxScrollRight);
				} else {
					const ratio = left.scrollTop / maxScrollLeft;
					right.scrollTop = ratio * maxScrollRight;
				}
			}
		}
		if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
		scrollTimeoutRef.current = setTimeout(() => {
			isScrollingRef.current = null;
		}, 60);
	}, []);

	const handleRightScroll = useCallback(() => {
		if (isScrollingRef.current === "left") return;
		isScrollingRef.current = "right";
		if (leftScrollRef.current && rightScrollRef.current) {
			const left = leftScrollRef.current;
			const right = rightScrollRef.current;
			const maxScrollLeft = left.scrollHeight - left.clientHeight;
			const maxScrollRight = right.scrollHeight - right.clientHeight;
			if (maxScrollLeft > 0 && maxScrollRight > 0) {
				if (Math.abs(maxScrollLeft - maxScrollRight) <= 32) {
					left.scrollTop = Math.min(right.scrollTop, maxScrollLeft);
				} else {
					const ratio = right.scrollTop / maxScrollRight;
					left.scrollTop = ratio * maxScrollLeft;
				}
			}
		}
		if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
		scrollTimeoutRef.current = setTimeout(() => {
			isScrollingRef.current = null;
		}, 60);
	}, []);

	// Stop AI generation
	const handleStopGenerate = useCallback(() => {
		if (abortControllerRef.current) {
			abortControllerRef.current.abort();
			abortControllerRef.current = null;
		}
		setIsStreaming(false);
	}, []);

	// Start AI generation into right rich text editor
	const handleStartGenerate = useCallback(
		async (
			modeOverride?: SplitCanvasMode | null,
			instructionOverride?: string,
		) => {
			if (!rightEditor) return;

			const mode = modeOverride !== undefined ? modeOverride : selectedMode;
			const preset = mode ? PRESET_MODES.find((m) => m.id === mode) : null;
			const promptExtra =
				instructionOverride !== undefined ? instructionOverride : customPrompt;

			// Base content to transform from currently selected left version
			const baseContent =
				activeLeftVersion?.content?.trim() || initialBaseMarkdown;
			if (!baseContent) return;

			// Create a new version entity in pool
			const nextVerNum = versions.length;
			const newVerId = `v${nextVerNum}`;
			const actionTitle = preset
				? preset.label
				: promptExtra.trim()
					? promptExtra.trim().slice(0, 10)
					: "智能优化";
			const label = `${newVerId}: ${actionTitle}${preset && promptExtra.trim() ? ` (${promptExtra.trim().slice(0, 10)})` : ""}`;
			const newVer: DocumentVersion = {
				id: newVerId,
				label,
				mode: mode || "rewrite",
				content: "",
				createdAt: Date.now(),
				instruction: promptExtra,
				origin: "ai",
				isSavedToDb: false,
			};

			setVersions((prev) => [...prev, newVer]);
			setRightVersionId(newVerId);
			setIsStreaming(true);

			const controller = new AbortController();
			abortControllerRef.current = controller;

			let fullHint = "";
			if (preset) {
				fullHint = promptExtra.trim()
					? `${preset.defaultHint}\n\n【用户补充的特别要求】：\n${promptExtra.trim()}`
					: preset.defaultHint;
			} else if (promptExtra.trim()) {
				fullHint = `你是一名专业中文内容创作与编辑助手。请根据以下用户提出的明确要求，对正文进行深度针对性改写与优化：\n\n【用户明确要求】：\n${promptExtra.trim()}\n\n【配图保留铁律】：原文中若包含任何 Markdown 图片（形如 \`![说明](URL)\`）或多媒体，必须完整保留其链接并合理安排在改写后对应段落之间，严禁删除任何图片！直接输出改写优化后的全篇正文，不要包含任何前缀、问候或说明。`;
			} else {
				fullHint = `你是一名资深文字编辑与内容优化大师。请对以下正文进行全面精细化润色与提升：纠正错别字、病句，优化行文结构与表达质感，提升逻辑流畅性。【配图保留铁律】：原文中若包含任何 Markdown 图片（形如 \`![说明](URL)\`）或多媒体，必须完整保留其链接并合理安排在对应段落中，严禁删除任何图片！直接输出优化后的全篇正文，不要包含任何前缀、问候或说明。`;
			}

			try {
				await streamRewriteText(
					{
						prompt: baseContent,
						systemHint: fullHint,
						stylePreset,
						articleTitle: docTitle,
					},
					{
						onChunk: (_delta, fullText) => {
							try {
								const { nodes } = markdownToTiptapDoc(fullText);
								rightEditor.commands.setContent(
									{
										type: "doc",
										content: nodes.length > 0 ? nodes : [{ type: "paragraph" }],
									},
									{ emitUpdate: false },
								);
								setRightWordCount(fullText.length);
								setVersions((prev) =>
									prev.map((v) =>
										v.id === newVerId ? { ...v, content: fullText } : v,
									),
								);
								if (rightScrollRef.current) {
									rightScrollRef.current.scrollTop =
										rightScrollRef.current.scrollHeight;
								}
							} catch (e) {
								console.warn("[SplitCompareView] setContent chunk error:", e);
							}
						},
						onDone: async (fullText) => {
							try {
								const { nodes } = markdownToTiptapDoc(fullText);

								// Scan and retain original images
								const originalImages: Array<{ src: string; alt?: string }> = [];
								const scanOriginalImages = (n: JSONContent) => {
									if (n.type === "image" && n.attrs?.src) {
										originalImages.push({
											src: String(n.attrs.src),
											alt: n.attrs.alt ? String(n.attrs.alt) : undefined,
										});
									}
									if (n.content && Array.isArray(n.content)) {
										for (const child of n.content) scanOriginalImages(child);
									}
								};
								scanOriginalImages(leftEditor.getJSON());

								const generatedSrcSet = new Set<string>();
								const scanGeneratedImages = (n: JSONContent) => {
									if (n.type === "image" && n.attrs?.src) {
										generatedSrcSet.add(String(n.attrs.src));
									}
									if (n.content && Array.isArray(n.content)) {
										for (const child of n.content) scanGeneratedImages(child);
									}
								};
								for (const node of nodes) scanGeneratedImages(node);

								const missingImages = originalImages.filter(
									(img) => !generatedSrcSet.has(img.src),
								);
								const finalNodes = [...nodes];
								if (missingImages.length > 0) {
									for (const img of missingImages) {
										finalNodes.push({
											type: "image",
											attrs: { src: img.src, alt: img.alt || "" },
										});
									}
								}

								rightEditor.commands.setContent(
									{
										type: "doc",
										content:
											finalNodes.length > 0
												? finalNodes
												: [{ type: "paragraph" }],
									},
									{ emitUpdate: true },
								);
								setRightWordCount(
									rightEditor.getText().length || fullText.length,
								);

								// Auto-persist AI completed version to SQLite document_versions table
								if (docId) {
									try {
										const savedVer = await snapshotVersionRpc({
											documentId: docId,
											content: JSON.stringify(rightEditor.getJSON()),
											origin: "ai",
											note: `${actionTitle}${preset && promptExtra ? ` (${promptExtra.slice(0, 12)})` : ""}`,
										});
										setVersions((prev) =>
											prev.map((v) =>
												v.id === newVerId
													? {
															...v,
															content: fullText,
															isSavedToDb: true,
															dbVersionId: savedVer.id,
															label: `${v.label} · 已落库`,
														}
													: v,
											),
										);
										toast.success(`版本【${label}】已自动存入数据库！`);
									} catch (err) {
										console.warn(
											"[SplitCompareView] Auto-save version DB error:",
											err,
										);
									}
								}
							} catch (e) {
								console.warn("[SplitCompareView] setContent done error:", e);
							}
							setIsStreaming(false);
						},
						onError: (err) => {
							console.warn("[SplitCompareView] Stream error:", err);
							setIsStreaming(false);
						},
					},
					controller.signal,
				);
			} catch (err) {
				if (!controller.signal.aborted) {
					console.error("[SplitCompareView] Generation error:", err);
				}
				setIsStreaming(false);
			}
		},
		[
			rightEditor,
			selectedMode,
			customPrompt,
			activeLeftVersion,
			initialBaseMarkdown,
			versions.length,
			stylePreset,
			docTitle,
			leftEditor,
			docId,
		],
	);

	// Auto-trigger if opened with instruction
	useEffect(() => {
		if (hasAutoTriggeredRef.current) return;
		if (instruction || modeLabel) {
			hasAutoTriggeredRef.current = true;
			const targetMode = modeLabel
				? PRESET_MODES.find((m) => m.label === modeLabel)?.id || null
				: null;
			setSelectedMode(targetMode);
			void handleStartGenerate(targetMode, instruction);
		}
	}, [instruction, modeLabel, handleStartGenerate]);

	// Clean up streaming on unmount
	useEffect(() => {
		return () => {
			if (abortControllerRef.current) {
				abortControllerRef.current.abort();
			}
		};
	}, []);

	// Handle version selection on right column
	const handleSelectRightVersion = useCallback(
		(versionId: string) => {
			setRightVersionId(versionId);
			const targetVer = versions.find((v) => v.id === versionId);
			if (!targetVer || !rightEditor) return;
			try {
				const html = markdownToHtml(targetVer.content);
				rightEditor.commands.setContent(html || "<p></p>", { emitUpdate: true });
				setRightWordCount(markdownToPlainText(targetVer.content).length);
			} catch {
				rightEditor.commands.setContent(targetVer.content);
				setRightWordCount(markdownToPlainText(targetVer.content).length);
			}
		},
		[versions, rightEditor],
	);

	// Manually save current active version to SQLite document_versions
	const handleSaveCurrentVersionToDb = useCallback(async () => {
		if (!docId || !rightEditor) return;
		setIsSavingVersion(true);
		try {
			const jsonContent = JSON.stringify(rightEditor.getJSON());
			const textPreview = rightEditor.getText().trim().slice(0, 15);
			const saved = await snapshotVersionRpc({
				documentId: docId,
				content: jsonContent,
				origin: "human",
				note: `手动存档: ${textPreview || "精修版"}`,
			});
			setVersions((prev) =>
				prev.map((v) =>
					v.id === rightVersionId
						? {
								...v,
								isSavedToDb: true,
								dbVersionId: saved.id,
								label: v.label.includes("[已存库]")
									? v.label
									: `${v.label} [已存库]`,
							}
						: v,
				),
			);
			toast.success("当前版本已成功持久化至数据库！");
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			toast.danger(`保存版本失败: ${msg}`);
		} finally {
			setIsSavingVersion(false);
		}
	}, [docId, rightEditor, rightVersionId]);

	// Accept right editor content into left main document
	const handleAccept = useCallback(async () => {
		if (!rightEditor) return;
		const text = rightEditor.getText().trim();
		if (!text) {
			toast.warning("右侧草稿内容为空，无法采纳覆盖正文");
			return;
		}
		// Save snapshot before accepting to ensure history is never lost
		if (docId) {
			try {
				await snapshotVersionRpc({
					documentId: docId,
					content: JSON.stringify(rightEditor.getJSON()),
					origin: "human",
					note: `采纳应用前快照: ${activeRightVersion.label}`,
				});
			} catch {
				// non-blocking
			}
		}
		onAccept(rightEditor.getJSON());
	}, [rightEditor, onAccept, docId, activeRightVersion.label]);

	// Save right editor content as a new standalone document
	const handleSaveAsNew = useCallback(async () => {
		if (!rightEditor || !onSaveAsNewDocument) return;
		const text = rightEditor.getText().trim();
		if (!text) {
			toast.warning("右侧草稿内容为空，无法另存为新文档");
			return;
		}
		const md = tiptapJsonToMarkdown(rightEditor.getJSON()) || text;
		const newTitle = `${docTitle || "未命名文档"} · 改写篇`;
		await onSaveAsNewDocument(newTitle, md);
	}, [rightEditor, docTitle, onSaveAsNewDocument]);

	// Compute Diff Highlighting strings and accurate word delta between left and right versions
	const diffStrings = useMemo(() => {
		if (diffViewMode !== "diff") {
			return { leftHighlighted: "", rightHighlighted: "", diffDelta: 0 };
		}
		const leftMd = activeLeftVersion?.content || "";
		const rightMd = activeRightVersion?.content || "";
		const leftHighlighted = buildHighlightedMarkdown(leftMd, rightMd, "base");
		const rightHighlighted = buildHighlightedMarkdown(
			leftMd,
			rightMd,
			"revised",
		);
		const diffDelta = computeDiffWordDelta(leftMd, rightMd);
		return { leftHighlighted, rightHighlighted, diffDelta };
	}, [diffViewMode, activeLeftVersion, activeRightVersion]);

	// Synchronize left & right editor contents between clean and diff highlighting modes
	const lastAppliedModeRef = useRef<ViewMode>("clean");
	const lastAppliedLeftVerRef = useRef<string>("v0");
	const lastAppliedRightVerRef = useRef<string>("v_draft");

	useEffect(() => {
		if (isStreaming) return;

		const modeChanged = lastAppliedModeRef.current !== diffViewMode;
		const leftVerChanged = lastAppliedLeftVerRef.current !== leftVersionId;
		const rightVerChanged = lastAppliedRightVerRef.current !== rightVersionId;

		if (!modeChanged && !leftVerChanged && !rightVerChanged) {
			return;
		}

		lastAppliedModeRef.current = diffViewMode;
		lastAppliedLeftVerRef.current = leftVersionId;
		lastAppliedRightVerRef.current = rightVersionId;

		if (diffViewMode === "diff") {
			// Diff mode: apply diff highlights and freeze right editor from manual typing
			if (leftPreviewEditor && diffStrings.leftHighlighted) {
				const html = markdownToHtml(diffStrings.leftHighlighted);
				leftPreviewEditor.commands.setContent(html || "<p></p>", {
					emitUpdate: false,
				});
			}
			if (rightEditor && diffStrings.rightHighlighted) {
				const html = markdownToHtml(diffStrings.rightHighlighted);
				rightEditor.commands.setContent(html || "<p></p>", {
					emitUpdate: false,
				});
				rightEditor.setEditable(false);
			}
		} else {
			// Clean mode: restore clean rich text content and re-enable editing
			if (leftPreviewEditor && activeLeftVersion) {
				const html = markdownToHtml(activeLeftVersion.content);
				leftPreviewEditor.commands.setContent(html || "<p></p>", {
					emitUpdate: false,
				});
			}
			if (rightEditor) {
				if (activeRightVersion) {
					const html = markdownToHtml(activeRightVersion.content);
					rightEditor.commands.setContent(html || "<p></p>", {
						emitUpdate: false,
					});
				}
				rightEditor.setEditable(true);
			}
		}
	}, [
		diffViewMode,
		leftVersionId,
		rightVersionId,
		diffStrings.leftHighlighted,
		diffStrings.rightHighlighted,
		activeLeftVersion,
		activeRightVersion,
		leftPreviewEditor,
		rightEditor,
		isStreaming,
	]);

	// Check if right editor has substantial changes compared to original main base text
	const hasSubstantialChanges = useMemo(() => {
		if (!rightEditor) return false;
		const rightText = rightEditor.getText().trim();
		if (!rightText) return false;
		const baseText = initialBaseMarkdown.trim();
		return rightText !== baseText;
	}, [rightEditor, initialBaseMarkdown]);

	const canAccept = hasSubstantialChanges && !isStreaming;
	const canSaveAsNew = rightWordCount > 0 && !isStreaming;

	return {
		// Version pool
		versions,
		leftVersionId,
		setLeftVersionId,
		rightVersionId,
		handleSelectRightVersion,
		activeLeftVersion,
		activeRightVersion,

		// TipTap editors
		leftPreviewEditor,
		rightEditor,

		// Slash Menu
		slashMenu,
		setSlashMenu,
		slashMenuRef,

		// Diff & word count
		diffViewMode,
		setDiffViewMode,
		diffStrings,
		leftWordCount,
		rightWordCount,

		// Action handlers & flags
		isStreaming,
		isSavingVersion,
		canAccept,
		canSaveAsNew,
		handleAccept,
		handleSaveAsNew,
		handleSaveCurrentVersionToDb,

		// AI floating dock state
		selectedMode,
		setSelectedMode,
		customPrompt,
		setCustomPrompt,
		handleStartGenerate,
		handleStopGenerate,

		// Synchronized scroll refs & handlers
		leftScrollRef,
		rightScrollRef,
		handleLeftScroll,
		handleRightScroll,
	};
}
