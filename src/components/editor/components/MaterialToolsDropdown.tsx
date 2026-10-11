import { Modal } from "@heroui/react";
import {
	ArrowDown,
	ArrowUp,
	ChevronDown,
	Library,
	Settings2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useEditorToolbarLayout } from "../hooks/useEditorToolbarLayout";
import {
	getMaterialToolById,
	MATERIAL_TOOLS,
	type MaterialToolDef,
	type MaterialToolKind,
} from "../toolbar/materialTools";

export interface MaterialToolsDropdownProps {
	/** 打开素材选择器（预选类型） */
	onOpenMaterialPicker: (kind: MaterialToolKind) => void;
	disabled?: boolean;
}

/**
 * 工具栏「素材库」下拉：按注册表+用户布局渲染素材工具入口，
 * 底部「自定义素材工具…」可调整各入口的显隐与顺序（settings.editorToolbarLayout）。
 */
export function MaterialToolsDropdown({
	onOpenMaterialPicker,
	disabled,
}: MaterialToolsDropdownProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [customizeOpen, setCustomizeOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);
	const { materialTools, layout, saveLayout, resetLayout } =
		useEditorToolbarLayout();

	useEffect(() => {
		if (!isOpen) return;
		const handlePointerDown = (e: PointerEvent) => {
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(e.target as Node)
			) {
				setIsOpen(false);
			}
		};
		window.addEventListener("pointerdown", handlePointerDown);
		return () => window.removeEventListener("pointerdown", handlePointerDown);
	}, [isOpen]);

	// 自定义面板用的完整顺序（含隐藏项）：布局顺序优先，未配置的追加在后
	const orderedAll = useMemo<MaterialToolDef[]>(() => {
		if (!layout || layout.length === 0) return [...MATERIAL_TOOLS];
		const seen = new Set<string>();
		const out: MaterialToolDef[] = [];
		for (const entry of layout) {
			const tool = getMaterialToolById(entry.id);
			if (tool && !seen.has(tool.id)) {
				out.push(tool);
				seen.add(tool.id);
			}
		}
		for (const tool of MATERIAL_TOOLS) {
			if (!seen.has(tool.id)) out.push(tool);
		}
		return out;
	}, [layout]);

	const visibleIds = useMemo(() => {
		if (!layout || layout.length === 0) {
			return new Set(MATERIAL_TOOLS.map((t) => t.id));
		}
		return new Set(layout.filter((e) => e.visible).map((e) => e.id));
	}, [layout]);

	const persistOrder = (tools: MaterialToolDef[], visible: Set<string>) => {
		saveLayout(tools.map((t) => ({ id: t.id, visible: visible.has(t.id) })));
	};

	const toggleVisible = (id: string) => {
		const next = new Set(visibleIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		persistOrder(orderedAll, next);
	};

	const move = (index: number, delta: -1 | 1) => {
		const target = index + delta;
		if (target < 0 || target >= orderedAll.length) return;
		const next = [...orderedAll];
		[next[index], next[target]] = [next[target], next[index]];
		persistOrder(next, visibleIds);
	};

	return (
		<div className="relative inline-block" ref={dropdownRef}>
			<button
				type="button"
				disabled={disabled}
				onClick={() => setIsOpen((prev) => !prev)}
				title="从素材库插入图片/视频/音频"
				className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
					isOpen
						? "bg-accent/15 text-accent font-medium"
						: "text-muted hover:text-foreground hover:bg-muted/10"
				}`}
			>
				<Library className="w-3.5 h-3.5" />
				素材库
				<ChevronDown
					className={`w-3 h-3 transition-transform ${isOpen ? "rotate-180" : ""}`}
				/>
			</button>

			{isOpen && (
				<div className="absolute top-full left-0 mt-1 z-50 min-w-40 rounded-lg border border-border bg-surface shadow-lg py-1">
					{materialTools.map((tool) => (
						<button
							key={tool.id}
							type="button"
							onClick={() => {
								setIsOpen(false);
								onOpenMaterialPicker(tool.kind);
							}}
							className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground/85 hover:bg-muted/10 transition-colors cursor-pointer"
						>
							<tool.icon className="w-3.5 h-3.5 text-muted" />
							{tool.label}
						</button>
					))}
					<div className="my-1 h-px bg-border/60" />
					<button
						type="button"
						onClick={() => {
							setIsOpen(false);
							setCustomizeOpen(true);
						}}
						className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-muted hover:text-foreground hover:bg-muted/10 transition-colors cursor-pointer"
					>
						<Settings2 className="w-3.5 h-3.5" />
						自定义素材工具…
					</button>
				</div>
			)}

			<Modal.Backdrop
				isOpen={customizeOpen}
				onOpenChange={(open) => !open && setCustomizeOpen(false)}
				variant="blur"
			>
				<Modal.Container size="sm" className="w-full">
					<Modal.Dialog
						aria-label="自定义素材工具"
						className="!max-w-sm w-full"
					>
						<Modal.CloseTrigger />
						<Modal.Header>
							<Modal.Heading>自定义素材工具</Modal.Heading>
						</Modal.Header>
						<Modal.Body className="flex flex-col gap-1 mt-2">
							<p className="text-[10px] text-muted mb-1">
								勾选要在「素材库」下拉中显示的工具，用箭头调整顺序。
							</p>
							{orderedAll.map((tool, index) => (
								<div
									key={tool.id}
									className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/10"
								>
									<input
										type="checkbox"
										checked={visibleIds.has(tool.id)}
										onChange={() => toggleVisible(tool.id)}
										className="accent-accent cursor-pointer"
									/>
									<tool.icon className="w-3.5 h-3.5 text-muted shrink-0" />
									<span className="flex-1 text-xs text-foreground/85">
										{tool.label}
									</span>
									<button
										type="button"
										disabled={index === 0}
										onClick={() => move(index, -1)}
										className="p-1 rounded text-muted hover:text-foreground disabled:opacity-30 cursor-pointer"
									>
										<ArrowUp className="w-3 h-3" />
									</button>
									<button
										type="button"
										disabled={index === orderedAll.length - 1}
										onClick={() => move(index, 1)}
										className="p-1 rounded text-muted hover:text-foreground disabled:opacity-30 cursor-pointer"
									>
										<ArrowDown className="w-3 h-3" />
									</button>
								</div>
							))}
							<button
								type="button"
								onClick={resetLayout}
								className="mt-2 self-start px-2 py-1 text-[11px] text-muted hover:text-foreground hover:bg-muted/10 rounded-md transition-colors cursor-pointer"
							>
								恢复默认
							</button>
						</Modal.Body>
					</Modal.Dialog>
				</Modal.Container>
			</Modal.Backdrop>
		</div>
	);
}
