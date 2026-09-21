import {
	Button,
	Input,
	Label,
	Modal,
	Popover,
	TextField,
	toast,
} from "@heroui/react";
import {
	Check,
	ChevronsUpDown,
	Database,
	FolderOpen,
	FolderPlus,
	Loader2,
	TextCursorInput,
	X,
} from "lucide-react";
import { useState } from "react";
import { createLocalVaultRpc } from "../../services/api/obsidianClient";
import type { ObsidianVaultEntry, WorkbenchSettings } from "../workbench/types";
import { DirectoryPickerModal } from "./DirectoryPickerModal";
import type { ObsidianVaultInfo } from "./types";

/** 从路径推导仓库展示名（取最后一段目录名） */
function vaultNameOf(path: string): string {
	const trimmed = path.trim().replace(/[\\/]+$/, "");
	return trimmed.split(/[\\/]/).pop() || trimmed || "未命名仓库";
}

export interface VaultSwitcherProps {
	settings: WorkbenchSettings;
	/** 当前激活 Vault 的服务端扫描信息（可能不存在/未配置） */
	vault?: ObsidianVaultInfo;
	scannedAt?: number;
	/**
	 * 应用新的 Vault 设置（列表/激活项）。
	 * rescan=true 表示激活仓库已变化，父组件需清空选中并重扫目录树。
	 */
	onApply: (next: WorkbenchSettings, rescan: boolean) => void;
}

type PickerMode = "open" | "create-parent";

/**
 * Obsidian 式仓库切换栏（侧栏底部）：HeroUI Popover 弹出多仓库管理面板，
 * 支持切换、打开本地仓库、新建仓库、手动输入路径与从列表移除。
 * 激活路径仍写入 settings.obsidianVaultDir（服务端唯一事实源），列表存 obsidianVaults。
 */
