import {
	Button,
	Description,
	FieldError,
	Input,
	Label,
	ListBox,
	Modal,
	Select,
	Tabs,
	TextArea,
	TextField,
	toast,
} from "@heroui/react";
import { Check, FolderGit2, PlusCircle, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { requestInstallSkill } from "../../services/api/skillsClient";
import type { SkillRootInfo } from "./types";

export interface InstallSkillModalProps {
	isOpen: boolean;
	onClose: () => void;
	onSuccess: () => void;
	availableRoots: SkillRootInfo[];
}

const CATEGORIES = [
	"开发编程",
	"办公效率",
	"知识管理",
	"生活服务",
	"设计多媒体",
	"数据分析",
];

/**
 * Install skill modal dialog built with HeroUI components.
 */
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

	// Reset state when modal opens
	useEffect(() => {
		if (isOpen) {
			setError("");
		}
	}, [isOpen]);

	// Build selectable target root options
	const rootOptions = useMemo(() => {
		const defaultOptions = [
			{
				value: ".agents/skills",
				label: "当前项目工作区",
			},
			{
				value: "~/.gemini/config/skills",
				label: "全局通用目录",
			},
		];

		const extra = availableRoots
			.filter(
				(r) =>
					r.path !== ".agents/skills" && r.path !== "~/.gemini/config/skills",
			)
			.map((r) => ({
				value: r.path,
				label: r.label || r.path,
			}));

		return [...defaultOptions, ...extra];
	}, [availableRoots]);

	const selectedRoot =
		rootOptions.find((opt) => opt.value === targetRoot) || rootOptions[0];

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError("");

		const trimmedSlug = skillName.trim();
		if (!trimmedSlug) {
			setError("请输入技能英文标识（目录名）");
			return;
		}

		if (mode === "git" && !repoUrl.trim()) {
			setError("请输入 Git 仓库地址");
			return;
		}

		setSubmitting(true);
		try {
			const res = await requestInstallSkill({
				mode,
				skillName: trimmedSlug,
				title: title.trim() || trimmedSlug,
				description: description.trim(),
				repoUrl: repoUrl.trim(),
				category,
				targetRoot,
			});

			if (res.success) {
				toast.success(`技能 "${title.trim() || trimmedSlug}" 已成功安装`);
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
	};

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
				<Modal.Dialog aria-label="安装新技能" className="w-full max-w-lg">
					<Modal.CloseTrigger isDisabled={submitting} />

					{/* Modal Header */}
					<Modal.Header className="flex items-center gap-2.5 pb-2">
						<div className="w-7 h-7 rounded-lg bg-surface-secondary flex items-center justify-center text-foreground">
							<PlusCircle className="w-4 h-4" />
						</div>
						<Modal.Heading className="text-base font-semibold">
							安装新技能 (Skill)
						</Modal.Heading>
					</Modal.Header>

					<form onSubmit={handleSubmit} className="flex flex-col gap-4  h-[450px]">
						<Modal.Body className="space-y-4 pt-1">
							{/* Mode Tabs */}
							<Tabs
								selectedKey={mode}
								onSelectionChange={(key) => {
									setMode(key as "git" | "scaffold");
									setError("");
								}}
								className="w-full"
							>
								<Tabs.ListContainer className="w-full shrink-0">
									<Tabs.List className="w-full flex">
										<Tabs.Tab
											id="scaffold"
											className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium"
										>
											<Wrench className="w-3.5 h-3.5" />
											<span>快速脚手架新建</span>
											<Tabs.Indicator />
										</Tabs.Tab>
										<Tabs.Tab
											id="git"
											className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium"
										>
											<FolderGit2 className="w-3.5 h-3.5" />
											<span>Git 仓库安装</span>
											<Tabs.Indicator />
										</Tabs.Tab>
									</Tabs.List>
								</Tabs.ListContainer>
							</Tabs>

							{/* Skill Directory Slug */}
							<TextField
								value={skillName}
								onChange={(val) => {
									setSkillName(val);
									if (error) setError("");
								}}
								isRequired
							>
								<Label className="text-xs font-medium text-foreground">
									技能目录标识 (英文 Slug) <span className="text-danger">*</span>
								</Label>
								<Input
									placeholder="例如: sql-helper 或 web-scraper"
									variant="secondary"
									className="font-mono text-xs"
									autoFocus
								/>
							</TextField>

							{mode === "git" ? (
								/* Git Mode Fields */
								<TextField
									value={repoUrl}
									onChange={(val) => {
										setRepoUrl(val);
										if (error) setError("");
									}}
									isRequired
								>
									<Label className="text-xs font-medium text-foreground">
										Git 仓库 URL <span className="text-danger">*</span>
									</Label>
									<Input
										placeholder="https://github.com/owner/skill-name.git"
										variant="secondary"
										className="text-xs"
									/>
									<Description className="text-[11px] text-muted">
										将使用 git clone --depth 1 安全拉取至目标目录
									</Description>
								</TextField>
							) : (
								/* Scaffold Mode Fields */
								<>
									<div className="grid grid-cols-2 gap-3">
										<TextField value={title} onChange={setTitle}>
											<Label className="text-xs font-medium text-foreground">
												技能展示名称
											</Label>
											<Input
												placeholder="例如: SQL 调优助手"
												variant="secondary"
												className="text-xs"
											/>
										</TextField>

										<div className="flex flex-col gap-1.5">
											<Label className="text-xs font-medium text-foreground">
												场景分类
											</Label>
											<Select
												aria-label="选择技能场景分类"
												selectedKey={category}
												onSelectionChange={(key) => {
													if (key != null) setCategory(String(key));
												}}
											>
												<Select.Trigger className="h-9 px-3 py-1.5 rounded-lg border border-border bg-surface-secondary/40 text-foreground text-xs font-normal hover:bg-surface-secondary/60 shadow-none cursor-pointer flex items-center justify-between gap-1.5 transition-colors">
													<Select.Value className="text-xs text-foreground font-normal truncate leading-none">
														{category}
													</Select.Value>
													<Select.Indicator className="text-muted size-3 shrink-0" />
												</Select.Trigger>
												<Select.Popover className="min-w-[140px] max-h-60 overflow-y-auto p-1.5 rounded-xl border border-border bg-surface shadow-lg text-xs z-50">
													<ListBox className="space-y-0.5 outline-none p-0">
														{CATEGORIES.map((cat) => (
															<ListBox.Item
																key={cat}
																id={cat}
																textValue={cat}
																className={`flex items-center justify-between px-2.5 py-1.5 min-h-8 rounded-lg cursor-pointer transition-colors outline-none text-xs select-none ${
																	cat === category
																		? "bg-surface-secondary text-foreground font-medium"
																		: "text-muted hover:text-foreground hover:bg-surface-secondary/60"
																}`}
															>
																<span>{cat}</span>
																{cat === category && (
																	<Check className="w-3.5 h-3.5 text-primary" />
																)}
															</ListBox.Item>
														))}
													</ListBox>
												</Select.Popover>
											</Select>
										</div>
									</div>

									<TextField value={description} onChange={setDescription}>
										<Label className="text-xs font-medium text-foreground">
											技能功能描述
										</Label>
										<TextArea
											rows={2}
											placeholder="描述技能的主要指令、应用场景与核心能力..."
											variant="secondary"
											className="text-xs"
										/>
									</TextField>
								</>
							)}

							{/* Destination Root */}
							<div className="flex flex-col gap-1.5">
								<Label className="text-xs font-medium text-foreground">
									安装目标根目录
								</Label>
								<Select
									aria-label="选择安装目标根目录"
									selectedKey={targetRoot}
									onSelectionChange={(key) => {
										if (key != null) setTargetRoot(String(key));
									}}
								>
									<Select.Trigger className="h-9 px-3 py-1.5 rounded-lg border border-border bg-surface-secondary/40 text-foreground text-xs font-normal hover:bg-surface-secondary/60 shadow-none cursor-pointer flex items-center justify-between gap-1.5 transition-colors">
										<Select.Value className="text-xs text-foreground font-normal truncate leading-none">
											{selectedRoot?.label || targetRoot}
										</Select.Value>
										<Select.Indicator className="text-muted size-3 shrink-0" />
									</Select.Trigger>
									<Select.Popover className="min-w-[280px] max-h-60 overflow-y-auto p-1.5 rounded-xl border border-border bg-surface shadow-lg text-xs z-50">
										<ListBox className="space-y-0.5 outline-none p-0">
											{rootOptions.map((opt) => (
												<ListBox.Item
													key={opt.value}
													id={opt.value}
													textValue={opt.label}
													className={`flex items-center justify-between px-2.5 py-1.5 min-h-8 rounded-lg cursor-pointer transition-colors outline-none text-xs select-none ${
														opt.value === targetRoot
															? "bg-surface-secondary text-foreground font-medium"
															: "text-muted hover:text-foreground hover:bg-surface-secondary/60"
													}`}
												>
													<div className="flex flex-col min-w-0 pr-2">
														<span className="font-medium text-foreground truncate">
															{opt.label}
														</span>
														<span className="text-[10px] text-muted font-mono truncate">
															{opt.value}
														</span>
													</div>
													{opt.value === targetRoot && (
														<Check className="w-3.5 h-3.5 text-primary shrink-0" />
													)}
												</ListBox.Item>
											))}
										</ListBox>
									</Select.Popover>
								</Select>
							</div>

							{error && (
								<div className="p-2.5 rounded-xl bg-danger/10 text-danger border border-danger/20 text-xs">
									<FieldError>{error}</FieldError>
								</div>
							)}
						</Modal.Body>

						{/* Modal Footer */}
						<Modal.Footer className="flex items-center justify-end gap-2 pt-2 border-t border-border">
							<Button
								type="button"
								variant="secondary"
								size="sm"
								isDisabled={submitting}
								onPress={onClose}
							>
								取消
							</Button>
							<Button
								type="submit"
								variant="primary"
								size="sm"
								isPending={submitting}
							>
								开始安装
							</Button>
						</Modal.Footer>
					</form>
				</Modal.Dialog>
			</Modal.Container>
		</Modal.Backdrop>
	);
}

