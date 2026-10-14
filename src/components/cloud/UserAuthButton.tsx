import {
	Avatar,
	Button,
	Chip,
	Dropdown,
	Label,
	Separator,
	toast,
} from "@heroui/react";
import {
	Chrome,
	Crown,
	Download,
	Laptop,
	LogIn,
	LogOut,
	Moon,
	RefreshCw,
	Settings,
	Sparkles,
	Sun,
	User,
} from "lucide-react";
import { useState } from "react";
import { useCloudAuth } from "../../lib/cloud/useCloudAuth";
import { isElectronApp } from "../../lib/platform";
import { checkForAppUpdate } from "../../lib/updater/checkForAppUpdate";
import { useThemeMode } from "../ThemeToggle";
import { CheckoutModal } from "./CheckoutModal";
import { LoginModal } from "./LoginModal";

const APP_VERSION = import.meta.env.VITE_APP_VERSION || "0.1.0";

export interface UserAuthButtonProps {
	onOpenExtension?: () => void;
	onOpenSettings?: () => void;
}

export function UserAuthButton({
	onOpenExtension,
	onOpenSettings,
}: UserAuthButtonProps) {
	const { user, isLoggedIn, isMember, logout } = useCloudAuth();
	const { mode: themeMode, toggleMode: toggleTheme } = useThemeMode();
	const [showLoginModal, setShowLoginModal] = useState(false);
	const [showCheckoutModal, setShowCheckoutModal] = useState(false);
	const [isDropdownOpen, setIsDropdownOpen] = useState(false);
	const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
	const isElectron = isElectronApp();

	const handleCheckUpdate = async () => {
		setIsCheckingUpdate(true);
		try {
			await checkForAppUpdate(APP_VERSION);
		} catch {
			toast.danger("检查更新失败，请稍后重试");
		} finally {
			setIsCheckingUpdate(false);
		}
	};

	// Format expiration date string
	const formatExpiresAt = (isoStr: string | null) => {
		if (!isoStr) return "永久有效";
		const d = new Date(isoStr);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
	};

	// Handle menu action dispatch
	const handleMenuAction = (key: string) => {
		switch (key) {
			case "extension":
				onOpenExtension?.();
				break;
			case "settings":
				onOpenSettings?.();
				break;
			case "check-update":
				void handleCheckUpdate();
				break;
			case "theme":
				toggleTheme();
				break;
			case "logout":
				logout();
				break;
		}
	};

	return (
		<>
			{!isLoggedIn ? (
				<Button
					size="sm"
					variant="secondary"
					className="h-8 rounded-full flex items-center gap-1.5 px-3 cursor-pointer text-xs font-medium border border-emerald-500/25 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 shadow-2xs transition"
					onPress={() => setShowLoginModal(true)}
				>
					<LogIn className="size-3.5" />
					<span>微信登录</span>
				</Button>
			) : (
				<Dropdown isOpen={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
					<Dropdown.Trigger className="h-8 pl-1.5 pr-2.5 rounded-full border border-border/80 bg-surface/80 hover:bg-surface flex items-center gap-1.5 text-xs cursor-pointer transition hover:shadow-xs focus:outline-none">
						<Avatar size="sm" className="size-5 shrink-0">
							{user?.avatarUrl ? (
								<Avatar.Image
									alt={user.nickname || "Avatar"}
									src={user.avatarUrl}
									className="size-5 object-cover"
								/>
							) : null}
							<Avatar.Fallback
								delayMs={600}
								className="size-5 text-[10px] bg-accent/10 text-accent flex items-center justify-center"
							>
								{user?.nickname ? (
									user.nickname.slice(0, 1).toUpperCase()
								) : (
									<User className="size-3" />
								)}
							</Avatar.Fallback>
						</Avatar>
						<span className="font-semibold text-foreground max-w-[80px] truncate">
							{user?.nickname}
						</span>
						{isMember ? (
							<Chip
								size="sm"
								variant="primary"
								className="text-[9px] h-4.5 px-1.5 font-bold bg-gradient-to-r from-amber-500 to-amber-600 text-white border-0 shadow-2xs"
							>
								<Crown className="w-2.5 h-2.5 mr-0.5 inline" />
								{user?.memberTier || "PRO"}
							</Chip>
						) : (
							<Chip
								size="sm"
								variant="secondary"
								className="text-[9px] h-4.5 px-1.5 text-muted bg-surface-secondary border-border/60"
							>
								免费版
							</Chip>
						)}
					</Dropdown.Trigger>

					<Dropdown.Popover
						placement="bottom end"
						className="w-64 p-0 rounded-2xl border border-border/80 bg-surface shadow-xl backdrop-blur-xl z-50"
					>
						{/* User Info Header */}
						<div className="px-3 pt-3 pb-2">
							<div className="flex items-center gap-2.5">
								<Avatar
									size="sm"
									className="size-9 shrink-0 ring-1 ring-border/80"
								>
									{user?.avatarUrl ? (
										<Avatar.Image
											alt={user.nickname || "Avatar"}
											src={user.avatarUrl}
											className="size-9 object-cover"
										/>
									) : null}
									<Avatar.Fallback
										delayMs={600}
										className="size-9 text-xs font-semibold bg-accent/10 text-accent flex items-center justify-center"
									>
										{user?.nickname ? (
											user.nickname.slice(0, 2).toUpperCase()
										) : (
											<User className="size-4" />
										)}
									</Avatar.Fallback>
								</Avatar>
								<div className="flex flex-col gap-0.5 min-w-0 flex-1">
									<div className="flex items-center gap-1.5">
										<p className="text-xs font-bold leading-5 text-foreground truncate">
											{user?.nickname}
										</p>
										{isMember && (
											<span className="text-[10px] text-amber-500 font-bold leading-none">
												{user?.memberTier || "PRO"}
											</span>
										)}
									</div>
									<p className="text-[10px] leading-tight text-muted truncate">
										{isMember
											? `有效至：${formatExpiresAt(user?.memberExpiresAt || null)}`
											: "尚未激活会员特权"}
									</p>
								</div>
							</div>

							{/* Pro Upgrade / Renew Button */}
							<div className="pt-2.5">
								<Button
									size="sm"
									variant="primary"
									className="w-full text-xs font-semibold flex items-center justify-center gap-1.5 rounded-lg py-2 cursor-pointer bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white shadow-xs hover:opacity-95 transition"
									onPress={() => {
										setIsDropdownOpen(false);
										setShowCheckoutModal(true);
									}}
								>
									<Sparkles className="size-3.5" />
									<span>{isMember ? "立即续费会员" : "开通 Pro 尊享特权"}</span>
								</Button>
							</div>
						</div>

						<Separator className="my-1" />

						{/* Action Menu */}
						<Dropdown.Menu
							aria-label="用户偏好与操作"
							onAction={(key) => handleMenuAction(String(key))}
						>
							{onOpenExtension && (
								<Dropdown.Item
									id="extension"
									textValue={isElectron ? "下载插件" : "打开插件"}
								>
									<div className="flex w-full items-center justify-between gap-2">
										<Label>{isElectron ? "下载插件" : "打开插件"}</Label>
										{isElectron ? (
											<Download className="size-3.5 text-muted" />
										) : (
											<Chrome className="size-3.5 text-muted" />
										)}
									</div>
								</Dropdown.Item>
							)}

							{onOpenSettings && (
								<Dropdown.Item id="settings" textValue="偏好设置">
									<div className="flex w-full items-center justify-between gap-2">
										<Label>偏好设置</Label>
										<Settings className="size-3.5 text-muted" />
									</div>
								</Dropdown.Item>
							)}

							<Dropdown.Item id="check-update" textValue="检查更新">
								<div className="flex w-full items-center justify-between gap-2">
									<Label>
										{isCheckingUpdate ? "正在检查更新…" : "检查更新"}
									</Label>
									<RefreshCw
										className={`size-3.5 text-muted ${isCheckingUpdate ? "animate-spin" : ""}`}
									/>
								</div>
							</Dropdown.Item>

							<Dropdown.Item id="theme" textValue="切换主题">
								<div className="flex w-full items-center justify-between gap-2">
									<Label>
										主题：
										{themeMode === "auto"
											? "跟随系统"
											: themeMode === "dark"
												? "暗色"
												: "亮色"}
									</Label>
									{themeMode === "auto" ? (
										<Laptop className="size-3.5 text-muted" />
									) : themeMode === "dark" ? (
										<Moon className="size-3.5 text-accent" />
									) : (
										<Sun className="size-3.5 text-amber-500" />
									)}
								</div>
							</Dropdown.Item>

							<Separator className="my-1" />

							<Dropdown.Item id="logout" textValue="退出登录" variant="danger">
								<div className="flex w-full items-center justify-between gap-2">
									<Label>退出登录</Label>
									<LogOut className="size-3.5 text-danger" />
								</div>
							</Dropdown.Item>
						</Dropdown.Menu>
					</Dropdown.Popover>
				</Dropdown>
			)}

			{/* Modals */}
			<LoginModal
				isOpen={showLoginModal}
				onClose={() => setShowLoginModal(false)}
			/>

			<CheckoutModal
				isOpen={showCheckoutModal}
				onClose={() => setShowCheckoutModal(false)}
			/>
		</>
	);
}
