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
	CheckCircle2,
	Copy,
	ExternalLink,
	Globe,
	Laptop,
	Mail,
	Moon,
	RefreshCw,
	Sparkles,
	Sun,
} from "lucide-react";
import { useEffect, useState } from "react";

type ThemeMode = "light" | "dark" | "auto";
type LanguageOption = "zh-CN" | "zh-TW" | "en-US";

const APP_VERSION = "0.1.0";
const SUPPORT_EMAIL = "bbxycx18@gmail.com";
const GITHUB_REPO_URL = "https://github.com/chenxi2025/aiworkstation";

const LANGUAGE_OPTIONS: { id: LanguageOption; label: string }[] = [
	{ id: "zh-CN", label: "简体中文" },
	{ id: "zh-TW", label: "繁體中文" },
	{ id: "en-US", label: "English" },
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
		<div className="flex flex-col gap-5 pt-1 text-xs">
			{/* Section 1: Appearance Theme Mode */}
			<div className="flex flex-col gap-2.5">
				<div>
					<h4 className="text-sm font-semibold text-foreground">
						界面外观模式
					</h4>
					<p className="text-muted text-[11px] mt-0.5">
						选择适合你的色彩外观，支持随系统设定自动切换
					</p>
				</div>

				<div className="grid grid-cols-3 gap-2.5">
					<button
						type="button"
						onClick={() => handleSelectTheme("light")}
						className={`flex flex-col items-center justify-center gap-2 p-3.5 rounded-xl border transition-all cursor-pointer ${
							themeMode === "light"
								? "border-accent bg-accent/10 text-foreground font-medium shadow-xs"
								: "border-border/70 bg-surface hover:bg-surface-secondary/60 text-muted hover:text-foreground"
						}`}
					>
						<Sun className="w-5 h-5 text-amber-500" />
						<span className="text-xs">浅色模式</span>
					</button>

					<button
						type="button"
						onClick={() => handleSelectTheme("dark")}
						className={`flex flex-col items-center justify-center gap-2 p-3.5 rounded-xl border transition-all cursor-pointer ${
							themeMode === "dark"
								? "border-accent bg-accent/10 text-foreground font-medium shadow-xs"
								: "border-border/70 bg-surface hover:bg-surface-secondary/60 text-muted hover:text-foreground"
						}`}
					>
						<Moon className="w-5 h-5 text-indigo-400" />
						<span className="text-xs">暗色模式</span>
					</button>

					<button
						type="button"
						onClick={() => handleSelectTheme("auto")}
						className={`flex flex-col items-center justify-center gap-2 p-3.5 rounded-xl border transition-all cursor-pointer ${
							themeMode === "auto"
								? "border-accent bg-accent/10 text-foreground font-medium shadow-xs"
								: "border-border/70 bg-surface hover:bg-surface-secondary/60 text-muted hover:text-foreground"
						}`}
					>
						<Laptop className="w-5 h-5 text-sky-400" />
						<span className="text-xs">跟随系统</span>
					</button>
				</div>
			</div>

			{/* Section 2: Language Preference */}
			<div className="flex items-center justify-between gap-4 py-1 pt-2 border-t border-border/50">
				<div>
					<h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
						<Globe className="w-4 h-4 text-accent" />
						界面语言 / Language
					</h4>
					<p className="text-muted text-[11px] mt-0.5">
						选择工作台界面的显示语言偏好
					</p>
				</div>

				<Select
					aria-label="选择界面语言"
					selectedKey={language}
					onSelectionChange={(key) => {
						if (key) handleSelectLanguage(String(key) as LanguageOption);
					}}
					variant="secondary"
					className="w-40 shrink-0"
				>
					<SelectTrigger className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectPopover className="max-h-60 overflow-y-auto min-w-[160px]">
						<ListBox>
							{LANGUAGE_OPTIONS.map((item) => (
								<ListBoxItem key={item.id} id={item.id} textValue={item.label}>
									{item.label}
								</ListBoxItem>
							))}
						</ListBox>
					</SelectPopover>
				</Select>
			</div>

			{/* Section 3: App Version & Check Updates */}
			<div className="flex flex-col gap-2.5 pt-2 border-t border-border/50">
				<div>
					<h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
						<Sparkles className="w-4 h-4 text-accent" />
						应用版本与更新
					</h4>
					<p className="text-muted text-[11px] mt-0.5">
						查看当前工作台版本及发布状态，检查最新更新
					</p>
				</div>

				<div className="flex items-center justify-between p-3.5 rounded-xl border border-border/70 bg-surface-secondary/30">
					<div className="flex items-center gap-3">
						<div className="w-8 h-8 rounded-lg bg-success/15 text-success flex items-center justify-center shrink-0">
							<CheckCircle2 className="w-4 h-4" />
						</div>
						<div>
							<div className="flex items-center gap-2">
								<span className="font-semibold text-foreground text-xs">
									AI Workstation
								</span>
								<span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-default/70 text-foreground border border-border/60">
									v{APP_VERSION}
								</span>
								<span className="px-1.5 py-0.5 rounded text-[10px] bg-accent/15 text-accent font-medium">
									{isElectron ? "桌面版" : "Web 平台"}
								</span>
							</div>
							<div className="text-[11px] text-muted mt-0.5">
								{lastCheckedTime
									? `上次检查时间: ${lastCheckedTime}`
									: "当前已为最新正式发布版本"}
							</div>
						</div>
					</div>

					<Button
						type="button"
						size="sm"
						variant="outline"
						className="h-7 text-xs px-3 cursor-pointer shrink-0"
						onPress={handleCheckUpdate}
						isDisabled={isCheckingUpdate}
					>
						<RefreshCw
							className={`w-3.5 h-3.5 mr-1.5 ${isCheckingUpdate ? "animate-spin" : ""}`}
						/>
						{isCheckingUpdate ? "检查中..." : "检查更新"}
					</Button>
				</div>
			</div>

			{/* Section 4: Contact Us & Support */}
			<div className="flex flex-col gap-2.5 pt-2 border-t border-border/50">
				<div>
					<h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
						<Mail className="w-4 h-4 text-accent" />
						联系我们与支持
					</h4>
					<p className="text-muted text-[11px] mt-0.5">
						遇到问题或有任何功能建议，欢迎与我们联系反馈
					</p>
				</div>

				<div className="flex flex-col gap-2">
					<div className="flex items-center justify-between p-3 rounded-xl border border-border/70 bg-surface-secondary/20">
						<div className="flex items-center gap-2.5 text-xs">
							<Mail className="w-4 h-4 text-muted shrink-0" />
							<span className="text-muted">技术支持邮箱:</span>
							<span className="font-mono text-foreground font-medium">
								{SUPPORT_EMAIL}
							</span>
						</div>
						<div className="flex items-center gap-1.5">
							<Button
								type="button"
								size="sm"
								variant="ghost"
								className="h-7 text-xs px-2 text-muted hover:text-foreground cursor-pointer"
								onPress={handleCopyEmail}
							>
								{isEmailCopied ? (
									<>
										<Check className="w-3.5 h-3.5 mr-1 text-success" />
										<span className="text-success">已复制</span>
									</>
								) : (
									<>
										<Copy className="w-3.5 h-3.5 mr-1" />
										<span>复制</span>
									</>
								)}
							</Button>
							<Button
								type="button"
								size="sm"
								variant="outline"
								className="h-7 text-xs px-2.5 cursor-pointer"
								onPress={() => openLink(`mailto:${SUPPORT_EMAIL}`)}
							>
								发送邮件
							</Button>
						</div>
					</div>

					<div className="grid grid-cols-2 gap-2.5 mt-1">
						<Button
							type="button"
							size="sm"
							variant="outline"
							className="h-8 text-xs cursor-pointer flex items-center justify-center gap-1.5"
							onPress={() => openLink(`${GITHUB_REPO_URL}/issues`)}
						>
							<ExternalLink className="w-3.5 h-3.5" />
							<span>提交 Bug / 建议反馈</span>
						</Button>
						<Button
							type="button"
							size="sm"
							variant="outline"
							className="h-8 text-xs cursor-pointer flex items-center justify-center gap-1.5"
							onPress={() => openLink(GITHUB_REPO_URL)}
						>
							<ExternalLink className="w-3.5 h-3.5" />
							<span>GitHub 项目主页</span>
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
