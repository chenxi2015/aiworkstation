import { memo, useEffect, useMemo, useState } from "react";
import {
	fetchVaultNote,
	getCachedVaultNote,
} from "../../../../services/api/obsidianClient";
import { cardClass, getRenderedMarkdownHtml } from "./cardShared";
import { useSmartNodeScroll } from "./useSmartNodeScroll";

export interface MarkdownCardBodyProps {
	file: string;
	borderStyle: React.CSSProperties;
	selected?: boolean;
}

export const MarkdownCardBody = memo(function MarkdownCardBody({
	file,
	borderStyle,
	selected,
}: MarkdownCardBodyProps) {
	const [content, setContent] = useState<string>(() => {
		const cached = getCachedVaultNote(file);
		return cached?.content ?? "";
	});
	const [loading, setLoading] = useState(!content);

	useEffect(() => {
		let active = true;
		void fetchVaultNote(file).then(({ note }) => {
			if (!active) return;
			if (note?.content !== undefined) {
				setContent(note.content);
			}
			setLoading(false);
		});
		return () => {
			active = false;
		};
	}, [file]);

	const scrollRef = useSmartNodeScroll<HTMLDivElement>({ selected });
	const html = useMemo(() => getRenderedMarkdownHtml(content), [content]);
	const displayName = file.split("/").pop()?.replace(/\.md$/i, "") ?? file;

	return (
		<div className="relative w-full h-full flex flex-col">
			{/* Top note title bar / badge */}
			<div
				className="absolute -top-5 left-1 text-[11px] text-muted truncate max-w-[95%] select-none pointer-events-none font-medium"
				title={displayName}
			>
				{displayName}
			</div>
			<div
				ref={scrollRef}
				className={`${cardClass} ${
					selected ? "nowheel" : ""
				} p-4 overflow-y-auto overscroll-contain text-xs text-foreground/90 leading-relaxed cursor-default`}
				style={borderStyle}
			>
				{loading && !html ? (
					<div className="flex items-center justify-center h-full text-xs text-muted">
						加载笔记中...
					</div>
				) : html ? (
					<div
						className="canvas-markdown-preview prose prose-sm dark:prose-invert max-w-none break-words"
						// biome-ignore lint/security/noDangerouslySetInnerHtml: rendered markdown HTML
						dangerouslySetInnerHTML={{ __html: html }}
					/>
				) : (
					<div className="text-muted italic text-center py-4">（空笔记）</div>
				)}
			</div>
		</div>
	);
});
