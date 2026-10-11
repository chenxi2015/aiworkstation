import { type NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { Music } from "lucide-react";

/**
 * 轻量音频 NodeView：图标 + 标题 + 原生播放器。
 * 与 MediaNodeView（图片/视频）分离——音频无对齐/替换/下载等重交互，保持简单。
 */
export function AudioNodeView({ node, selected }: NodeViewProps) {
	const src = (node.attrs.src as string) || "";
	const title = (node.attrs.title as string) || "";

	return (
		<NodeViewWrapper
			as="div"
			className={`media-node-view not-prose my-3 w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 select-none outline-none transition-colors ${
				selected
					? "border-accent/60 bg-accent/5"
					: "border-border bg-muted/5 hover:bg-muted/10"
			}`}
		>
			<div className="shrink-0 w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center">
				<Music className="w-4 h-4" />
			</div>
			<div className="flex-1 min-w-0 flex flex-col gap-1">
				{title && (
					<div className="text-xs text-foreground/80 truncate">{title}</div>
				)}
				{src ? (
					<audio
						controls
						preload="metadata"
						src={src}
						className="w-full h-8"
						contentEditable={false}
					>
						<track kind="captions" />
					</audio>
				) : (
					<span className="text-[11px] text-muted">音频地址缺失</span>
				)}
			</div>
		</NodeViewWrapper>
	);
}
