import { MeshGradient } from "@paper-design/shaders-react";
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

interface Position {
	x: number;
	y: number;
}

const STORAGE_KEY = "aiworkstation:floating_dock_offset";

/**
 * Lightweight drag hook: supports free movement with boundary clamping,
 * position persistence, and click vs drag discrimination.
 */
function useDraggableDock() {
	const [offset, setOffset] = useState<Position>(() => {
		try {
			const saved = localStorage.getItem(STORAGE_KEY);
			if (saved) {
				const parsed = JSON.parse(saved);
				if (typeof parsed.x === "number" && typeof parsed.y === "number") {
					return parsed;
				}
			}
		} catch {
			// Ignore localStorage parse errors
		}
		return { x: 0, y: 0 };
	});

	const [isDragging, setIsDragging] = useState(false);
	const dockRef = useRef<HTMLDivElement>(null);
	const suppressClickRef = useRef(false);

	const handlePointerDown = (e: React.PointerEvent) => {
		// Only primary mouse button or touch
		if (e.button !== 0) return;

		const startPointerX = e.clientX;
		const startPointerY = e.clientY;
		const startOffsetX = offset.x;
		const startOffsetY = offset.y;

		// Calculate fixed boundaries based on untransformed base rect
		let minX = -Infinity;
		let maxX = Infinity;
		let minY = -Infinity;
		let maxY = Infinity;

		if (dockRef.current) {
			const rect = dockRef.current.getBoundingClientRect();
			const baseLeft = rect.left - offset.x;
			const baseTop = rect.top - offset.y;
			const padding = 16;
			minX = padding - baseLeft;
			maxX = window.innerWidth - rect.width - padding - baseLeft;
			minY = padding - baseTop;
			maxY = window.innerHeight - rect.height - padding - baseTop;
		}

		let hasMoved = false;

		const handlePointerMove = (moveEvent: PointerEvent) => {
			const dx = moveEvent.clientX - startPointerX;
			const dy = moveEvent.clientY - startPointerY;

			if (!hasMoved && Math.hypot(dx, dy) > 4) {
				hasMoved = true;
				setIsDragging(true);
			}

			if (hasMoved) {
				const nextX = Math.min(Math.max(startOffsetX + dx, minX), maxX);
				const nextY = Math.min(Math.max(startOffsetY + dy, minY), maxY);
				setOffset({ x: nextX, y: nextY });
			}
		};

		const handlePointerUp = () => {
			window.removeEventListener("pointermove", handlePointerMove);
			window.removeEventListener("pointerup", handlePointerUp);

			if (hasMoved) {
				setIsDragging(false);
				suppressClickRef.current = true;
				setTimeout(() => {
					suppressClickRef.current = false;
				}, 60);

				setOffset((current) => {
					try {
						localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
					} catch {
						// Ignore storage errors
					}
					return current;
				});
			}
		};

		window.addEventListener("pointermove", handlePointerMove);
		window.addEventListener("pointerup", handlePointerUp);
	};

	const canTriggerClick = () => !suppressClickRef.current;

	return {
		dockRef,
		offset,
		isDragging,
		handlePointerDown,
		canTriggerClick,
	};
}

export function FloatingDockProvider({
	children,
	aiTrigger,
}: FloatingDockProviderProps) {
	const [actions, setActions] = useState<FloatingDockAction[]>([]);
	const { dockRef, offset, isDragging, handlePointerDown, canTriggerClick } =
		useDraggableDock();

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
				ref={dockRef}
				className={`pointer-events-none absolute right-5 z-40 flex flex-col items-center gap-3 select-none ${
					isDragging
						? "transition-none"
						: "transition-transform duration-150 ease-out"
				}`}
				style={{
					bottom: BOTTOM_OFFSET,
					transform: `translate3d(${offset.x}px, ${offset.y}px, 0)`,
				}}
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
				<AiOrbTrigger
					visible={aiTrigger.collapsed}
					onOpen={aiTrigger.onOpen}
					onPointerDown={handlePointerDown}
					canTriggerClick={canTriggerClick}
					isDragging={isDragging}
				/>
			</div>
		</FloatingDockContext.Provider>
	);
}

