import { toast } from "@heroui/react";
import { EditorContent, type JSONContent, useEditor } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	fetchDocumentVersions,
	snapshotVersionRpc,
	streamRewriteText,
} from "../../../services/api/editorClient";
import { getEditorBaseExtensions } from "../extensions/baseExtensions";
import { SlashCommands } from "../extensions/slashCommand";
import type { SlashMenuState } from "../hooks/useRichTextEditor";
import { markdownToTiptapDoc, tiptapJsonToMarkdown } from "../markdown";
import { buildHighlightedMarkdown } from "../utils/diffHelper";
import { SlashCommandMenu, type SlashCommandMenuRef } from "./SlashCommandMenu";
import { SplitCompareHeader } from "./split/SplitCompareHeader";
import { SplitFloatingPromptDock } from "./split/SplitFloatingPromptDock";
import { SplitMarkdownBlock } from "./split/SplitMarkdownBlock";
import { SplitVersionSelector } from "./split/SplitVersionSelector";
import {
	type DocumentVersion,
	PRESET_MODES,
	type SplitCanvasMode,
	type SplitCompareViewProps,
	type ViewMode,
} from "./split/types";

export type { SplitCompareViewProps };

/**
 * Dual Rich-Text Split View with Diff & Version System:
 * - Top header: Diff / Clean toggle, Save version to DB, Accept & Save as new actions
 * - Left column: Base version view (Clean: read-only rich text, Diff: red deletion highlights)
 * - Right column: Draft practice canvas (Clean: editable rich text with Slash '/' menu, Diff: green insertion highlights)
 * - Version dropdowns in both column headers (loaded from and persisted to SQLite document_versions)
 * - Floating AI dock at bottom right for continuous generation
 */
