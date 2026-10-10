import "./ExcalidrawView.css";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type {
	AppState,
	BinaryFiles,
	ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import { AlertTriangle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ObsidianExcalidrawApi } from "../types";
import { buildExcalidrawElements } from "./utils/excalidrawLayout";

export interface ExcalidrawViewProps {
	/** .excalidraw file JSON text */
	content: string;
	/** Callback when the scene is edited (serialized Excalidraw JSON text) */
	onChange?: (json: string) => void;
	/** Disable all editing interactions (e.g. truncated oversized file) */
	readOnly?: boolean;
	/** Expose Excalidraw API for AI assistants or external tools */
	onRegisterExcalidrawApi?: (api: ObsidianExcalidrawApi | null) => void;
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
type ExcalidrawModule = typeof import("@excalidraw/excalidraw");

function getThemeMode(): ThemeMode {
	if (typeof document === "undefined") return "light";
	return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** Track the app's class-based dark mode (.dark on <html>) for Excalidraw theme */
function useThemeMode(): ThemeMode {
	const [mode, setMode] = useState<ThemeMode>(getThemeMode);

	useEffect(() => {
		if (typeof document === "undefined") return;
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
 * Dynamically loads @excalidraw/excalidraw in the browser to avoid SSR evaluation crashes.
 */
export default function ExcalidrawView({
	content,
	onChange,
	readOnly = false,
	onRegisterExcalidrawApi,
}: ExcalidrawViewProps) {
	const theme = useThemeMode();
	const [mod, setMod] = useState<ExcalidrawModule | null>(null);
	const [excalidrawApi, setExcalidrawApi] =
		useState<ExcalidrawImperativeAPI | null>(null);

	// Load heavy Excalidraw assets strictly on client mount
	useEffect(() => {
		let mounted = true;
		Promise.all([
			import("@excalidraw/excalidraw"),
			import("@excalidraw/excalidraw/index.css"),
		]).then(([excalidrawModule]) => {
			if (mounted) {
				setMod(excalidrawModule);
			}
		});
		return () => {
			mounted = false;
		};
	}, []);

	// Parse + normalize once per mount when library is loaded
	const [scene, setScene] = useState<{
		data: Record<string, unknown> | null;
		error: boolean;
	} | null>(null);

	useEffect(() => {
		if (!mod || scene !== null) return;
		if (!content.trim()) {
			setScene({ data: { scrollToContent: true }, error: false });
			return;
		}
		try {
			const raw = JSON.parse(content);
			const rawAppState = (raw?.appState ?? {}) as Record<string, unknown>;
			const safeAppState: Record<string, unknown> = {};
			for (const key of APP_STATE_ALLOWLIST) {
				if (rawAppState[key] !== undefined)
					safeAppState[key] = rawAppState[key];
			}
			const restored = mod.restore(
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
			setScene({
				data: {
					...restored,
					...(hasSavedViewport ? {} : { scrollToContent: true }),
				},
				error: false,
			});
		} catch {
			setScene({ data: null, error: true });
		}
	}, [mod, content, scene]);

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
		if (!pending || !mod) return;
		pendingRef.current = null;
		const json = mod.serializeAsJSON(
			pending.elements,
			pending.appState,
			pending.files,
			"local",
		);
		if (json === lastEmittedRef.current) return;
		lastEmittedRef.current = json;
		onChangeRef.current?.(json);
	}, [mod]);

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

	// Register Excalidraw API handle for AI sidebar bridge
	useEffect(() => {
		if (!onRegisterExcalidrawApi || !excalidrawApi) return;

		onRegisterExcalidrawApi({
			drawElements: (params) => {
				try {
					const currentElements = excalidrawApi.getSceneElements() || [];
					const nextElements = buildExcalidrawElements(
						params,
						currentElements,
						mod?.convertToExcalidrawElements,
					);
					excalidrawApi.updateScene({
						elements: nextElements,
					});
					setTimeout(() => {
						try {
							excalidrawApi.scrollToContent(undefined, {
								fitToViewport: true,
								animate: true,
							});
						} catch {}
					}, 100);
					return true;
				} catch (err) {
					console.error("[ExcalidrawApi.drawElements] error:", err);
					return false;
				}
			},
			updateElement: (id, updates) => {
				try {
					const currentElements = excalidrawApi.getSceneElements() || [];
					let found = false;
					const nextElements = currentElements.map((el) => {
						if (el.id === id) {
							found = true;
							return {
								...el,
								...(updates.label ? { text: updates.label } : {}),
							};
						}
						return el;
					});
					if (!found) return false;
					excalidrawApi.updateScene({
						elements: nextElements,
					});
					return true;
				} catch (err) {
					console.error("[ExcalidrawApi.updateElement] error:", err);
					return false;
				}
			},
			clearCanvas: () => {
				try {
					excalidrawApi.updateScene({
						elements: [],
					});
					return true;
				} catch (err) {
					console.error("[ExcalidrawApi.clearCanvas] error:", err);
					return false;
				}
			},
			centerView: (elementIds) => {
				try {
					const currentElements = excalidrawApi.getSceneElements() || [];
					const targets =
						elementIds && elementIds.length > 0
							? currentElements.filter((el) => elementIds.includes(el.id))
							: undefined;
					excalidrawApi.scrollToContent(targets, {
						fitToViewport: true,
						animate: true,
					});
					return true;
				} catch (err) {
					console.error("[ExcalidrawApi.centerView] error:", err);
					return false;
				}
			},
		});

		return () => onRegisterExcalidrawApi(null);
	}, [onRegisterExcalidrawApi, excalidrawApi, mod]);

	if (!mod || !scene) {
		return (
			<div className="h-full w-full flex items-center justify-center bg-background text-muted text-xs">
				加载绘图组件...
			</div>
		);
	}

	if (scene.error) {
		return (
			<div className="h-full flex flex-col items-center justify-center text-center px-8 gap-2">
				<AlertTriangle className="w-6 h-6 text-warning" />
				<p className="text-xs text-muted">
					Excalidraw 场景解析失败，可切换右上角「源码模式」手动修复 JSON
				</p>
			</div>
		);
	}

	const { Excalidraw, MainMenu } = mod;

	return (
		// 主菜单宽度/快捷键换行修正见 ExcalidrawView.css
		<div className="excalidraw-host h-full w-full [&_.excalidraw]:h-full">
			<Excalidraw
				excalidrawAPI={setExcalidrawApi}
				initialData={scene.data ?? undefined}
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
