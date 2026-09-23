import { memo, useCallback, useEffect, useRef } from "react";
import { useCanvasActions } from "../CanvasActionContext";
import type { CanvasNode } from "../canvasUtils";
import { autoFocus, cardClass } from "./cardShared";
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
		<div
			ref={divScrollRef}
			className={`${cardClass} ${
				selected ? "nowheel" : ""
			} p-3 text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap overflow-y-auto overscroll-contain cursor-default`}
			style={borderStyle}
		>
			{node.text ?? ""}
		</div>
	);
});
