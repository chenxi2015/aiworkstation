import { useEffect } from "react";

interface GlobalShortcutsOptions {
	onToggleSearch: () => void;
}

/**
 * Hook to register global keyboard shortcuts (e.g., Cmd+K / Ctrl+K for search)
 */
export function useGlobalShortcuts({ onToggleSearch }: GlobalShortcutsOptions) {
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
				e.preventDefault();
				onToggleSearch();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [onToggleSearch]);
}
