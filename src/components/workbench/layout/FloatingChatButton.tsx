export interface FloatingChatButtonProps {
	onOpenChat: () => void;
}

/**
 * Floating trigger button for "Chat with Bookmarks" RAG assistant
 */
export function FloatingChatButton({ onOpenChat }: FloatingChatButtonProps) {
	return (
		<button
			type="button"
			onClick={onOpenChat}
			className="fixed bottom-6 right-6 z-30 flex items-center gap-2 px-4 py-2.5 rounded-full bg-accent text-accent-foreground shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer font-medium text-xs tracking-tight group"
			aria-label="打开书签知识问答助手"
		>
			<span className="text-sm group-hover:rotate-12 transition-transform">
				💬
			</span>
			<span>Chat with Bookmarks</span>
			<span className="px-1.5 py-0.2 text-[9px] rounded-full bg-background/20 font-mono">
				AI
			</span>
		</button>
	);
}