export function VaultSwitcher({
	settings,
	vault,
	scannedAt,
	onApply,
}: VaultSwitcherProps) {
	const [open, setOpen] = useState(false);
	const [pickerMode, setPickerMode] = useState<PickerMode | null>(null);
	const [createOpen, setCreateOpen] = useState(false);
	const [createName, setCreateName] = useState("");
	const [createParent, setCreateParent] = useState("~/Documents");
	const [creating, setCreating] = useState(false);
	// 本地覆盖态：settings 来自路由 loader，保存后不会回流，操作期间以本地态为准
	const [active, setActive] = useState(() =>
		(settings.obsidianVaultDir ?? "").trim(),
	);
	const [vaults, setVaults] = useState<ObsidianVaultEntry[]>(() => {
		const list = [...(settings.obsidianVaults ?? [])];
		const activePath = (settings.obsidianVaultDir ?? "").trim();
		if (activePath && !list.some((v) => v.path === activePath)) {
			list.unshift({ name: vaultNameOf(activePath), path: activePath });
		}
		return list;
	});

	const apply = (
		nextVaults: ObsidianVaultEntry[],
		nextActive: string,
		rescan: boolean,
	) => {
		setVaults(nextVaults);
		setActive(nextActive);
		onApply(
			{
				...settings,
				obsidianVaults: nextVaults.length > 0 ? nextVaults : undefined,
				obsidianVaultDir: nextActive || undefined,
			},
			rescan,
		);
	};

	/** 登记（如未在列表）并切换到指定路径 */
	const registerAndSwitch = (path: string) => {
		const clean = path.trim();
		if (!clean) return;
		const next = vaults.some((v) => v.path === clean)
			? vaults
			: [...vaults, { name: vaultNameOf(clean), path: clean }];
		apply(next, clean, clean !== active);
		setOpen(false);
	};

	const handleSwitch = (path: string) => {
		if (path === active) {
			setOpen(false);
			return;
		}
		apply(vaults, path, true);
		setOpen(false);
	};

	const handleRemove = (path: string) => {
		if (path === active) {
			const ok = window.confirm(
				"移除的是当前激活仓库，将切换到列表中的下一个（不会删除磁盘文件）。继续？",
			);
			if (!ok) return;
		}
		const next = vaults.filter((v) => v.path !== path);
		if (path === active) {
			apply(next, next[0]?.path ?? "", true);
		} else {
			apply(next, active, false);
		}
	};

	const handleManualInput = () => {
		const input = window.prompt(
			"输入 Vault 目录路径（支持 ~ 开头）",
			active || "~/Documents/Obsidian",
		);
		if (input?.trim()) registerAndSwitch(input);
	};

	const handleCreate = async () => {
		const name = createName.trim();
		if (!name || creating) return;
		setCreating(true);
		const res = await createLocalVaultRpc(createParent, name);
		setCreating(false);
		if (!res.success || !res.path) {
			toast.danger(res.error ?? "新建仓库失败");
			return;
		}
		toast.success(`已创建仓库「${name}」`);
		setCreateOpen(false);
		setCreateName("");
		registerAndSwitch(res.path);
	};

	return (
		<div className="border-t border-border shrink-0">
			<Popover isOpen={open} onOpenChange={setOpen}>
				<Popover.Trigger className="w-full">
					<Button
						variant="ghost"
						fullWidth
						aria-label="切换仓库"
						className="justify-start gap-2 px-3 py-2.5 h-auto rounded-none hover:bg-surface-secondary/60"
					>
						<Database className="w-3.5 h-3.5 text-foreground/70 shrink-0" />
						<span className="flex-1 min-w-0 text-xs font-medium text-foreground truncate text-left">
							{active ? vaultNameOf(active) : "选择仓库"}
						</span>
						<ChevronsUpDown className="w-3.5 h-3.5 text-muted shrink-0" />
					</Button>
				</Popover.Trigger>
				<Popover.Content
					placement="top start"
					offset={6}
					className="w-72 rounded-xl border border-border/80 bg-surface shadow-xl overflow-hidden"
				>
					<Popover.Dialog aria-label="仓库管理" className="outline-none">
						<div className="px-3 pt-2.5 pb-1.5 flex items-baseline gap-2">
							<Popover.Heading className="text-[11px] font-semibold text-foreground">
								仓库
							</Popover.Heading>
							{vault?.exists && (
								<span className="text-[10px] text-muted truncate">
									{vault.noteCount} 篇笔记
									{scannedAt
										? ` · 扫描于 ${new Date(scannedAt).toLocaleTimeString()}`
										: ""}
								</span>
							)}
						</div>
						<div className="max-h-48 overflow-y-auto py-0.5">
							{vaults.length === 0 ? (
								<p className="px-3 py-3 text-[11px] text-muted text-center">
									还没有登记的仓库，从下方打开或新建
								</p>
							) : (
								vaults.map((entry) => (
									<div
										key={entry.path}
										className="group flex items-center hover:bg-surface-secondary/60"
									>
										<button
											type="button"
											onClick={() => handleSwitch(entry.path)}
											className="flex-1 flex items-center gap-2 px-3 py-1.5 text-left min-w-0"
										>
											<Database className="w-3.5 h-3.5 text-muted shrink-0" />
											<span className="min-w-0 flex-1">
												<span className="block text-xs font-medium text-foreground truncate">
													{entry.name}
												</span>
												<span className="block text-[10px] text-muted truncate font-mono">
													{entry.path}
												</span>
											</span>
											{entry.path === active && (
												<Check className="w-3.5 h-3.5 text-foreground shrink-0" />
											)}
										</button>
										<button
											type="button"
											title="从列表移除（不删除磁盘文件）"
											onClick={() => handleRemove(entry.path)}
											className="p-1.5 mr-1.5 rounded-md text-muted/60 opacity-0 group-hover:opacity-100 hover:text-danger hover:bg-danger/10 transition-all shrink-0"
										>
											<X className="w-3 h-3" />
										</button>
									</div>
								))
							)}
						</div>
						<div className="border-t border-border/60 py-1 flex flex-col gap-0.5 px-1">
							<Button
								variant="ghost"
								size="sm"
								fullWidth
								className="justify-start gap-2 h-7 text-xs font-normal"
								onPress={() => setPickerMode("open")}
							>
								<FolderOpen className="w-3.5 h-3.5 text-muted" />
								打开本地仓库…
							</Button>
							<Button
								variant="ghost"
								size="sm"
								fullWidth
								className="justify-start gap-2 h-7 text-xs font-normal"
								onPress={() => {
									setCreateOpen(true);
									setOpen(false);
								}}
							>
								<FolderPlus className="w-3.5 h-3.5 text-muted" />
								新建仓库…
							</Button>
							<Button
								variant="ghost"
								size="sm"
								fullWidth
								className="justify-start gap-2 h-7 text-xs font-normal"
								onPress={handleManualInput}
							>
								<TextCursorInput className="w-3.5 h-3.5 text-muted" />
								手动输入路径…
							</Button>
						</div>
					</Popover.Dialog>
				</Popover.Content>
			</Popover>

			<Modal.Backdrop
				isOpen={createOpen}
				onOpenChange={(next) => !next && setCreateOpen(false)}
				variant="blur"
			>
				<Modal.Container size="sm" className="w-full">
					<Modal.Dialog aria-label="新建仓库" className="w-full max-w-sm">
						<Modal.CloseTrigger />
						<Modal.Header>
							<Modal.Heading>新建仓库</Modal.Heading>
						</Modal.Header>
						<Modal.Body className="space-y-4">
							<TextField value={createName} onChange={setCreateName}>
								<Label>仓库名称</Label>
								<Input
									placeholder="例如：阅读笔记"
									variant="secondary"
									onKeyDown={(e) => {
										if (e.key === "Enter") void handleCreate();
									}}
								/>
							</TextField>
							<div>
								<Label className="block mb-1.5">位置</Label>
								<div className="flex items-center gap-2">
									<span
										className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-border bg-surface-secondary/40 text-[11px] font-mono text-foreground/80 truncate"
										title={createParent}
									>
										{createParent}
									</span>
									<Button
										variant="secondary"
										size="sm"
										className="shrink-0"
										onPress={() => setPickerMode("create-parent")}
									>
										浏览…
									</Button>
								</div>
								<p className="mt-1.5 text-[10px] text-muted">
									将在该目录下创建同名文件夹，并写入 .obsidian 标记使其被识别为
									Vault
								</p>
							</div>
						</Modal.Body>
						<Modal.Footer className="flex justify-end gap-2">
							<Button
								variant="secondary"
								size="sm"
								onPress={() => setCreateOpen(false)}
							>
								取消
							</Button>
							<Button
								variant="primary"
								size="sm"
								isDisabled={!createName.trim() || creating}
								onPress={() => void handleCreate()}
							>
								{creating && <Loader2 className="w-3 h-3 animate-spin" />}
								创建
							</Button>
						</Modal.Footer>
					</Modal.Dialog>
				</Modal.Container>
			</Modal.Backdrop>

			{pickerMode && (
				<DirectoryPickerModal
					title={
						pickerMode === "create-parent"
							? "选择新仓库的位置"
							: "选择 Obsidian Vault 目录"
					}
					initialPath={
						pickerMode === "create-parent"
							? createParent
							: active || settings.obsidianVaultDir
					}
					onSelect={(path) => {
						if (pickerMode === "create-parent") {
							setCreateParent(path);
						} else {
							registerAndSwitch(path);
						}
						setPickerMode(null);
					}}
					onClose={() => setPickerMode(null)}
				/>
			)}
		</div>
	);
}
