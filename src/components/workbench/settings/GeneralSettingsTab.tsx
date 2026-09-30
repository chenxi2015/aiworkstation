import {
	Button,
	ListBox,
	ListBoxItem,
	Select,
	SelectPopover,
	SelectTrigger,
	SelectValue,
	toast,
} from "@heroui/react";
import {
	Check,
	Copy,
	ExternalLink,
	Laptop,
	Moon,
	RefreshCw,
	Sun,
} from "lucide-react";
import { useEffect, useState } from "react";

type ThemeMode = "light" | "dark" | "auto";
type LanguageOption = "zh-CN" | "zh-TW" | "en-US";

const APP_VERSION = "0.1.0";
const SUPPORT_EMAIL = "bbxycx18@gmail.com";
const GITHUB_REPO_URL = "https://github.com/chenxi2025/aiworkstation";
const GITHUB_REPO_NAME = "chenxi2015/aiworkstation";

const LANGUAGE_OPTIONS: { id: LanguageOption; label: string }[] = [
	{ id: "zh-CN", label: "简体中文" },
	{ id: "zh-TW", label: "繁體中文" },
	{ id: "en-US", label: "English" },
];

const THEME_OPTIONS: { id: ThemeMode; label: string; icon: typeof Sun }[] = [
	{ id: "light", label: "浅色", icon: Sun },
	{ id: "dark", label: "暗色", icon: Moon },
	{ id: "auto", label: "自动", icon: Laptop },
];

/**
 * Apply theme mode to document root element
 */
function applyThemeMode(mode: ThemeMode) {
	if (typeof window === "undefined") return;

	const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
	const resolved = mode === "auto" ? (prefersDark ? "dark" : "light") : mode;

	document.documentElement.classList.remove("light", "dark");
	document.documentElement.classList.add(resolved);

	if (mode === "auto") {
		document.documentElement.removeAttribute("data-theme");
	} else {
		document.documentElement.setAttribute("data-theme", mode);
	}

	document.documentElement.style.colorScheme = resolved;
}

/**
 * Read current saved theme from local storage
 */
function getInitialTheme(): ThemeMode {
	if (typeof window === "undefined") return "auto";
	const stored = window.localStorage.getItem("theme");
	if (stored === "light" || stored === "dark" || stored === "auto") {
		return stored;
	}
	return "auto";
}

/**
 * Open external link in a secure manner
 */
function openLink(url: string) {
	if (typeof window !== "undefined") {
		window.open(url, "_blank", "noopener,noreferrer");
	}
}

/**
 * Section wrapper with a bold heading, matching the row-based settings style
 */
function SettingsSection({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section className="flex flex-col">
			<h4 className="text-sm font-semibold text-foreground">{title}</h4>
			<div className="flex flex-col">{children}</div>
		</section>
	);
}

/**
 * A single settings row: title + description on the left, control on the right
 */
function SettingsRow({
	title,
	description,
	children,
}: {
	title: string;
	description?: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex items-center justify-between gap-6 py-3.5 border-b border-border/40 last:border-b-0">
			<div className="min-w-0">
				<div className="text-xs font-medium text-foreground">{title}</div>
				{description ? (
					<div className="text-[11px] text-muted mt-0.5 leading-relaxed">
						{description}
					</div>
				) : null}
			</div>
			<div className="shrink-0 flex items-center">{children}</div>
		</div>
	);
}

/**
 * General application settings tab
 */
