import type { EditorView } from "@codemirror/view";
import { WidgetType } from "@codemirror/view";
import { toast } from "@heroui/react";
import { Code2, Copy } from "lucide-react";
import { useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MermaidPreview } from "../../editor/extensions/codeBlock/MermaidPreview";

/**
 * Mermaid 代码块 widget：```mermaid fence 在光标离开时整体渲染为交互式图表。
 * 预览复用创作模块的 MermaidPreview（滚轮缩放 / 拖拽平移 / 全屏模态 / 下载 SVG），
 * 在其上叠加 Obsidian 侧的工具条：查看代码 / 复制源码。
 */

interface MermaidHostProps {
	code: string;
	onSwitchToCode: () => void;
}

function MermaidHost({ code, onSwitchToCode }: MermaidHostProps) {
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [showCode, setShowCode] = useState(false);

	const copySource = async () => {
		try {
			await navigator.clipboard.writeText(code);
			toast.success("已复制 Mermaid 源码");
		} catch {
			toast.danger("复制失败");
		}
	};

	return (
		<div>
			{/* 右上角悬停工具条（复用媒体工具条样式，父级 .cm-live-mermaid hover 时浮现） */}
			<span className="cm-live-media-toolbar">
				<button
					type="button"
					className="cm-live-media-btn"
					title={showCode ? "收起代码" : "查看代码"}
					onClick={(e) => {
						e.preventDefault();
						e.stopPropagation();
						setShowCode((v) => !v);
					}}
				>
					<Code2 style={{ width: 14, height: 14 }} />
				</button>
				<button
					type="button"
					className="cm-live-media-btn"
					title="复制源码"
					onClick={(e) => {
						e.preventDefault();
						e.stopPropagation();
						void copySource();
					}}
				>
					<Copy style={{ width: 14, height: 14 }} />
				</button>
			</span>
			<MermaidPreview
				code={code}
				isFullscreen={isFullscreen}
				onOpenFullscreen={() => setIsFullscreen(true)}
				onCloseFullscreen={() => setIsFullscreen(false)}
				onSwitchToCode={onSwitchToCode}
			/>
			{showCode && <pre className="cm-live-mermaid-code">{code}</pre>}
		</div>
	);
}

export class MermaidWidget extends WidgetType {
	private root: Root | null = null;

	constructor(readonly code: string) {
		super();
	}
	override eq(other: MermaidWidget) {
		return other.code === this.code;
	}
	toDOM(view: EditorView) {
		const container = document.createElement("div");
		container.className = "cm-live-mermaid";
		this.root = createRoot(container);
		this.root.render(
			<MermaidHost
				code={this.code}
				onSwitchToCode={() => {
					// 光标移入 fence 内 → 装饰重建还原源码（位置经 posAtDOM 实时换算，不怕漂移）
					const pos = view.posAtDOM(container);
					view.dispatch({ selection: { anchor: pos } });
					view.focus();
				}}
			/>,
		);
		return container;
	}
	override destroy() {
		// CM 更新周期内同步 unmount 会触发 React 告警，延后到微任务
		const root = this.root;
		this.root = null;
		if (root) setTimeout(() => root.unmount(), 0);
	}
	override ignoreEvent() {
		// 滚轮缩放 / 拖拽平移事件全部交给视口，不触发 CM 选区变化
		return true;
	}
}
