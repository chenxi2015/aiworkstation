import {
	Excalidraw,
	MainMenu,
	restore,
	serializeAsJSON,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import "./ExcalidrawView.css";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types";
import { AlertTriangle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

export interface ExcalidrawViewProps {
	/** .excalidraw file JSON text */
	content: string;
	/** Callback when the scene is edited (serialized Excalidraw JSON text) */
	onChange?: (json: string) => void;
	/** Disable all editing interactions (e.g. truncated oversized file) */
	readOnly?: boolean;
}

/** Serialize debounce: keeps drag-heavy onChange storms off the save path */
const SERIALIZE_DEBOUNCE = 250;

/**
 * appState keys safe to round-trip from a saved file (display prefs only).
 * excalidraw.com full exports dump the entire runtime appState, including
 * collaborators serialized as a plain object (upstream issue #8637 — restore()
 * does not coerce it back to a Map and InteractiveCanvas then crashes), plus
 * stale runtime refs (selectionElement, openDialog, ...). Only allowlist
 * display preferences; restore() fills sane defaults for everything else.
 */
const APP_STATE_ALLOWLIST = [
	"viewBackgroundColor",
	"gridSize",
	"gridStep",
	"gridModeEnabled",
	"theme",
	"zoom",
	"scrollX",
	"scrollY",
] as const;

type ThemeMode = "light" | "dark";

function getThemeMode(): ThemeMode {
	return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** Track the app's class-based dark mode (.dark on <html>) for Excalidraw theme */
function useThemeMode(): ThemeMode {
	const [mode, setMode] = useState<ThemeMode>(getThemeMode);

	useEffect(() => {
		const update = () => setMode(getThemeMode());
		const observer = new MutationObserver(update);
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class"],
		});
		return () => observer.disconnect();
	}, []);

	return mode;
}

interface PendingScene {
	elements: readonly OrderedExcalidrawElement[];
	appState: AppState;
	files: BinaryFiles;
}

/**
 * Visual .excalidraw editor wrapping the official @excalidraw/excalidraw package.
 * The scene JSON is parsed once per mount (parent remounts via key=relPath);
 * edits are debounce-serialized back as canonical Excalidraw JSON text.
 * Lazy-loaded by the caller to keep the heavy bundle out of the main chunk.
 */
export default function ExcalidrawView({
	content,
	onChange,
	readOnly = false,
}: ExcalidrawViewProps) {
	const theme = useThemeMode();

	// Parse + normalize once per mount; later content updates are our own echo.
	// appState goes through the allowlist above before restore() fills defaults.
	const [initialScene] = useState<{
		data: Record<string, unknown> | null;
		error: boolean;
	}>(() => {
		if (!content.trim()) {
			return { data: { scrollToContent: true }, error: false };
		}
		try {
			const raw = JSON.parse(content);
			const rawAppState = (raw?.appState ?? {}) as Record<string, unknown>;
			const safeAppState: Record<string, unknown> = {};
			for (const key of APP_STATE_ALLOWLIST) {
				if (rawAppState[key] !== undefined)
					safeAppState[key] = rawAppState[key];
			}
			const restored = restore(
				{
					elements: raw?.elements,
					appState: safeAppState,
					files: raw?.files,
				},
				null,
				null,
			);
			const hasSavedViewport =
				safeAppState.scrollX !== undefined || safeAppState.zoom !== undefined;
			return {
				data: {
					...restored,
					...(hasSavedViewport ? {} : { scrollToContent: true }),
				},
				error: false,
			};
		} catch {
			return { data: null, error: true };
		}
	});

	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;
	const lastEmittedRef = useRef(content);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pendingRef = useRef<PendingScene | null>(null);

	const flushPending = useCallback(() => {
		if (timerRef.current) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}
		const pending = pendingRef.current;
		if (!pending) return;
		pendingRef.current = null;
		const json = serializeAsJSON(
			pending.elements,
			pending.appState,
			pending.files,
			"local",
		);
		if (json === lastEmittedRef.current) return;
		lastEmittedRef.current = json;
		onChangeRef.current?.(json);
	}, []);

	const handleChange = useCallback(
		(
			elements: readonly OrderedExcalidrawElement[],
			appState: AppState,
			files: BinaryFiles,
		) => {
			if (readOnly) return;
			pendingRef.current = { elements, appState, files };
			if (timerRef.current) clearTimeout(timerRef.current);
			timerRef.current = setTimeout(flushPending, SERIALIZE_DEBOUNCE);
		},
		[readOnly, flushPending],
	);

	// Flush any pending scene on unmount so switching files never loses strokes
	useEffect(() => flushPending, [flushPending]);

	if (initialScene.error) {
		return (
			<div className="h-full flex flex-col items-center justify-center text-center px-8 gap-2">
				<AlertTriangle className="w-6 h-6 text-warning" />
				<p className="text-xs text-muted">
					Excalidraw 场景解析失败，可切换右上角「源码模式」手动修复 JSON
				</p>
			</div>
		);
	}

	return (
		// 主菜单宽度/快捷键换行修正见 ExcalidrawView.css
		<div className="excalidraw-host h-full w-full [&_.excalidraw]:h-full">
			<Excalidraw
				initialData={initialScene.data ?? undefined}
				onChange={handleChange}
				theme={theme}
				langCode="zh-CN"
				viewModeEnabled={readOnly}
				// "打开" 会用本地文件替换当前场景，自动保存会覆盖 vault 原文件，禁用
				UIOptions={{ canvasActions: { loadScene: false } }}
			>
				{/* 自定义主菜单：不含社交链接（GitHub / Follow us / Discord）与语言切换；
				    SearchMenu 的条目与对话框文案在上游硬编码为英文，不出现在菜单里 */}
				<MainMenu>
					<MainMenu.DefaultItems.SaveAsImage />
					<MainMenu.DefaultItems.Export />
					<MainMenu.DefaultItems.Help />
					<MainMenu.DefaultItems.ClearCanvas />
					<MainMenu.Separator />
					<MainMenu.DefaultItems.ChangeCanvasBackground />
				</MainMenu>
			</Excalidraw>
		</div>
	);
}