export function SplitCompareView({
	leftEditor,
	docTitle,
	docId,
	stylePreset,
	instruction,
	modeLabel,
	onAccept,
	onCancel,
	onSaveAsNewDocument,
}: SplitCompareViewProps) {
	// 1. Initial base markdown extracted from left TipTap editor
	const initialBaseMarkdown = useMemo(() => {
		try {
			const md = tiptapJsonToMarkdown(leftEditor.getJSON());
			return md.trim() || leftEditor.getText().trim();
		} catch {
			return leftEditor.getText().trim();
		}
	}, [leftEditor]);

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

	// 4. Left Read-only Rich Text Editor instance
	const leftPreviewEditor = useEditor({
		extensions: getEditorBaseExtensions(),
		content: leftEditor.getJSON(),
		editable: false,
		immediatelyRender: false,
	});

	// 5. Right Editable Rich Text Editor instance initialized with content clone
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
		content: leftEditor.getJSON(),
		editable: true,
		immediatelyRender: false,
	});

	// Synchronize left editor when left version switches (protect v0 from unexpected overwrites)
	const currentLeftLoadedIdRef = useRef<string>("v0");
	useEffect(() => {
		if (!leftPreviewEditor || !activeLeftVersion) return;
		if (leftVersionId === "v0" && currentLeftLoadedIdRef.current === "v0") {
			// v0 was already initialized cleanly with leftEditor.getJSON(), do not touch it
			return;
		}
		currentLeftLoadedIdRef.current = leftVersionId;
		try {
			const { nodes } = markdownToTiptapDoc(activeLeftVersion.content);
			leftPreviewEditor.commands.setContent(
				{
					type: "doc",
					content: nodes.length > 0 ? nodes : [{ type: "paragraph" }],
				},
				{ emitUpdate: false },
			);
		} catch {
			leftPreviewEditor.commands.setContent(activeLeftVersion.content);
		}
	}, [leftPreviewEditor, leftVersionId, activeLeftVersion.content]);

	// Word counts and sync changes from right editor
	const leftWordCount = activeLeftVersion?.content?.length || 0;
	const [rightWordCount, setRightWordCount] = useState(
		() => leftEditor.getText().length,
	);

	useEffect(() => {
		if (!rightEditor) return;
		const updateCount = () => {
			const text = rightEditor.getText();
			setRightWordCount(text.length);
			// Update current version content in memory
			const md = tiptapJsonToMarkdown(rightEditor.getJSON()) || text;
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
	}, [rightEditor, rightVersionId]);

	// AI Streaming & Mode states
	const [selectedMode, setSelectedMode] = useState<SplitCanvasMode>(() => {
		if (modeLabel) {
			const matched = PRESET_MODES.find((m) => m.label === modeLabel);
			if (matched) return matched.id;
		}
		return "spin";
	});
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
				// Use 1:1 pixel scroll when content heights are nearly identical to prevent drift
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
				// Use 1:1 pixel scroll when content heights are nearly identical to prevent drift
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
		async (modeOverride?: SplitCanvasMode, instructionOverride?: string) => {
			if (!rightEditor) return;

			const mode = modeOverride || selectedMode;
			const preset = PRESET_MODES.find((m) => m.id === mode) || PRESET_MODES[0];
			const promptExtra =
				instructionOverride !== undefined ? instructionOverride : customPrompt;

			// Base content to transform from currently selected left version
			const baseContent =
				activeLeftVersion?.content?.trim() || initialBaseMarkdown;
			if (!baseContent) return;

			// Create a new version entity in pool
			const nextVerNum = versions.length;
			const newVerId = `v${nextVerNum}`;
			const label = `${newVerId}: ${preset.label}${promptExtra ? ` (${promptExtra.slice(0, 10)})` : ""}`;
			const newVer: DocumentVersion = {
				id: newVerId,
				label,
				mode,
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

			const fullHint = promptExtra
				? `${preset.defaultHint}\n\n【用户补充的特别要求】：\n${promptExtra}`
				: preset.defaultHint;

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
											note: `${preset.label}${promptExtra ? ` (${promptExtra.slice(0, 12)})` : ""}`,
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
			const targetMode =
				PRESET_MODES.find((m) => m.label === modeLabel)?.id || "spin";
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
				const { nodes } = markdownToTiptapDoc(targetVer.content);
				rightEditor.commands.setContent(
					{
						type: "doc",
						content: nodes.length > 0 ? nodes : [{ type: "paragraph" }],
					},
					{ emitUpdate: true },
				);
				setRightWordCount(targetVer.content.length);
			} catch {
				rightEditor.commands.setContent(targetVer.content);
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

	// Compute Diff Highlighting strings between left and right versions
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
		const diffDelta = rightMd.length - leftMd.length;
		return { leftHighlighted, rightHighlighted, diffDelta };
	}, [diffViewMode, activeLeftVersion, activeRightVersion]);

	// Check if right editor has substantial changes compared to original main base text
	const hasSubstantialChanges = useMemo(() => {
		if (!rightEditor) return false;
		const rightText = rightEditor.getText().trim();
		if (!rightText) return false;
		const baseText = initialBaseMarkdown.trim();
		return rightText !== baseText;
	}, [rightEditor, initialBaseMarkdown, rightWordCount]);

	const canAccept = hasSubstantialChanges && !isStreaming;
	const canSaveAsNew = rightWordCount > 0 && !isStreaming;

	return (
		<div className="flex-1 flex flex-col min-h-0 bg-surface dark:bg-background overflow-hidden relative select-text">
			{/* Top Control Header with Diff Mode Switcher & Save Version Button */}
			<SplitCompareHeader
				docTitle={docTitle}
				modeLabel={modeLabel}
				isStreaming={isStreaming}
				diffViewMode={diffViewMode}
				onChangeDiffViewMode={setDiffViewMode}
				onSaveVersionToDb={handleSaveCurrentVersionToDb}
				isSavingVersion={isSavingVersion}
				canAccept={canAccept}
				canSaveAsNew={canSaveAsNew}
				onAccept={handleAccept}
				onCancel={onCancel}
				onSaveAsNewDocument={onSaveAsNewDocument ? handleSaveAsNew : undefined}
			/>

			{/* Main Split Body: Left 50% vs Right 50% */}
			<div className="flex-1 min-h-0 flex overflow-hidden relative">
				{/* Left Column: Base Version (Clean: read-only rich text, Diff: red deletion highlights) */}
				<section className="flex-1 flex flex-col min-w-0 border-r border-border/80 bg-surface/50 dark:bg-background/50">
					{/* Left Header with Version Selector */}
					<div className="h-9 px-4 border-b border-border/60 bg-surface-secondary/40 flex items-center justify-between text-xs text-muted font-medium shrink-0 select-none">
						<SplitVersionSelector
							labelPrefix="左栏 · 基准"
							selectedVersionId={leftVersionId}
							versions={versions}
							onSelectVersion={setLeftVersionId}
						/>
						<span className="text-[11px] opacity-75 font-mono">
							{leftWordCount} 字
						</span>
					</div>

					{/* Left Content Area */}
					<div
						ref={leftScrollRef}
						onScroll={handleLeftScroll}
						className="flex-1 overflow-y-auto px-8 py-6 pb-48 select-text"
					>
						<div className="max-w-2xl mx-auto">
							{diffViewMode === "diff" ? (
								<SplitMarkdownBlock
									markdownText={diffStrings.leftHighlighted}
									viewMode="diff"
								/>
							) : (
								<EditorContent
									editor={leftPreviewEditor}
									className="tiptap-editor prose prose-neutral dark:prose-invert max-w-none focus:outline-none"
								/>
							)}
						</div>
					</div>
				</section>

				{/* Right Column: Draft Practice Canvas with Slash Menu & AI Dock */}
				<section className="flex-1 flex flex-col min-w-0 bg-surface dark:bg-background relative">
					{/* Right Header with Version Selector */}
					<div className="h-9 px-4 border-b border-border/60 bg-accent/5 flex items-center justify-between text-xs font-medium shrink-0 text-accent select-none">
						<div className="flex items-center gap-2">
							<span
								className={`w-2 h-2 rounded-full bg-accent ${
									isStreaming ? "animate-ping" : ""
								}`}
							/>
							<SplitVersionSelector
								labelPrefix="右栏 · 演练"
								selectedVersionId={rightVersionId}
								versions={versions}
								onSelectVersion={handleSelectRightVersion}
								disabled={isStreaming}
							/>
						</div>
						<div className="flex items-center gap-2">
							{diffViewMode === "diff" && (
								<>
									<span
										className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
											diffStrings.diffDelta >= 0
												? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
												: "bg-rose-500/15 text-rose-600 dark:text-rose-400"
										}`}
									>
										{diffStrings.diffDelta >= 0
											? `+${diffStrings.diffDelta}`
											: diffStrings.diffDelta}{" "}
										字
									</span>
									<button
										type="button"
										onClick={() => setDiffViewMode("clean")}
										className="text-[11px] text-accent/80 hover:text-accent underline cursor-pointer hidden sm:inline"
									>
										切回纯净编辑
									</button>
								</>
							)}
							<span className="text-[11px] text-muted font-mono">
								{rightWordCount} 字
							</span>
						</div>
					</div>

					{/* Right Content Area */}
					<div
						ref={rightScrollRef}
						onScroll={handleRightScroll}
						className="flex-1 overflow-y-auto px-8 py-6 pb-48 select-text relative"
					>
						<div className="max-w-2xl mx-auto">
							{diffViewMode === "diff" && !isStreaming ? (
								<SplitMarkdownBlock
									markdownText={diffStrings.rightHighlighted}
									viewMode="diff"
								/>
							) : (
								<EditorContent
									editor={rightEditor}
									className="tiptap-editor prose prose-neutral dark:prose-invert max-w-none focus:outline-none"
								/>
							)}
						</div>
					</div>

					{/* Slash Commands Floating Popup Menu in right editor */}
					{slashMenu && rightEditor && (
						<SlashCommandMenu
							ref={slashMenuRef}
							editor={rightEditor}
							range={slashMenu.range}
							query={slashMenu.query}
							clientRect={slashMenu.clientRect}
							onClose={() => setSlashMenu(null)}
						/>
					)}

					{/* Floating AI Prompt Input anchored at bottom of right column */}
					<SplitFloatingPromptDock
						selectedMode={selectedMode}
						onSelectMode={setSelectedMode}
						customPrompt={customPrompt}
						onChangeCustomPrompt={setCustomPrompt}
						isStreaming={isStreaming}
						onStartGenerate={() => handleStartGenerate()}
						onStopGenerate={handleStopGenerate}
					/>
				</section>
			</div>
		</div>
	);
}
