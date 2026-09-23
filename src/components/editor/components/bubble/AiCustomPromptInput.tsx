import { ArrowUp, Wand2 } from "lucide-react";
import { useState } from "react";

export interface AiCustomPromptInputProps {
	onSubmit: (instruction: string) => void;
}

/**
 * Free-form AI instruction input for the selection bubble menu.
 * Lets users describe custom rewrite intent, e.g. "改成领导讲话稿".
 */
export function AiCustomPromptInput({ onSubmit }: AiCustomPromptInputProps) {
	const [value, setValue] = useState("");

	const submit = () => {
		const instruction = value.trim();
		if (!instruction) return;
		setValue("");
		onSubmit(instruction);
	};

	const hasValue = value.trim().length > 0;

	return (
		<div className="flex items-center gap-2.5 px-3 py-2 border-b border-border/50 bg-surface/50">
			{/* AI Gradient Icon Badge */}
			<div className="w-6 h-6 rounded-md bg-gradient-to-tr from-accent/20 via-violet-500/15 to-purple-500/20 text-accent flex items-center justify-center shrink-0 shadow-xs border border-accent/15">
				<Wand2 className="w-3.5 h-3.5" />
			</div>

			<input
				value={value}
				onChange={(e) => setValue(e.target.value)}
				// Panel root swallows mousedown to preserve editor selection;
				// stop it here so the input can actually take focus.
				onMouseDown={(e) => e.stopPropagation()}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						submit();
					} else if (e.key === "Escape") {
						e.currentTarget.blur();
					}
				}}
				placeholder="输入指令，如：改成领导讲话稿"
				className="flex-1 min-w-0 bg-transparent text-[12.5px] text-foreground placeholder:text-muted-foreground/50 outline-none select-text py-0.5 leading-normal"
			/>

			{/* Submit Button */}
			<button
				type="button"
				onClick={submit}
				disabled={!hasValue}
				title={hasValue ? "执行指令 (Enter)" : "请输入指令"}
				aria-label="执行自定义指令"
				className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-all duration-150 ${
					hasValue
						? "bg-accent text-accent-foreground shadow-xs hover:opacity-95 hover:scale-105 active:scale-95 cursor-pointer"
						: "text-muted-foreground/30 bg-muted/20 cursor-not-allowed"
				}`}
			>
				<ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
			</button>
		</div>
	);
}
