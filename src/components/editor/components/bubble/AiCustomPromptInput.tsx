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

	return (
		<div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/60">
			<Wand2 className="w-4 h-4 text-accent shrink-0" />
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
				className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-muted/70 outline-none select-text"
			/>
			<button
				type="button"
				onClick={submit}
				disabled={!value.trim()}
				title="执行自定义指令"
				aria-label="执行自定义指令"
				className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all cursor-pointer bg-accent text-accent-foreground hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
			>
				<ArrowUp className="w-4 h-4" />
			</button>
		</div>
	);
}
