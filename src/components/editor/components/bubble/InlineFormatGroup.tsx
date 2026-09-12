import type { Editor } from "@tiptap/core";
import {
	Bold,
	Code,
	Heading1,
	Heading2,
	Heading3,
	Italic,
	Link as LinkIcon,
	Pilcrow,
	Strikethrough,
	Underline as UnderlineIcon,
} from "lucide-react";
import type React from "react";

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
			className={`w-7 h-7 rounded-lg transition-all cursor-pointer flex items-center justify-center ${
				active
					? "bg-accent/15 text-accent font-semibold ring-1 ring-accent/25"
					: "text-foreground/75 hover:text-foreground hover:bg-muted/20 active:scale-95"
			}`}
		>
			<Icon className="w-3.5 h-3.5" />
		</button>
	);
}

export interface InlineFormatGroupProps {
	editor: Editor;
}

/**
 * Common inline text formatting buttons for the selection bubble menu
 */
export function InlineFormatGroup({ editor }: InlineFormatGroupProps) {
	const handleSetParagraph = () =>
		editor.chain().focus().setParagraph().run();
	const handleToggleHeading1 = () =>
		editor.chain().focus().toggleHeading({ level: 1 }).run();
	const handleToggleHeading2 = () =>
		editor.chain().focus().toggleHeading({ level: 2 }).run();
	const handleToggleHeading3 = () =>
		editor.chain().focus().toggleHeading({ level: 3 }).run();

	const handleToggleBold = () => editor.chain().focus().toggleBold().run();
	const handleToggleItalic = () => editor.chain().focus().toggleItalic().run();
	const handleToggleUnderline = () =>
		editor.chain().focus().toggleUnderline().run();
	const handleToggleStrike = () => editor.chain().focus().toggleStrike().run();
	const handleToggleCode = () => editor.chain().focus().toggleCode().run();

	const handleToggleLink = () => {
		const previousUrl = editor.getAttributes("link").href;
		const url = window.prompt("输入链接地址", previousUrl || "");
		if (url === null) return;
		if (url.trim() === "") {
			editor.chain().focus().extendMarkRange("link").unsetLink().run();
		} else {
			editor
				.chain()
				.focus()
				.extendMarkRange("link")
				.setLink({ href: url.trim() })
				.run();
		}
	};

	return (
		<div className="flex items-center gap-0.5">
			<FormatToolButton
				icon={Pilcrow}
				label="正文 (段落)"
				active={editor.isActive("paragraph")}
				onClick={handleSetParagraph}
			/>
			<FormatToolButton
				icon={Heading1}
				label="标题 1"
				active={editor.isActive("heading", { level: 1 })}
				onClick={handleToggleHeading1}
			/>
			<FormatToolButton
				icon={Heading2}
				label="标题 2"
				active={editor.isActive("heading", { level: 2 })}
				onClick={handleToggleHeading2}
			/>
			<FormatToolButton
				icon={Heading3}
				label="标题 3"
				active={editor.isActive("heading", { level: 3 })}
				onClick={handleToggleHeading3}
			/>
			<div className="w-px h-3.5 bg-border/80 mx-0.5 shrink-0" />
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
			<FormatToolButton
				icon={LinkIcon}
				label="超链接"
				active={editor.isActive("link")}
				onClick={handleToggleLink}
			/>
		</div>
	);
}
