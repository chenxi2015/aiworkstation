import { Button, Tooltip } from "@heroui/react";
import { ArrowUp, Square } from "lucide-react";
import { memo } from "react";
import type { Folder } from "../../types";
import { type ActiveChatScope, ChatScopePill } from "./ChatScopePill";

export type { ActiveChatScope };

export interface ChatInputBottomBarProps {
	scopeMode?: "global" | "folder";
	selectedFolder?: Folder | null;
	activeScope?: ActiveChatScope | null;
	onToggleScope?: () => void;
	isLoading: boolean;
	canSend: boolean;
	onSend: () => void;
	onStop?: () => void;
}

/**
 * Bottom action toolbar inside the chat input card:
 * Hosts the left scope switch pill (global / folder / document / material) and the right send/stop button.
 */
export const ChatInputBottomBar = memo(function ChatInputBottomBar({
	scopeMode = "global",
	selectedFolder,
	activeScope,
	onToggleScope,
	isLoading,
	canSend,
	onSend,
	onStop,
}: ChatInputBottomBarProps) {
	// Determine the effective scope (prefer activeScope if provided)
	const currentScope: ActiveChatScope | null =
		activeScope ??
		(selectedFolder
			? {
					type: "folder",
					name: selectedFolder.name,
					isActive: scopeMode === "folder",
				}
			: null);

	return (
		<div className="flex items-center justify-between pt-2 px-0.5">
			{/* Left: Scope Pill */}
			<div className="flex items-center gap-1.5">
				<ChatScopePill
					activeScope={currentScope}
					onToggleScope={onToggleScope}
				/>
			</div>

			{/* Right: Send / Stop Action Button */}
			<div className="flex items-center gap-1">
				{isLoading ? (
					<Tooltip>
						<Tooltip.Trigger>
							<Button
								variant="secondary"
								size="sm"
								isIconOnly
								className="h-7 w-7 rounded-xl border border-danger/30 bg-danger/10 hover:bg-danger/20 text-danger flex items-center justify-center cursor-pointer shadow-2xs group transition-all"
								onPress={onStop}
								aria-label="停止回答"
							>
								<Square className="w-2.5 h-2.5 fill-current group-hover:scale-90 transition-transform" />
							</Button>
						</Tooltip.Trigger>
						<Tooltip.Content className="text-xs py-1 px-2">
							停止回答
						</Tooltip.Content>
					</Tooltip>
				) : (
					<Tooltip>
						<Tooltip.Trigger>
							<Button
								variant={canSend ? "primary" : "secondary"}
								size="sm"
								isIconOnly
								className={`h-7 w-7 rounded-xl flex items-center justify-center cursor-pointer transition-all shadow-xs ${
									canSend
										? "bg-accent text-accent-foreground hover:opacity-90 shadow-accent/20"
										: "bg-surface-secondary text-muted/50 border border-border/40 cursor-not-allowed opacity-60"
								}`}
								onPress={() => {
									if (canSend) onSend();
								}}
								isDisabled={!canSend}
								aria-label="发送消息"
							>
								<ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
							</Button>
						</Tooltip.Trigger>
						<Tooltip.Content className="text-xs py-1 px-2">
							发送 (Enter)
						</Tooltip.Content>
					</Tooltip>
				)}
			</div>
		</div>
	);
});
