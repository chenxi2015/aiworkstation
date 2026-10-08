import { AlertDialog, Button, Dropdown } from "@heroui/react";
import {
	ArrowLeft,
	BookmarkCheck,
	Check,
	Columns2,
	Ellipsis,
	FilePlus,
	GitCompare,
	Link2,
	Link2Off,
	Save,
	Sparkles,
	X,
} from "lucide-react";
import { useState } from "react";
import type { ViewMode } from "./types";

export interface SplitCompareHeaderProps {
	docTitle?: string;
	modeLabel?: string;
	isStreaming: boolean;
	diffViewMode?: ViewMode;
	onChangeDiffViewMode?: (mode: ViewMode) => void;
	isSyncScroll?: boolean;
	onToggleSyncScroll?: () => void;
	onSaveVersionToDb?: () => void;
	isSavingVersion?: boolean;
	canAccept?: boolean;
	canSaveAsNew?: boolean;
	rightWordCount?: number;
	onAccept: () => void;
	onCancel: () => void;
	onSaveAsNewDocument?: () => void;
}

/**
 * Top control header for dual-editor AI Creation Mode:
 * Includes Diff vs Clean view switcher, Save version to DB, Exit and Accept actions with confirmation.
 * Adapts gracefully to small screens with a more-actions dropdown menu.
 */
