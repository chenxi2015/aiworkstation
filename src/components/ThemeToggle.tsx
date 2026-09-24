import { Laptop, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type ThemeMode = "light" | "dark" | "auto";

function getInitialMode(): ThemeMode {
	if (typeof window === "undefined") {
		return "auto";
	}

	const stored = window.localStorage.getItem("theme");
	if (stored === "light" || stored === "dark" || stored === "auto") {
		return stored;
	}

	return "auto";
}

function applyThemeMode(mode: ThemeMode) {
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

export default function ThemeToggle({
	compact = false,
}: {
	compact?: boolean;
}) {
	const [mode, setMode] = useState<ThemeMode>("auto");

	useEffect(() => {
		const initialMode = getInitialMode();
		setMode(initialMode);
		applyThemeMode(initialMode);
	}, []);

	useEffect(() => {
		if (mode !== "auto") {
			return;
		}

		const media = window.matchMedia("(prefers-color-scheme: dark)");
		const onChange = () => applyThemeMode("auto");

		media.addEventListener("change", onChange);
		return () => {
			media.removeEventListener("change", onChange);
		};
	}, [mode]);

	function toggleMode() {
		const nextMode: ThemeMode =
			mode === "light" ? "dark" : mode === "dark" ? "auto" : "light";
		setMode(nextMode);
		applyThemeMode(nextMode);
		window.localStorage.setItem("theme", nextMode);
	}

	const label =
		mode === "auto"
			? "当前主题：跟随系统（点击切换）"
			: mode === "dark"
				? "当前主题：暗色模式（点击切换）"
				: "当前主题：亮色模式（点击切换）";

	if (compact) {
		return (
			<button
				type="button"
				onClick={toggleMode}
				aria-label={label}
				title={label}
				className="h-8 w-8 rounded-lg flex items-center justify-center text-muted hover:text-foreground hover:bg-surface-secondary/80 transition-colors cursor-pointer"
			>
				{mode === "auto" ? (
					<Laptop className="w-4 h-4 opacity-75" />
				) : mode === "dark" ? (
					<Moon className="w-4 h-4 text-accent" />
				) : (
					<Sun className="w-4 h-4 text-amber-500" />
				)}
			</button>
		);
	}

	return (
		<button
			type="button"
			onClick={toggleMode}
			aria-label={label}
			title={label}
			className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-semibold text-foreground transition hover:bg-surface-hover hover:border-border-secondary cursor-pointer"
		>
			{mode === "auto" ? (
				<>
					<Laptop className="w-3.5 h-3.5 opacity-70" />
					<span>Auto</span>
				</>
			) : mode === "dark" ? (
				<>
					<Moon className="w-3.5 h-3.5 text-accent" />
					<span>Dark</span>
				</>
			) : (
				<>
					<Sun className="w-3.5 h-3.5 text-amber-500" />
					<span>Light</span>
				</>
			)}
		</button>
	);
}
