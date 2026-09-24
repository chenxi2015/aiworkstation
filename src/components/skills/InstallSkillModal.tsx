import { FolderGit2, Loader2, PlusCircle, Wrench, X } from "lucide-react";
import { useState } from "react";
import { requestInstallSkill } from "../../services/api/skillsClient";
import type { SkillRootInfo } from "./types";

export interface InstallSkillModalProps {
	isOpen: boolean;
	onClose: () => void;
	onSuccess: () => void;
	availableRoots: SkillRootInfo[];
}

export function InstallSkillModal({
	isOpen,
	onClose,
	onSuccess,
	availableRoots,
}: InstallSkillModalProps) {
	const [mode, setMode] = useState<"git" | "scaffold">("scaffold");
	const [skillName, setSkillName] = useState("");
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [repoUrl, setRepoUrl] = useState("");
	const [category, setCategory] = useState("开发编程");
	const [targetRoot, setTargetRoot] = useState(
		availableRoots[0]?.path || ".agents/skills",
	);

	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState("");

	if (!isOpen) return null;

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError("");

		if (!skillName.trim()) {
			setError("请输入技能英文标识（目录名）");
			return;
		}

		if (mode === "git" && !repoUrl.trim()) {
			setError("请输入 Git 仓库地址");
			return;
		}

		setSubmitting(true);
		const res = await requestInstallSkill({
			mode,
			skillName: skillName.trim(),
			title: title.trim() || skillName.trim(),
			description: description.trim(),
			repoUrl: repoUrl.trim(),
			category,
			targetRoot,
		});

		setSubmitting(false);
		if (res.success) {
			onSuccess();
			onClose();
		} else {
			setError(res.message);
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
			<div className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xl overflow-hidden">
				{/* Modal Header */}
				<div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
					<div className="flex items-center gap-2">
						<div className="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-800 dark:text-zinc-200">
							<PlusCircle className="w-4 h-4" />
						</div>
						<h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
							安装新技能 (Skill)
						</h2>
					</div>
					<button
						type="button"
						onClick={onClose}
						disabled={submitting}
						className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
					>
						<X className="w-4 h-4" />
					</button>
				</div>

				<form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
					{/* Mode Tabs */}
					<div className="flex p-1 rounded-xl bg-zinc-100 dark:bg-zinc-800/80">
						<button
							type="button"
							onClick={() => setMode("scaffold")}
							className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg font-medium transition-all ${
								mode === "scaffold"
									? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs"
									: "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"
							}`}
						>
							<Wrench className="w-3.5 h-3.5" />
							快速脚手架新建
						</button>
						<button
							type="button"
							onClick={() => setMode("git")}
							className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg font-medium transition-all ${
								mode === "git"
									? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs"
									: "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"
							}`}
						>
							<FolderGit2 className="w-3.5 h-3.5" />
							Git 仓库安装
						</button>
					</div>

					{/* Skill Directory Slug */}
					<div>
						<label
							htmlFor="skill-slug-input"
							className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1"
						>
							技能目录标识 (英文 Slug) *
						</label>
						<input
							id="skill-slug-input"
							type="text"
							value={skillName}
							onChange={(e) => setSkillName(e.target.value)}
							placeholder="例如: sql-helper 或 web-scraper"
							className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400 font-mono text-xs"
							required
						/>
					</div>

					{mode === "git" ? (
						<div>
							<label
								htmlFor="skill-git-url"
								className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1"
							>
								Git 仓库 URL *
							</label>
							<input
								id="skill-git-url"
								type="text"
								value={repoUrl}
								onChange={(e) => setRepoUrl(e.target.value)}
								placeholder="https://github.com/owner/skill-name.git"
								className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400 text-xs"
								required
							/>
							<p className="mt-1 text-[10px] text-zinc-400">
								将使用 git clone --depth 1 安全拉取至目标目录
							</p>
						</div>
					) : (
						<>
							<div className="grid grid-cols-2 gap-3">
								<div>
									<label
										htmlFor="skill-title-input"
										className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1"
									>
										技能展示名称
									</label>
									<input
										id="skill-title-input"
										type="text"
										value={title}
										onChange={(e) => setTitle(e.target.value)}
										placeholder="例如: SQL 调优助手"
										className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400 text-xs"
									/>
								</div>
								<div>
									<label
										htmlFor="skill-category-select"
										className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1"
									>
										场景分类
									</label>
									<select
										id="skill-category-select"
										value={category}
										onChange={(e) => setCategory(e.target.value)}
										className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400 text-xs"
									>
										<option value="开发编程">开发编程</option>
										<option value="办公效率">办公效率</option>
										<option value="知识管理">知识管理</option>
										<option value="生活服务">生活服务</option>
										<option value="设计多媒体">设计多媒体</option>
										<option value="数据分析">数据分析</option>
									</select>
								</div>
							</div>

							<div>
								<label
									htmlFor="skill-desc-input"
									className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1"
								>
									技能功能描述
								</label>
								<textarea
									id="skill-desc-input"
									value={description}
									onChange={(e) => setDescription(e.target.value)}
									rows={2}
									placeholder="描述技能的主要指令、应用场景与核心能力..."
									className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400 text-xs resize-none"
								/>
							</div>
						</>
					)}

					{/* Destination Root */}
					<div>
						<label
							htmlFor="skill-dest-root"
							className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1"
						>
							安装目标根目录
						</label>
						<select
							id="skill-dest-root"
							value={targetRoot}
							onChange={(e) => setTargetRoot(e.target.value)}
							className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400 text-xs"
						>
							<option value=".agents/skills">
								当前项目工作区 (.agents/skills)
							</option>

							<option value="~/.gemini/config/skills">
								全局通用目录 (~/.gemini/config/skills)
							</option>
							{availableRoots
								.filter(
									(r) =>
										r.path !== ".agents/skills" &&
										r.path !== "~/.gemini/config/skills",
								)
								.map((r) => (
									<option key={r.path} value={r.path}>
										{r.label} ({r.path})
									</option>
								))}
						</select>
					</div>

					{error && (
						<div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 text-xs">
							{error}
						</div>
					)}

					{/* Modal Footer */}
					<div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-end gap-2">
						<button
							type="button"
							onClick={onClose}
							disabled={submitting}
							className="px-3.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
						>
							取消
						</button>
						<button
							type="submit"
							disabled={submitting}
							className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
						>
							{submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
							开始安装
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