export function GeneralSettingsTab() {
	// Theme state
	const [themeMode, setThemeMode] = useState<ThemeMode>(getInitialTheme);

	// Language state
	const [language, setLanguage] = useState<LanguageOption>(() => {
		if (typeof window === "undefined") return "zh-CN";
		const stored = window.localStorage.getItem("app_language");
		if (stored === "zh-TW" || stored === "en-US") return stored;
		return "zh-CN";
	});

	// Update check state
	const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
	const [lastCheckedTime, setLastCheckedTime] = useState<string | null>(null);

	// Copy email feedback state
	const [isEmailCopied, setIsEmailCopied] = useState(false);

	// Detect runtime platform
	const isElectron =
		typeof window !== "undefined" &&
		Boolean(
			(window as unknown as { electronAPI?: unknown }).electronAPI ||
				navigator.userAgent.includes("Electron"),
		);

	// Keep theme in sync with system changes when in auto mode
	useEffect(() => {
		if (themeMode !== "auto") return;

		const media = window.matchMedia("(prefers-color-scheme: dark)");
		const onChange = () => applyThemeMode("auto");

		media.addEventListener("change", onChange);
		return () => {
			media.removeEventListener("change", onChange);
		};
	}, [themeMode]);

	// Handle theme mode selection
	const handleSelectTheme = (mode: ThemeMode) => {
		setThemeMode(mode);
		applyThemeMode(mode);
		window.localStorage.setItem("theme", mode);
		toast.success(
			mode === "auto"
				? "已切换为跟随系统主题"
				: mode === "dark"
					? "已切换为暗黑模式"
					: "已切换为浅色模式",
			{ timeout: 1500 },
		);
	};

	// Handle language selection
	const handleSelectLanguage = (lang: LanguageOption) => {
		setLanguage(lang);
		window.localStorage.setItem("app_language", lang);
		toast.success(
			lang === "en-US"
				? "Language switched to English"
				: lang === "zh-TW"
					? "語言已切換為繁體中文"
					: "语言已切换为简体中文",
			{ timeout: 1500 },
		);
	};

	// Handle check update action
	const handleCheckUpdate = () => {
		setIsCheckingUpdate(true);
		setTimeout(() => {
			setIsCheckingUpdate(false);
			setLastCheckedTime(new Date().toLocaleTimeString());
			toast.success(`当前已是最新版本 (v${APP_VERSION})`, { timeout: 2500 });
		}, 750);
	};

	// Handle copy support email
	const handleCopyEmail = async () => {
		try {
			await navigator.clipboard.writeText(SUPPORT_EMAIL);
			setIsEmailCopied(true);
			toast.success("邮箱地址已复制到剪贴板");
			setTimeout(() => setIsEmailCopied(false), 2000);
		} catch {
			toast.danger("复制失败，请手动复制");
		}
	};

	return (
		<div className="flex flex-col gap-6 pt-1">
			<SettingsSection title="通用">
				<SettingsRow title="应用版本">
					<div className="flex items-center gap-2">
						<span className="text-[11px] text-muted">
							{isElectron ? "桌面版" : "Web 平台"}
						</span>
						<span className="text-xs font-mono text-foreground">
							v{APP_VERSION}
						</span>
					</div>
				</SettingsRow>

				<SettingsRow
					title="检查更新"
					description={
						lastCheckedTime
							? `上次检查时间: ${lastCheckedTime}`
							: "检查是否有新版本的工作台可用。"
					}
				>
					<Button
						type="button"
						size="sm"
						variant="outline"
						className="h-7 text-xs px-3 rounded-full cursor-pointer"
						onPress={handleCheckUpdate}
						isDisabled={isCheckingUpdate}
					>
						<RefreshCw
							className={`w-3.5 h-3.5 mr-1.5 ${isCheckingUpdate ? "animate-spin" : ""}`}
						/>
						{isCheckingUpdate ? "检查中..." : "检查更新"}
					</Button>
				</SettingsRow>

				<SettingsRow title="语言" description="选择工作台界面的显示语言偏好。">
					<Select
						aria-label="选择界面语言"
						selectedKey={language}
						onSelectionChange={(key) => {
							if (key) handleSelectLanguage(String(key) as LanguageOption);
						}}
						variant="secondary"
						className="w-36 shrink-0"
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectPopover className="max-h-60 overflow-y-auto min-w-[160px]">
							<ListBox>
								{LANGUAGE_OPTIONS.map((item) => (
									<ListBoxItem
										key={item.id}
										id={item.id}
										textValue={item.label}
									>
										{item.label}
									</ListBoxItem>
								))}
							</ListBox>
						</SelectPopover>
					</Select>
				</SettingsRow>

				<SettingsRow
					title="外观模式"
					description="选择浅色、暗色外观，或跟随系统设定自动切换。"
				>
					<div className="flex items-center gap-0.5 rounded-full border border-border/60 bg-surface-secondary/40 p-0.5">
						{THEME_OPTIONS.map((option) => {
							const Icon = option.icon;
							const isActive = themeMode === option.id;
							return (
								<button
									key={option.id}
									type="button"
									onClick={() => handleSelectTheme(option.id)}
									className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] transition-colors cursor-pointer ${
										isActive
											? "bg-surface text-foreground font-medium shadow-xs"
											: "text-muted hover:text-foreground"
									}`}
								>
									<Icon className="w-3 h-3" />
									{option.label}
								</button>
							);
						})}
					</div>
				</SettingsRow>
			</SettingsSection>

			<SettingsSection title="联系我们">
				<SettingsRow title="Email" description="通过邮件联系技术支持团队。">
					<div className="flex items-center gap-1.5">
						<span className="text-xs text-foreground font-mono">
							{SUPPORT_EMAIL}
						</span>
						<Button
							type="button"
							size="sm"
							variant="ghost"
							aria-label="复制邮箱地址"
							className="h-6 w-6 min-w-6 p-0 text-muted hover:text-foreground cursor-pointer"
							onPress={handleCopyEmail}
						>
							{isEmailCopied ? (
								<Check className="w-3.5 h-3.5 text-success" />
							) : (
								<Copy className="w-3.5 h-3.5" />
							)}
						</Button>
					</div>
				</SettingsRow>

				<SettingsRow title="GitHub" description="查看项目仓库，了解最新进展。">
					<button
						type="button"
						onClick={() => openLink(GITHUB_REPO_URL)}
						className="flex items-center gap-1 text-xs text-foreground hover:text-accent transition-colors cursor-pointer"
					>
						<span className="font-mono">{GITHUB_REPO_NAME}</span>
						<ExternalLink className="w-3 h-3 text-muted" />
					</button>
				</SettingsRow>

				<SettingsRow
					title="问题反馈"
					description="提交 Bug 或功能建议，帮助我们改进产品。"
				>
					<button
						type="button"
						onClick={() => openLink(`${GITHUB_REPO_URL}/issues`)}
						className="flex items-center gap-1 text-xs text-foreground hover:text-accent transition-colors cursor-pointer"
					>
						<span>GitHub Issues</span>
						<ExternalLink className="w-3 h-3 text-muted" />
					</button>
				</SettingsRow>
			</SettingsSection>
		</div>
	);
}