/** AI 助手触发球：玻璃质感 AI 水晶球 (Glassmorphic AI Orb) 风格；常驻挂载，随面板开合淡入淡出 */
function AiOrbTrigger({
	visible,
	onOpen,
	onPointerDown,
	canTriggerClick,
	isDragging,
}: {
	visible: boolean;
	onOpen: () => void;
	onPointerDown: (e: React.PointerEvent) => void;
	canTriggerClick: () => boolean;
	isDragging: boolean;
}) {
	const handleClick = () => {
		if (!canTriggerClick()) return;
		onOpen();
	};

	return (
		<div
			className={`relative transition-all duration-300 group ${
				visible
					? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
					: "opacity-0 scale-75 translate-y-2 pointer-events-none"
			}`}
		>
			{/* Ambient bloom aura behind the glass orb */}
			<div
				aria-hidden="true"
				className={`absolute -inset-1.5 rounded-full bg-gradient-to-tr from-cyan-400/40 via-sky-400/35 to-amber-300/30 blur-md transition-all duration-300 pointer-events-none ${
					isDragging
						? "opacity-100 blur-lg scale-110"
						: "opacity-75 group-hover:opacity-100 group-hover:blur-lg animate-ai-tab-breathe"
				}`}
			/>

			{/* Main glass orb container */}
			<button
				type="button"
				onClick={handleClick}
				onPointerDown={onPointerDown}
				title="拖动调整位置 / 点击展开 AI 助手"
				aria-label="展开 AI 助手"
				aria-hidden={!visible}
				tabIndex={visible ? 0 : -1}
				className={`relative w-12 h-12 rounded-full overflow-hidden flex items-center justify-center border border-white/60 dark:border-white/40 backdrop-blur-md shadow-[0_8px_24px_-4px_rgba(0,170,255,0.45),inset_0_2px_4px_0_rgba(255,255,255,0.8),inset_0_-2px_6px_0_rgba(0,0,0,0.35)] transition-all duration-300 select-none ${
					isDragging
						? "cursor-grabbing scale-105 shadow-[0_12px_32px_0_rgba(0,170,255,0.65)]"
						: "cursor-grab hover:scale-105 active:scale-95"
				}`}
			>
				{/* Deep translucent backing for refraction contrast */}
				<span
					aria-hidden="true"
					className="absolute inset-0 bg-slate-950/20 pointer-events-none"
				/>

				{/* Dynamic WebGL shader core - perfectly fills full orb */}
				<div className="absolute inset-0 w-full h-full pointer-events-none overflow-hidden rounded-full">
					<MeshGradient
						width="100%"
						height="100%"
						colors={["#bcecf6", "#00aaff", "#00f7ff", "#ffd447"]}
						distortion={0.8}
						swirl={0.35}
						grainMixer={0}
						grainOverlay={0}
						speed={1.12}
						className="w-full h-full object-cover"
					/>
				</div>

				{/* Spherical edge shadow (creates 3D ball curvature) */}
				<span
					aria-hidden="true"
					className="absolute inset-0 rounded-full pointer-events-none bg-[radial-gradient(circle_at_50%_50%,transparent_45%,rgba(15,23,42,0.35)_100%)]"
				/>

				{/* Primary specular highlight: realistic top-left glass glare spot */}
				<span
					aria-hidden="true"
					className="absolute inset-0 rounded-full pointer-events-none bg-[radial-gradient(circle_at_32%_24%,rgba(255,255,255,0.85)_0%,rgba(255,255,255,0.25)_26%,transparent_52%)]"
				/>

				{/* Secondary rim bounce light: soft bottom-right reflection */}
				<span
					aria-hidden="true"
					className="absolute inset-0 rounded-full pointer-events-none bg-[radial-gradient(circle_at_70%_78%,rgba(255,255,255,0.35)_0%,transparent_45%)]"
				/>

				{/* Inner crystalline rim highlight ring */}
				<span
					aria-hidden="true"
					className="absolute inset-0 rounded-full ring-1 ring-inset ring-white/35 pointer-events-none"
				/>

				{/* Floating center icon with crisp, centered drop shadow */}
				<span className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
					<Sparkles className="w-5 h-5 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.55)] group-hover:scale-110 group-hover:rotate-6 transition-transform duration-300" />
				</span>
			</button>
		</div>
	);
}
