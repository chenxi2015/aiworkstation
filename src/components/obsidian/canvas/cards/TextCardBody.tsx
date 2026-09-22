import { memo, useEffect, useRef } from "react";
import { useCanvasActions } from "../CanvasActionContext";
import type { CanvasNode } from "../canvasUtils";
import { autoFocus, cardClass } from "./cardShared";

export interface TextCardBodyProps {
	node: CanvasNode;
	editing?: boolean;
	borderStyle: React.CSSProperties;
	onCommitText?: (id: string, text: string) => void;
}

export const TextCardBody = memo(function TextCardBody({
	node,
	editing,
	borderStyle,
	onCommitText,
}: TextCardBodyProps) {
	const actions = useCanvasActions();
	const draftRef = useRef<string>(node.text ?? "");

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
				ref={autoFocus}
				defaultValue={node.text ?? ""}
				onChange={(e) => {
					draftRef.current = e.target.value;
				}}
				onBlur={() => commit(draftRef.current)}
				onKeyDown={(e) => {
					if (e.key === "Escape") commit(node.text ?? "");
				}}
				className={`${cardClass} nodrag nowheel p-3 text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap resize-none outline-none focus:border-accent`}
				style={borderStyle}
			/>
		);
	}

	return (
		<div
			className={`${cardClass} nowheel p-3 text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap overflow-y-auto cursor-default`}
			style={borderStyle}
		>
			{node.text ?? ""}
		</div>
	);
});
