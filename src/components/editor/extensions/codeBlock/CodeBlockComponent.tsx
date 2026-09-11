import {
	NodeViewContent,
	type NodeViewProps,
	NodeViewWrapper,
} from "@tiptap/react";
import { Check, Copy } from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import { lowlight, SUPPORTED_LANGUAGES } from "./codeHighlightUtils";

/**
 * React NodeView for TipTap CodeBlock with header, language selector, and copy button
 */
export function CodeBlockComponent({
	node,
	updateAttributes,
	editor,
}: NodeViewProps) {
	const [copied, setCopied] = useState(false);
	const rawLanguage = (node.attrs.language as string) || "";
	const isEditable = editor?.isEditable ?? true;

	const displayLanguage = useMemo(() => {
		if (rawLanguage) return rawLanguage.toUpperCase();
		// Auto detect preview label
		try {
			const autoResult = lowlight.highlightAuto(node.textContent || "");
			return autoResult.data?.language?.toUpperCase() || "CODE";
		} catch {
			return "CODE";
		}
	}, [rawLanguage, node.textContent]);

	const handleCopy = async (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();

		const codeText = node.textContent;
		let success = false;

		if (navigator?.clipboard?.writeText) {
			try {
				await navigator.clipboard.writeText(codeText);
				success = true;
			} catch {
				success = false;
			}
		}

		// Fallback for older browsers or restricted environments
		if (!success) {
			try {
				const textarea = document.createElement("textarea");
				textarea.value = codeText;
				textarea.style.position = "fixed";
				textarea.style.opacity = "0";
				document.body.appendChild(textarea);
				textarea.select();
				document.execCommand("copy");
				document.body.removeChild(textarea);
				success = true;
			} catch (err) {
				console.error("Failed to copy code to clipboard:", err);
			}
		}

		if (success) {
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		}
	};

	return (
		<NodeViewWrapper className="code-block-node-view not-prose my-4 rounded-xl border border-zinc-800/80 bg-[#1e1e1e] text-zinc-100 shadow-md overflow-hidden group">
			{/* Code Block Header */}
			<div className="flex items-center justify-between px-3.5 py-1.5 bg-[#252526] border-b border-zinc-800/80 select-none text-xs font-mono text-zinc-400">
				<div className="flex items-center gap-2">
					<div className="flex items-center gap-1.5 mr-1.5">
						<span className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]/80 inline-block" />
						<span className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]/80 inline-block" />
						<span className="w-2.5 h-2.5 rounded-full bg-[#27c93f]/80 inline-block" />
					</div>

					{isEditable ? (
						<select
							aria-label="选择代码语言"
							value={rawLanguage}
							onChange={(e) => updateAttributes({ language: e.target.value })}
							className="bg-transparent text-zinc-300 text-xs font-mono font-medium focus:outline-none focus:ring-1 focus:ring-accent/40 rounded px-1.5 py-0.5 cursor-pointer hover:bg-zinc-800/80 transition-colors"
						>
							{SUPPORTED_LANGUAGES.map((lang) => (
								<option
									key={lang.value}
									value={lang.value}
									className="bg-zinc-900 text-zinc-200 py-1"
								>
									{lang.label}
								</option>
							))}
						</select>
					) : (
						<span className="font-mono text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
							{displayLanguage}
						</span>
					)}
				</div>

				{/* Copy Button */}
				<button
					type="button"
					onClick={handleCopy}
					aria-label="复制代码"
					title={copied ? "已复制到剪贴板" : "复制代码"}
					className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-sans font-medium transition-all duration-150 cursor-pointer ${
						copied
							? "bg-emerald-950/60 text-emerald-400 border border-emerald-800/60"
							: "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/90"
					}`}
				>
					{copied ? (
						<>
							<Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
							<span className="text-[11px] text-emerald-400">已复制</span>
						</>
					) : (
						<>
							<Copy className="w-3.5 h-3.5 shrink-0" />
							<span className="text-[11px]">复制</span>
						</>
					)}
				</button>
			</div>

			{/* Code Content */}
			<pre className="p-4 overflow-x-auto text-[13px] leading-relaxed font-mono bg-transparent m-0 select-text">
				<NodeViewContent<"code">
					as="code"
					className={rawLanguage ? `language-${rawLanguage} hljs` : "hljs"}
				/>
			</pre>
		</NodeViewWrapper>
	);
}