export function SplitCompareHeader({
	docTitle,
	modeLabel,
	isStreaming,
	diffViewMode = "clean",
	onChangeDiffViewMode,
	isSyncScroll = false,
	onToggleSyncScroll,
	onSaveVersionToDb,
	isSavingVersion = false,
	canAccept = true,
	canSaveAsNew = true,
	rightWordCount = 0,
	onAccept,
	onCancel,
	onSaveAsNewDocument,
}: SplitCompareHeaderProps) {
	const [isExitConfirmOpen, setIsExitConfirmOpen] = useState(false);
	const [isAcceptConfirmOpen, setIsAcceptConfirmOpen] = useState(false);

	const hasRightContent = rightWordCount > 0;
	const isAcceptDisabled = isStreaming || !canAccept || !hasRightContent;
	const isSaveVersionDisabled =
		isStreaming || isSavingVersion || !hasRightContent;
	const isSaveAsNewDisabled = isStreaming || !canSaveAsNew || !hasRightContent;

	const handleRequestExit = () => {
		// Prompt confirmation before exiting
		setIsExitConfirmOpen(true);
	};

	return (
		<>
			<header className="h-11 border-b border-border bg-surface/95 dark:bg-surface-secondary/80 backdrop-blur-md px-2.5 sm:px-4 flex items-center justify-between shrink-0 z-20 shadow-xs select-none gap-2">
				{/* Left: Return & Title */}
				<div className="flex items-center gap-2 sm:gap-2.5 min-w-0 shrink">
					<Button
						variant="ghost"
						size="sm"
						isIconOnly
						className="h-7 w-7 text-muted hover:text-foreground cursor-pointer rounded-lg shrink-0"
						onPress={handleRequestExit}
						aria-label="返回常规写作"
					>
						<ArrowLeft className="w-4 h-4" />
					</Button>
					<div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
						<div className="w-5 h-5 rounded bg-accent/15 text-accent flex items-center justify-center shrink-0">
							<Sparkles className="w-3.5 h-3.5" />
						</div>
						<h2 className="font-semibold text-xs text-foreground truncate max-w-[110px] sm:max-w-[160px] md:max-w-[200px]">
							AI 创作模式{modeLabel ? ` · ${modeLabel}` : ""}
						</h2>
						{docTitle && (
							<span className="hidden md:inline text-[11px] text-muted truncate max-w-[100px] lg:max-w-[180px]">
								《{docTitle}》
							</span>
						)}
					</div>
				</div>

				{/* Center: Diff vs Clean Mode Toggle & Follow Scroll Switch */}
				<div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
					{onChangeDiffViewMode && (
						<div className="flex items-center bg-surface-secondary/80 p-0.5 rounded-lg border border-border/80 text-xs">
							<button
								type="button"
								onClick={() => onChangeDiffViewMode("clean")}
								className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-md transition-colors cursor-pointer text-xs ${
									diffViewMode === "clean"
										? "bg-surface shadow-xs text-foreground font-medium"
										: "text-muted hover:text-foreground"
								}`}
								title="纯净并排视图，无高亮标记，支持打字编辑"
							>
								<Columns2 className="w-3.5 h-3.5" />
								<span className="hidden sm:inline">纯净并排</span>
							</button>
							<button
								type="button"
								onClick={() => onChangeDiffViewMode("diff")}
								className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-md transition-colors cursor-pointer text-xs ${
									diffViewMode === "diff"
										? "bg-accent text-accent-foreground font-medium shadow-xs"
										: "text-muted hover:text-foreground"
								}`}
								title="差异高亮视图，红删绿增实时比对"
							>
								<GitCompare className="w-3.5 h-3.5" />
								<span className="hidden sm:inline">差异高亮</span>
							</button>
						</div>
					)}

					{onToggleSyncScroll && (
						<button
							type="button"
							onClick={onToggleSyncScroll}
							className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-lg border transition-colors cursor-pointer text-xs ${
								isSyncScroll
									? "bg-accent/15 border-accent/40 text-accent font-medium shadow-xs"
									: "bg-surface-secondary/60 border-border/80 text-muted hover:text-foreground"
							}`}
							title={
								isStreaming
									? "AI 正在生成中，跟随滚动已暂时挂起（避免卡顿）"
									: isSyncScroll
										? "双栏跟随滚动已开启（点击切换为独立滚动）"
										: "独立滚动模式（点击开启双栏跟随滚动）"
							}
						>
							{isSyncScroll ? (
								<Link2 className="w-3.5 h-3.5 text-accent" />
							) : (
								<Link2Off className="w-3.5 h-3.5 opacity-60" />
							)}
							<span className="hidden lg:inline">跟随滚动</span>
						</button>
					)}
				</div>

				{/* Right: Actions (Desktop full buttons + Small screen More Menu dropdown) */}
				<div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
					{/* Desktop expanded auxiliary buttons (visible on xl and above) */}
					{onSaveVersionToDb && (
						<Button
							variant="ghost"
							size="sm"
							className="hidden xl:inline-flex h-7 text-xs text-muted hover:text-foreground cursor-pointer px-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
							onPress={onSaveVersionToDb}
							isDisabled={isSaveVersionDisabled}
							aria-label={
								!hasRightContent
									? "右侧无演练内容，无法保存版本"
									: "保存当前版本到数据库"
							}
						>
							{isSavingVersion ? (
								<BookmarkCheck className="w-3.5 h-3.5 mr-1 text-emerald-500 animate-pulse" />
							) : (
								<Save className="w-3.5 h-3.5 mr-1" />
							)}
							<span>保存版本</span>
						</Button>
					)}

					{onSaveAsNewDocument && (
						<Button
							variant="ghost"
							size="sm"
							className="hidden xl:inline-flex h-7 text-xs text-muted hover:text-foreground cursor-pointer px-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
							onPress={onSaveAsNewDocument}
							isDisabled={isSaveAsNewDisabled}
							aria-label={
								!hasRightContent
									? "右侧内容为空，无法另存为新文档"
									: "将右侧另存为新文档"
							}
						>
							<FilePlus className="w-3.5 h-3.5 mr-1" />
							<span>另存为新文档</span>
						</Button>
					)}

					<Button
						variant="ghost"
						size="sm"
						className="hidden xl:inline-flex h-7 text-xs text-muted hover:text-foreground cursor-pointer px-2.5"
						onPress={handleRequestExit}
						aria-label="退出创作模式并返回常规写作"
					>
						<X className="w-3.5 h-3.5 mr-1" />
						<span>退出创作</span>
					</Button>

					{/* Small/Medium screens: More Actions Dropdown Menu (visible below xl) */}
					<div className="xl:hidden">
						<Dropdown>
							<Dropdown.Trigger
								aria-label="更多操作"
								className="h-7 w-7 flex items-center justify-center rounded-lg text-muted hover:text-foreground hover:bg-surface-secondary/80 border border-border/80 transition-colors cursor-pointer shrink-0"
							>
								<Ellipsis className="w-4 h-4" />
							</Dropdown.Trigger>
							<Dropdown.Popover
								placement="bottom end"
								className="min-w-[170px] p-1 shadow-lg border border-border/80 rounded-xl bg-surface"
							>
								<Dropdown.Menu aria-label="创作台更多操作">
									{onSaveVersionToDb && (
										<Dropdown.Item
											id="save-version"
											textValue="保存版本"
											isDisabled={isSaveVersionDisabled}
											onAction={onSaveVersionToDb}
										>
											<div className="flex items-center gap-2 py-0.5">
												{isSavingVersion ? (
													<BookmarkCheck className="w-3.5 h-3.5 text-emerald-500 animate-pulse shrink-0" />
												) : (
													<Save className="w-3.5 h-3.5 text-muted shrink-0" />
												)}
												<span className="text-xs">保存当前版本</span>
											</div>
										</Dropdown.Item>
									)}

									{onSaveAsNewDocument && (
										<Dropdown.Item
											id="save-as-new"
											textValue="另存为新文档"
											isDisabled={isSaveAsNewDisabled}
											onAction={onSaveAsNewDocument}
										>
											<div className="flex items-center gap-2 py-0.5">
												<FilePlus className="w-3.5 h-3.5 text-muted shrink-0" />
												<span className="text-xs">另存为新文档</span>
											</div>
										</Dropdown.Item>
									)}

									{onToggleSyncScroll && (
										<Dropdown.Item
											id="toggle-sync-scroll"
											textValue="切换跟随滚动"
											onAction={onToggleSyncScroll}
										>
											<div className="flex items-center gap-2 py-0.5">
												{isSyncScroll ? (
													<Link2 className="w-3.5 h-3.5 text-accent shrink-0" />
												) : (
													<Link2Off className="w-3.5 h-3.5 text-muted shrink-0" />
												)}
												<span className="text-xs">
													{isSyncScroll ? "关闭跟随滚动" : "开启跟随滚动"}
												</span>
											</div>
										</Dropdown.Item>
									)}

									<Dropdown.Item
										id="exit-creation"
										textValue="退出创作"
										className="text-danger hover:!bg-danger/10 hover:!text-danger"
										onAction={handleRequestExit}
									>
										<div className="flex items-center gap-2 py-0.5">
											<X className="w-3.5 h-3.5 text-danger shrink-0" />
											<span className="text-xs">退出创作模式</span>
										</div>
									</Dropdown.Item>
								</Dropdown.Menu>
							</Dropdown.Popover>
						</Dropdown>
					</div>

					{/* Primary Call to Action: Accept Right Content */}
					<Button
						variant="primary"
						size="sm"
						className={`h-7 text-xs font-medium text-white shadow-xs px-2.5 sm:px-3.5 rounded-lg transition-all ${
							isAcceptDisabled
								? "bg-emerald-600/40 cursor-not-allowed opacity-50 shadow-none"
								: "bg-emerald-600 hover:bg-emerald-700 cursor-pointer active:scale-95"
						}`}
						onPress={() => setIsAcceptConfirmOpen(true)}
						isDisabled={isAcceptDisabled}
						aria-label={
							!hasRightContent
								? "右侧内容为空，无需采纳"
								: !canAccept
									? "右侧内容与正文一致，无需采纳"
									: "采纳右侧内容覆盖正文"
						}
					>
						<Check className="w-3.5 h-3.5 sm:mr-1 stroke-[2.5]" />
						<span className="hidden sm:inline">采纳右侧至正文</span>
						<span className="sm:hidden">采纳</span>
					</Button>
				</div>
			</header>

			{/* Secondary Confirmation Dialog: Exit Creation Mode */}
			<AlertDialog.Backdrop
				isOpen={isExitConfirmOpen}
				onOpenChange={setIsExitConfirmOpen}
				variant="blur"
			>
				<AlertDialog.Container placement="center">
					<AlertDialog.Dialog className="sm:max-w-[420px]">
						<AlertDialog.CloseTrigger />
						<AlertDialog.Header>
							<AlertDialog.Icon status="warning" />
							<AlertDialog.Heading>退出 AI 创作模式</AlertDialog.Heading>
						</AlertDialog.Header>
						<AlertDialog.Body>
							<p className="text-sm text-muted leading-relaxed">
								确定要退出创作模式并返回常规写作吗？未保存的演练草稿内容将会丢失。
							</p>
						</AlertDialog.Body>
						<AlertDialog.Footer>
							<Button
								slot="close"
								variant="tertiary"
								className="cursor-pointer text-xs h-8"
							>
								继续编辑
							</Button>
							<Button
								variant="danger"
								className="cursor-pointer text-xs h-8"
								onPress={() => {
									setIsExitConfirmOpen(false);
									onCancel();
								}}
							>
								确认退出
							</Button>
						</AlertDialog.Footer>
					</AlertDialog.Dialog>
				</AlertDialog.Container>
			</AlertDialog.Backdrop>

			{/* Secondary Confirmation Dialog: Accept Draft to Document */}
			<AlertDialog.Backdrop
				isOpen={isAcceptConfirmOpen}
				onOpenChange={setIsAcceptConfirmOpen}
				variant="blur"
			>
				<AlertDialog.Container placement="center">
					<AlertDialog.Dialog className="sm:max-w-[420px]">
						<AlertDialog.CloseTrigger />
						<AlertDialog.Header>
							<AlertDialog.Icon status="accent" />
							<AlertDialog.Heading>采纳演练草稿至正文</AlertDialog.Heading>
						</AlertDialog.Header>
						<AlertDialog.Body>
							<p className="text-sm text-muted leading-relaxed">
								确定要采纳右侧演练内容覆盖正文吗？采纳后双栏保持打开：右侧将固化为新版本并切换至左栏显示，右栏清空后可继续基于新版本叠加优化；正文当前状态将自动创建版本快照备份，以便随时回退。
							</p>
						</AlertDialog.Body>
						<AlertDialog.Footer>
							<Button
								slot="close"
								variant="tertiary"
								className="cursor-pointer text-xs h-8"
							>
								取消
							</Button>
							<Button
								variant="primary"
								className="cursor-pointer text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
								onPress={() => {
									setIsAcceptConfirmOpen(false);
									onAccept();
								}}
							>
								确认采纳
							</Button>
						</AlertDialog.Footer>
					</AlertDialog.Dialog>
				</AlertDialog.Container>
			</AlertDialog.Backdrop>
		</>
	);
}
