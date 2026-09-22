import { Warp } from "@paper-design/shaders-react";
import { Sparkles } from "lucide-react";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

/**
 * 右下角浮动坞：页面级动作（如「返回顶部」）注册到这里，
 * 与全局 AI 助手按钮在同一列垂直堆叠，避免散落在页面不同位置。
 */
export interface FloatingDockAction {
	/** 稳定 id，用于注册/注销与增量更新 */
	id: string;
	/** 无障碍标签与 hover 提示 */
	label: string;
	icon: ReactNode;
	/** 是否可见（保留挂载以播放淡入淡出过渡） */
	visible: boolean;
	onTrigger: () => void;
}

interface FloatingDockApi {
	registerAction: (action: FloatingDockAction) => void;
	updateAction: (
		id: string,
		patch: Partial<Pick<FloatingDockAction, "label" | "visible">>,
	) => void;
	unregisterAction: (id: string) => void;
}

const FloatingDockContext = createContext<FloatingDockApi | null>(null);

const NOOP_DOCK_API: FloatingDockApi = {
	registerAction: () => {},
	updateAction: () => {},
	unregisterAction: () => {},
};

/** 全局统一的贴底距离：抬高避开创作页等底部常驻操作栏 */
const BOTTOM_OFFSET = 64;

/**
 * 页面内注册一个右下角浮动动作，随组件卸载自动移除；
 * onTrigger 通过 ref 转发，保证回调永远是最新的而不触发重复注册。
 */
export function useFloatingDockAction(action: FloatingDockAction): void {
	const dock = useContext(FloatingDockContext) ?? NOOP_DOCK_API;
	const { id, label, icon, visible, onTrigger } = action;

	const onTriggerRef = useRef(onTrigger);
	onTriggerRef.current = onTrigger;

	// biome-ignore lint/correctness/useExhaustiveDependencies: 仅挂载/卸载时注册，可见性与文案变化走 updateAction 增量更新
	useEffect(() => {
		dock.registerAction({
			id,
			label,
			icon,
			visible,
			onTrigger: () => onTriggerRef.current(),
		});
		return () => dock.unregisterAction(id);
	}, [dock, id]);

	useEffect(() => {
		dock.updateAction(id, { label, visible });
	}, [dock, id, label, visible]);
}

interface FloatingDockProviderProps {
	children: ReactNode;
	/** 全局 AI 面板折叠时展示 MeshGradient 触发球 */
	aiTrigger: { collapsed: boolean; onOpen: () => void };
}

export function FloatingDockProvider({
	children,
	aiTrigger,
}: FloatingDockProviderProps) {
	const [actions, setActions] = useState<FloatingDockAction[]>([]);

	const api = useMemo<FloatingDockApi>(
		() => ({
			registerAction: (action) => {
				setActions((prev) =>
					prev.some((a) => a.id === action.id) ? prev : [...prev, action],
				);
			},
			updateAction: (id, patch) => {
				setActions((prev) => {
					const index = prev.findIndex((a) => a.id === id);
					if (index === -1) return prev;
					const current = prev[index];
					if (
						current.visible === patch.visible &&
						current.label === patch.label
					) {
						return prev;
					}
					const next = [...prev];
					next[index] = { ...current, ...patch };
					return next;
				});
			},
			unregisterAction: (id) => {
				setActions((prev) => prev.filter((a) => a.id !== id));
			},
		}),
		[],
	);

	return (
		<FloatingDockContext.Provider value={api}>
			{children}
			<div
				className="pointer-events-none absolute right-5 z-40 flex flex-col items-center gap-3"
				style={{ bottom: BOTTOM_OFFSET }}
			>
				{actions.map((action) => (
					<button
						key={action.id}
						type="button"
						onClick={action.onTrigger}
						aria-label={action.label}
						title={action.label}
						className={`flex items-center justify-center w-9 h-9 rounded-full bg-surface/80 dark:bg-zinc-800/80 backdrop-blur-md border border-border shadow-md hover:shadow-lg text-muted hover:text-foreground transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer ${
							action.visible
								? "opacity-100 translate-y-0 pointer-events-auto"
								: "opacity-0 translate-y-2 pointer-events-none"
						}`}
					>
						{action.icon}
					</button>
				))}
				<AiOrbTrigger visible={aiTrigger.collapsed} onOpen={aiTrigger.onOpen} />
			</div>
		</FloatingDockContext.Provider>
	);
}

/** AI 助手触发球：Warp 动态渐变 + 呼吸光晕；常驻挂载，随面板开合淡入淡出 */
function AiOrbTrigger({
	visible,
	onOpen,
}: {
	visible: boolean;
	onOpen: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onOpen}
			title="展开 AI 助手"
			aria-label="展开 AI 助手"
			aria-hidden={!visible}
			tabIndex={visible ? 0 : -1}
			className={`relative w-11 h-11 rounded-full overflow-hidden cursor-pointer group transition-all duration-300 hover:scale-105 active:scale-95 animate-ai-tab-breathe ${
				visible
					? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
					: "opacity-0 scale-75 translate-y-2 pointer-events-none"
			}`}
		>
			<Warp
				width="50px"
				height="50px"
				colors={["#a855f7", "#ec4899", "#6366f1", "#f472b6"]}
				proportion={0.45}
				softness={1}
				distortion={0.25}
				swirl={0.8}
				swirlIterations={10}
				shape="checks"
				shapeScale={0.1}
				speed={1}
				className="absolute inset-0 pointer-events-none"
			/>
			<span className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
				<Sparkles className="w-4.5 h-4.5 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)] group-hover:scale-110 transition-transform" />
			</span>
		</button>
	);
}
