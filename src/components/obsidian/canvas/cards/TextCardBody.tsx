import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { useCanvasActions } from "../CanvasActionContext";
import type { CanvasNode } from "../canvasUtils";
import { autoFocus, cardClass, getRenderedMarkdownHtml } from "./cardShared";
import { useSmartNodeScroll } from "./useSmartNodeScroll";

export interface TextCardBodyProps {
	node: CanvasNode;
	editing?: boolean;
	selected?: boolean;
	borderStyle: React.CSSProperties;
	onCommitText?: (id: string, text: string) => void;
}

export const TextCardBody = memo(function TextCardBody({
	node,
	editing,
	selected,
	borderStyle,
	onCommitText,
}: TextCardBodyProps) {
	const actions = useCanvasActions();
	const draftRef = useRef<string>(node.text ?? "");
	const textareaScrollRef = useSmartNodeScroll<HTMLTextAreaElement>({
		selected: true,
		editing: true,
	});
	const divScrollRef = useSmartNodeScroll<HTMLDivElement>({ selected });

	// Merge autofocus and scroll ref for editing textarea
	const setTextareaRef = useCallback(
		(el: HTMLTextAreaElement | null) => {
			(
				textareaScrollRef as React.MutableRefObject<HTMLTextAreaElement | null>
			).current = el;
			autoFocus(el);
		},
		[textareaScrollRef],
	);

	// Keep draft in sync when the underlying text changes externally
	useEffect(() => {
		draftRef.current = node.text ?? "";
	}, [node.text]);

	const commit = (text: string) => {
		(onCommitText ?? actions.commitText)(node.id, text);
	};

	const html = useMemo(
		() => getRenderedMarkdownHtml(node.text ?? ""),
		[node.text],
	);

	// Intercept link clicks in preview mode to open externally and prevent navigating away
	const handleContentClick = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			const target = (e.target as HTMLElement).closest("a");
			if (target?.href) {
				e.preventDefault();
				e.stopPropagation();
				window.open(target.href, "_blank", "noopener,noreferrer");
			}
		},
		[],
	);

	if (editing) {
		return (
			<textarea
				ref={setTextareaRef}
				defaultValue={node.text ?? ""}
				onChange={(e) => {
					draftRef.current = e.target.value;
				}}
				onBlur={() => commit(draftRef.current)}
				onKeyDown={(e) => {
					if (e.key === "Escape") commit(node.text ?? "");
				}}
				className={`${cardClass} nodrag nowheel p-3 text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap resize-none outline-none focus:border-accent overscroll-contain`}
				style={borderStyle}
			/>
		);
	}

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: delegated link navigation
		// biome-ignore lint/a11y/useKeyWithClickEvents: link navigation is handled via anchor tags
		<div
			ref={divScrollRef}
			onClick={handleContentClick}
			className={`${cardClass} ${
				selected ? "nowheel" : ""
			} p-3 text-xs text-foreground/90 leading-relaxed overflow-y-auto overscroll-contain cursor-default select-text`}
			style={borderStyle}
		>
			{html ? (
				<div
					className="canvas-markdown-preview prose prose-sm dark:prose-invert max-w-none break-words"
					// biome-ignore lint/security/noDangerouslySetInnerHtml: rendered markdown HTML
					dangerouslySetInnerHTML={{ __html: html }}
				/>
			) : (
				<span className="text-muted italic select-none">（空卡片）</span>
			)}
		</div>
	);
});
