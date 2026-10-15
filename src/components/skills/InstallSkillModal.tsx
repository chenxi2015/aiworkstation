import { FieldError, Modal, toast } from "@heroui/react";
import {
	Archive,
	CheckCircle2,
	FileText,
	Folder,
	Loader2,
	UploadCloud,
	X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { UploadFileItem } from "../../server/services/skills/manage";
import {
	requestInspectGitHubSkill,
	requestInstallSkill,
} from "../../services/api/skillsClient";
import { SkillRootSelector } from "./SkillRootSelector";
import type { SkillRootInfo } from "./types";

export interface InstallSkillModalProps {
	isOpen: boolean;
	onClose: () => void;
	onSuccess: () => void;
	availableRoots: SkillRootInfo[];
}

interface LocalSelectedInfo {
	type: "file" | "folder" | "zip";
	name: string;
	sizeText: string;
	skillSlug: string;
	title: string;
	description: string;
	filesCount?: number;
	uploadFiles?: UploadFileItem[];
	zipBase64?: string;
}

/**
 * Install and create skill modal dialog based on the revised UX (Local Upload vs GitHub).
 */
export function InstallSkillModal({
	isOpen,
	onClose,
	onSuccess,
	availableRoots,
}: InstallSkillModalProps) {
	// Mode: "upload" (本地上传) or "git" (GitHub)
	const [activeTab, setActiveTab] = useState<"upload" | "git">("upload");

	// Common state
	const [targetRoot, setTargetRoot] = useState(
		availableRoots[0]?.path || ".agents/skills",
	);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState("");

	// Local upload state
	const [isDragOver, setIsDragOver] = useState(false);
	const [localSelected, setLocalSelected] = useState<LocalSelectedInfo | null>(
		null,
	);
	const folderInputRef = useRef<HTMLInputElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	// GitHub state
	const [githubInput, setGithubInput] = useState("");
	const [inspecting, setInspecting] = useState(false);
	const [gitResult, setGitResult] = useState<{
		normalizedRepoUrl: string;
		skillName: string;
		title: string;
		description: string;
		hasSkillMd?: boolean;
	} | null>(null);

	// Enable webkitdirectory on folder input element via ref
	useEffect(() => {
		if (folderInputRef.current) {
			folderInputRef.current.setAttribute("webkitdirectory", "");
			folderInputRef.current.setAttribute("directory", "");
		}
	}, []);

	// Reset state when modal opens
	useEffect(() => {
		if (isOpen) {
			setError("");
			setSubmitting(false);
			setLocalSelected(null);
			setGithubInput("");
			setGitResult(null);
			setTargetRoot(availableRoots[0]?.path || ".agents/skills");
		}
	}, [isOpen, availableRoots]);

	// Format file size
	const formatBytes = (bytes: number) => {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	};

	// Parse markdown frontmatter if present
	const parseMarkdownMetadata = (text: string, defaultName: string) => {
		let title = defaultName;
		let description = "本地创建的 Agent 技能";
		const fmMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
		if (fmMatch) {
			const fm = fmMatch[1];
			const nameMatch = fm.match(/^name:\s*["']?(.+?)["']?$/m);
			const descMatch = fm.match(/^description:\s*["']?(.+?)["']?$/m);
			if (nameMatch) title = nameMatch[1].trim();
			if (descMatch) description = descMatch[1].trim();
		}
		return { title, description };
	};

	// Handle single or multiple file selections (.md or .zip)
	const processSelectedFiles = async (files: FileList | File[]) => {
		setError("");
		if (!files || files.length === 0) return;

		// Check if first file is a zip archive
		const firstFile = files[0];
		const isZip =
			firstFile.name.endsWith(".zip") ||
			firstFile.type.includes("zip") ||
			firstFile.type.includes("compressed");

		if (isZip) {
			if (firstFile.size > 8 * 1024 * 1024) {
				setError("压缩包体积超过限制（最大 8MB）");
				return;
			}
			const reader = new FileReader();
			reader.onload = () => {
				const dataUrl = reader.result as string;
				const base64 = dataUrl.split(",")[1];
				const rawSlug = firstFile.name
					.replace(/\.zip$/i, "")
					.toLowerCase()
					.replace(/[^a-zA-Z0-9_\-.]/g, "-");

				setLocalSelected({
					type: "zip",
					name: firstFile.name,
					sizeText: formatBytes(firstFile.size),
					skillSlug: rawSlug || "my-skill",
					title: firstFile.name.replace(/\.zip$/i, ""),
					description: "从本地 Zip 压缩包导入的技能",
					zipBase64: base64,
				});
			};
			reader.readAsDataURL(firstFile);
			return;
		}

		// Check if folder upload (files have webkitRelativePath or multiple files)
		const isFolder = files.length > 1 || Boolean(firstFile.webkitRelativePath);

		if (isFolder) {
			let totalSize = 0;
			const uploadFiles: UploadFileItem[] = [];
			let skillMdContent = "";
			let folderName = "my-skill";

			for (let i = 0; i < files.length; i++) {
				const file = files[i];
				totalSize += file.size;

				const relPath = file.webkitRelativePath || file.name;
				const segments = relPath.split(/[/\\]/);
				if (segments.length > 1) {
					folderName = segments[0];
				}

				// Relative path inside the skill folder
				const internalPath =
					segments.length > 1 ? segments.slice(1).join("/") : relPath;

				if (file.name.toLowerCase() === "skill.md") {
					try {
						skillMdContent = await file.text();
					} catch {
						// ignore
					}
				}

				// Read text or base64 based on file type
				const isText =
					file.type.startsWith("text/") ||
					/\.(md|json|ts|js|py|sh|yaml|yml|txt|css|html)$/i.test(file.name);

				if (isText) {
					const content = await file.text();
					uploadFiles.push({ path: internalPath, content, isBase64: false });
				} else {
					const base64 = await new Promise<string>((resolve) => {
						const r = new FileReader();
						r.onload = () => {
							const res = (r.result as string).split(",")[1] || "";
							resolve(res);
						};
						r.readAsDataURL(file);
					});
					uploadFiles.push({
						path: internalPath,
						content: base64,
						isBase64: true,
					});
				}
			}

			if (totalSize > 8 * 1024 * 1024) {
				setError("文件夹总体积超过限制（最大 8MB）");
				return;
			}

			const rawSlug = folderName
				.toLowerCase()
				.replace(/[^a-zA-Z0-9_\-.]/g, "-");
			const meta = skillMdContent
				? parseMarkdownMetadata(skillMdContent, folderName)
				: { title: folderName, description: "从本地文件夹导入的技能" };

			setLocalSelected({
				type: "folder",
				name: folderName,
				sizeText: formatBytes(totalSize),
				filesCount: files.length,
				skillSlug: rawSlug || "my-skill",
				title: meta.title,
				description: meta.description,
				uploadFiles,
			});
			return;
		}

		// Single .md or other file
		if (firstFile.size > 8 * 1024 * 1024) {
			setError("文件体积超过限制（最大 8MB）");
			return;
		}

		const textContent = await firstFile.text();
		const baseName = firstFile.name.replace(/\.(md|markdown)$/i, "");
		const rawSlug = baseName.toLowerCase().replace(/[^a-zA-Z0-9_\-.]/g, "-");
		const meta = parseMarkdownMetadata(textContent, baseName);

		setLocalSelected({
			type: "file",
			name: firstFile.name,
			sizeText: formatBytes(firstFile.size),
			skillSlug: rawSlug || "my-skill",
			title: meta.title,
			description: meta.description,
			uploadFiles: [
				{
					path: "SKILL.md",
					content: textContent,
					isBase64: false,
				},
			],
		});
	};

	// Handle folder input change
	const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		if (e.target.files && e.target.files.length > 0) {
			processSelectedFiles(e.target.files);
		}
	};

	// Handle file input change
	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		if (e.target.files && e.target.files.length > 0) {
			processSelectedFiles(e.target.files);
		}
	};

	// Inspect GitHub repository
	const handleInspectGithub = async () => {
		const trimmed = githubInput.trim();
		if (!trimmed) {
			setError("请输入 GitHub 仓库地址或 owner/repository");
			return;
		}
		setError("");
		setInspecting(true);

		try {
			const res = await requestInspectGitHubSkill(trimmed);
			if (res.success) {
				setGitResult({
					normalizedRepoUrl: res.normalizedRepoUrl,
					skillName: res.skillName,
					title: res.title,
					description: res.description,
					hasSkillMd: res.hasSkillMd,
				});
				toast.success(res.message || "已解析仓库信息");
			} else {
				setError(res.message || "未能识别该 GitHub 仓库");
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : "识别异常";
			setError(msg);
		} finally {
			setInspecting(false);
		}
	};

	// Submit handler
	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError("");

		if (activeTab === "upload") {
			if (!localSelected) {
				setError("请先选择或拖拽上传 Skill 文件");
				return;
			}
			const slug = (localSelected.skillSlug || "").trim();
			if (!slug) {
				setError("请输入有效的技能英文标识");
				return;
			}

			setSubmitting(true);
			try {
				const res = await requestInstallSkill({
					mode: "upload",
					skillName: slug,
					targetRoot,
					title: localSelected.title,
					description: localSelected.description,
					uploadFiles: localSelected.uploadFiles,
					zipBase64: localSelected.zipBase64,
				});

				if (res.success) {
					toast.success(
						`技能「${localSelected.title || slug}」已成功创建并安装`,
					);
					onSuccess();
					onClose();
				} else {
					setError(res.message);
					toast.danger(res.message || "安装技能失败");
				}
			} catch (err) {
				const msg = err instanceof Error ? err.message : "安装技能时发生异常";
				setError(msg);
				toast.danger(msg);
			} finally {
				setSubmitting(false);
			}
		} else {
			// GitHub mode
			const trimmedInput = githubInput.trim();
			if (!trimmedInput) {
				setError("请输入 GitHub 仓库地址");
				return;
			}

			const repoToInstall =
				gitResult?.normalizedRepoUrl ||
				(trimmedInput.includes("github.com")
					? trimmedInput
					: `https://github.com/${trimmedInput}.git`);

			const slugToInstall = (
				gitResult?.skillName ||
				trimmedInput.split("/").pop() ||
				"new-skill"
			)
				.replace(/\.git$/, "")
				.toLowerCase()
				.replace(/[^a-zA-Z0-9_\-.]/g, "-");

			setSubmitting(true);
			try {
				const res = await requestInstallSkill({
					mode: "git",
					skillName: slugToInstall,
					targetRoot,
					repoUrl: repoToInstall,
					title: gitResult?.title || slugToInstall,
					description: gitResult?.description || `来自 ${trimmedInput} 的技能`,
				});

				if (res.success) {
					toast.success(
						`技能「${gitResult?.title || slugToInstall}」已成功安装`,
					);
					onSuccess();
					onClose();
				} else {
					setError(res.message);
					toast.danger(res.message || "从 GitHub 安装技能失败");
				}
			} catch (err) {
				const msg = err instanceof Error ? err.message : "安装技能时发生异常";
				setError(msg);
				toast.danger(msg);
			} finally {
				setSubmitting(false);
			}
		}
	};

	// Determine if Submit button should be enabled
	const canSubmit =
		activeTab === "upload"
			? Boolean(localSelected?.skillSlug.trim())
			: Boolean(githubInput.trim());

	return (
		<Modal.Backdrop
			isOpen={isOpen}
			onOpenChange={(open) => {
				if (!open && !submitting) {
					onClose();
				}
			}}
			variant="blur"
		>
			<Modal.Container size="sm" className="w-full">
				<Modal.Dialog
					aria-label="创建 Skill"
					className="w-full max-w-[520px] rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl p-6 overflow-visible"
				>
					{/* Modal Header: Title on left, Segmented Tabs on right, Close button */}
					<div className="flex items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800/80">
						<h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
							创建 Skill
						</h2>

						<div className="flex items-center gap-3">
							{/* Segmented Control Tabs (Matching Screenshot 2 & 3) */}
							<div className="flex items-center p-0.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-700/60 text-xs">
								<button
									type="button"
									onClick={() => {
										setActiveTab("upload");
										setError("");
									}}
									className={`px-3 py-1 rounded-md transition-all font-medium ${
										activeTab === "upload"
											? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs"
											: "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
									}`}
								>
									本地上传
								</button>
								<button
									type="button"
									onClick={() => {
										setActiveTab("git");
										setError("");
									}}
									className={`px-3 py-1 rounded-md transition-all font-medium ${
										activeTab === "git"
											? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs"
											: "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
									}`}
								>
									GitHub
								</button>
							</div>

							{/* Close Button */}
							<button
								type="button"
								onClick={onClose}
								disabled={submitting}
								className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
							>
								<X className="w-4 h-4" />
							</button>
						</div>
					</div>

					<form onSubmit={handleSubmit} className="flex flex-col gap-5 pt-4">
						{/* Hidden Native File Inputs */}
						<input
							ref={folderInputRef}
							type="file"
							multiple
							onChange={handleFolderChange}
							className="hidden"
						/>
						<input
							ref={fileInputRef}
							type="file"
							accept=".zip,.md,.markdown"
							onChange={handleFileChange}
							className="hidden"
						/>

						{activeTab === "upload" ? (
							/* ===== TAB 1: 本地上传 (图二) ===== */
							<div className="space-y-4">
								<div className="space-y-1.5">
									<span className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
										选择 Skill 文件
									</span>

									{/* Drag & Drop Zone */}
									<section
										aria-label="Skill 文件上传区域"
										onDragOver={(e) => {
											e.preventDefault();
											setIsDragOver(true);
										}}
										onDragLeave={(e) => {
											e.preventDefault();
											setIsDragOver(false);
										}}
										onDrop={(e) => {
											e.preventDefault();
											setIsDragOver(false);
											if (e.dataTransfer.files) {
												processSelectedFiles(e.dataTransfer.files);
											}
										}}
										className={`relative rounded-xl border-2 border-dashed p-6 transition-all flex flex-col items-center justify-center text-center ${
											isDragOver
												? "border-blue-500 bg-blue-50/30 dark:bg-blue-950/20"
												: "border-zinc-200 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-900/40 hover:border-zinc-300 dark:hover:border-zinc-700"
										}`}
									>
										{!localSelected ? (
											<>
												{/* Cloud Upload Icon */}
												<div className="w-12 h-12 rounded-full bg-gradient-to-b from-zinc-100 to-zinc-200 dark:from-zinc-805 flex items-center justify-center text-zinc-500 dark:text-zinc-300 shadow-inner mb-3">
													<UploadCloud className="w-6 h-6 stroke-[1.75]" />
												</div>

												{/* Main Prompt */}
												<p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-1">
													点击或拖拽上传 Skill 文件
												</p>

												{/* Subtitle */}
												<p className="text-[11px] text-zinc-400 mb-4">
													支持 .zip、.md 或文件夹，最大 8MB
												</p>

												{/* Action Buttons */}
												<div className="flex items-center gap-3">
													<button
														type="button"
														onClick={() => folderInputRef.current?.click()}
														className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-750 text-xs font-medium text-zinc-700 dark:text-zinc-200 shadow-2xs transition-colors"
													>
														<Folder className="w-3.5 h-3.5 text-zinc-500" />
														<span>本地文件夹</span>
													</button>
													<button
														type="button"
														onClick={() => fileInputRef.current?.click()}
														className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-750 text-xs font-medium text-zinc-700 dark:text-zinc-200 shadow-2xs transition-colors"
													>
														<UploadCloud className="w-3.5 h-3.5 text-zinc-500" />
														<span>本地文件</span>
													</button>
												</div>
											</>
										) : (
											/* Selected State Card */
											<div className="w-full flex items-center justify-between gap-3 p-3 rounded-lg bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 shadow-xs text-left">
												<div className="flex items-center gap-3 min-w-0">
													<div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-500 flex items-center justify-center shrink-0">
														{localSelected.type === "zip" ? (
															<Archive className="w-4 h-4" />
														) : localSelected.type === "folder" ? (
															<Folder className="w-4 h-4" />
														) : (
															<FileText className="w-4 h-4" />
														)}
													</div>
													<div className="min-w-0 flex-1">
														<p className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate">
															{localSelected.name}
														</p>
														<p className="text-[11px] text-zinc-400 mt-0.5">
															{localSelected.filesCount
																? `${localSelected.filesCount} 个文件 · ${localSelected.sizeText}`
																: localSelected.sizeText}
															{localSelected.title && (
																<span className="ml-1 text-zinc-500">
																	({localSelected.title})
																</span>
															)}
														</p>
													</div>
												</div>

												{/* Re-choose / Clear Button */}
												<button
													type="button"
													onClick={() => setLocalSelected(null)}
													className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700/60 transition-colors shrink-0"
												>
													重新选择
												</button>
											</div>
										)}
									</section>
								</div>

								{/* Custom Slug Name (Editable when file is selected) */}
								{localSelected && (
									<div className="space-y-1">
										<label
											htmlFor="skill-slug-input"
											className="block text-xs font-medium text-zinc-700 dark:text-zinc-300"
										>
											技能目录标识 (英文 Slug)
										</label>
										<input
											id="skill-slug-input"
											type="text"
											value={localSelected.skillSlug}
											onChange={(e) =>
												setLocalSelected({
													...localSelected,
													skillSlug: e.target.value,
												})
											}
											placeholder="例如: sql-helper 或 my-skill"
											className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400"
										/>
									</div>
								)}

								{/* Destination Root Selector (Solved Issue 1: No cutoff) */}
								<div className="space-y-1.5">
									<span className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
										安装目标根目录
									</span>
									<SkillRootSelector
										value={targetRoot}
										onChange={setTargetRoot}
										availableRoots={availableRoots}
									/>
								</div>
							</div>
						) : (
							/* ===== TAB 2: GitHub (图三) ===== */
							<div className="space-y-4">
								<div className="space-y-1.5">
									<span className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
										GitHub 仓库
									</span>

									{/* Input Group with Embedded Action Button */}
									<div className="flex items-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 focus-within:ring-2 focus-within:ring-zinc-400 dark:focus-within:ring-zinc-600 focus-within:border-transparent transition-all overflow-hidden shadow-2xs">
										<input
											type="text"
											value={githubInput}
											onChange={(e) => {
												setGithubInput(e.target.value);
												if (error) setError("");
											}}
											onKeyDown={(e) => {
												if (e.key === "Enter") {
													e.preventDefault();
													handleInspectGithub();
												}
											}}
											placeholder="粘贴 GitHub URL 或输入 owner/repository"
											className="flex-1 px-3.5 py-2.5 text-xs bg-transparent text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none"
										/>
										<div className="h-5 w-px bg-zinc-200 dark:bg-zinc-800" />
										<button
											type="button"
											onClick={handleInspectGithub}
											disabled={!githubInput.trim() || inspecting}
											className="px-4 py-2.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 shrink-0"
										>
											{inspecting ? (
												<Loader2 className="w-3.5 h-3.5 animate-spin" />
											) : null}
											<span>{inspecting ? "识别中..." : "识别 Skill"}</span>
										</button>
									</div>

									{/* Helper text */}
									<p className="text-[11px] text-zinc-400 leading-normal">
										支持公开 GitHub 仓库、Skill 子目录及 owner/repository 简称。
									</p>
								</div>

								{/* Recognition Result Card */}
								{gitResult && (
									<div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-850/50 space-y-2 text-xs">
										<div className="flex items-center justify-between">
											<div className="flex items-center gap-1.5 font-medium text-zinc-800 dark:text-zinc-200">
												<CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
												<span>已识别：{gitResult.title}</span>
											</div>
											{gitResult.hasSkillMd && (
												<span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-[10px] font-medium border border-emerald-200/50 dark:border-emerald-800/50">
													包含规范 SKILL.md
												</span>
											)}
										</div>

										<p className="text-zinc-500 text-[11px] line-clamp-2">
											{gitResult.description}
										</p>

										<div className="pt-1 flex items-center gap-2">
											<label
												htmlFor="git-skill-name-input"
												className="text-[11px] text-zinc-400 shrink-0"
											>
												技能标识:
											</label>
											<input
												id="git-skill-name-input"
												type="text"
												value={gitResult.skillName}
												onChange={(e) =>
													setGitResult({
														...gitResult,
														skillName: e.target.value,
													})
												}
												className="flex-1 px-2 py-1 text-xs font-mono rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200"
											/>
										</div>
									</div>
								)}

								{/* Destination Root Selector (Solved Issue 1: No cutoff) */}
								<div className="space-y-1.5">
									<span className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
										安装目标根目录
									</span>
									<SkillRootSelector
										value={targetRoot}
										onChange={setTargetRoot}
										availableRoots={availableRoots}
									/>
								</div>
							</div>
						)}

						{/* Error Banner */}
						{error && (
							<div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200/80 dark:border-red-900/60 text-xs">
								<FieldError>{error}</FieldError>
							</div>
						)}

						{/* Modal Footer (Matching Screenshot 2 & 3: Cancel and Create) */}
						<div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-100 dark:border-zinc-800/80">
							<button
								type="button"
								onClick={onClose}
								disabled={submitting}
								className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 bg-zinc-100/80 dark:bg-zinc-800 hover:bg-zinc-200/80 dark:hover:bg-zinc-700 transition-colors"
							>
								取消
							</button>

							<button
								type="submit"
								disabled={!canSubmit || submitting}
								className={`px-5 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 ${
									!canSubmit || submitting
										? "bg-indigo-300/80 dark:bg-indigo-500/40 text-white/90 cursor-not-allowed"
										: "bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 text-white shadow-xs cursor-pointer"
								}`}
							>
								{submitting ? (
									<>
										<Loader2 className="w-3.5 h-3.5 animate-spin" />
										<span>正在安装...</span>
									</>
								) : (
									<span>创建</span>
								)}
							</button>
						</div>
					</form>
				</Modal.Dialog>
			</Modal.Container>
		</Modal.Backdrop>
	);
}
