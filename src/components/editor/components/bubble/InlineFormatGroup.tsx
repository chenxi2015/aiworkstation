import type { Editor } from "@tiptap/core";
import {
	Bold,
	Code,
	Italic,
	Link as LinkIcon,
	Strikethrough,
	Underline as UnderlineIcon,
} from "lucide-react";
import type React from "react";
import { useState } from "react";
import { ColorDropdown } from "../ColorDropdown";
import { HeadingDropdown } from "../HeadingDropdown";
import { UrlInputPopover } from "../UrlInputPopover";

interface FormatToolButtonProps {
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	active?: boolean;
	onClick: () => void;
}

function FormatToolButton({
	icon: Icon,
	label,
	active,
	onClick,
}: FormatToolButtonProps) {
	return (
		<button
			type="button"
			title={label}
			aria-label={label}
			onClick={onClick}
			className={`w-6.5 h-6.5 rounded-md transition-colors cursor-pointer flex items-center justify-center shrink-0 whitespace-nowrap ${
				active
					? "bg-accent/15 text-accent font-semibold"
					: "text-foreground/75 hover:text-foreground hover:bg-muted/15 active:scale-95"
			}`}
		>
			<Icon className="w-3.5 h-3.5 shrink-0" />
		</button>
	);
}

function Divider() {
	return <div className="w-px h-3.5 bg-border/60 mx-1 shrink-0" />;
}

export interface InlineFormatGroupProps {
	editor: Editor;
	isDropUp?: boolean;
}

/**
 * Common inline text formatting buttons for the selection bubble menu
 */
export function InlineFormatGroup({
	editor,
	isDropUp = false,
}: InlineFormatGroupProps) {
	const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);

	const handleToggleBold = () => editor.chain().focus().toggleBold().run();
	const handleToggleItalic = () => editor.chain().focus().toggleItalic().run();
	const handleToggleUnderline = () =>
		editor.chain().focus().toggleUnderline().run();
	const handleToggleStrike = () => editor.chain().focus().toggleStrike().run();
	const handleToggleCode = () => editor.chain().focus().toggleCode().run();

	const previousLinkUrl: string | undefined = editor.getAttributes("link").href;

	const applyLink = (url: string) => {
		editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
	};

	const removeLink = () => {
		editor.chain().focus().extendMarkRange("link").unsetLink().run();
	};

	return (
		<div className="flex items-center gap-0.5 shrink-0 whitespace-nowrap">
			{/* Heading Style */}
			<HeadingDropdown
				editor={editor}
				isDropUp={isDropUp}
				buttonClassName="flex items-center gap-1 px-1.5 py-1 rounded-md text-xs transition-colors cursor-pointer select-none whitespace-nowrap shrink-0 text-foreground/75 hover:text-foreground hover:bg-muted/15"
			/>

			<Divider />

			{/* Inline Text Formatting */}
			<FormatToolButton
				icon={Bold}
				label="加粗 (⌘B)"
				active={editor.isActive("bold")}
				onClick={handleToggleBold}
			/>
			<FormatToolButton
				icon={Italic}
				label="斜体 (⌘I)"
				active={editor.isActive("italic")}
				onClick={handleToggleItalic}
			/>
			<FormatToolButton
				icon={UnderlineIcon}
				label="下划线 (⌘U)"
				active={editor.isActive("underline")}
				onClick={handleToggleUnderline}
			/>
			<FormatToolButton
				icon={Strikethrough}
				label="删除线"
				active={editor.isActive("strike")}
				onClick={handleToggleStrike}
			/>
			<FormatToolButton
				icon={Code}
				label="行内代码"
				active={editor.isActive("code")}
				onClick={handleToggleCode}
			/>
			<div className="relative inline-block shrink-0">
				<FormatToolButton
					icon={LinkIcon}
					label="超链接"
					active={editor.isActive("link") || linkPopoverOpen}
					onClick={() => setLinkPopoverOpen((prev) => !prev)}
				/>
				<UrlInputPopover
					isOpen={linkPopoverOpen}
					placeholder="粘贴链接…"
					initialValue={previousLinkUrl || ""}
					openUrl={previousLinkUrl || undefined}
					onRemove={previousLinkUrl ? removeLink : undefined}
					onSubmit={applyLink}
					onClose={() => setLinkPopoverOpen(false)}
					isDropUp={isDropUp}
				/>
			</div>

			<Divider />

			{/* Color Tools: Text Color & Background Highlight */}
			<div className="flex items-center gap-0.5 shrink-0">
				<ColorDropdown
					editor={editor}
					mode="text"
					isDropUp={isDropUp}
					align="right"
				/>
				<ColorDropdown
					editor={editor}
					mode="background"
					isDropUp={isDropUp}
					align="right"
				/>
			</div>
		</div>
	);
}
