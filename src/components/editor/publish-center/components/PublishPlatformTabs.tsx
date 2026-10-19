import { Button, Checkbox, Tooltip } from "@heroui/react";
import { RefreshCw } from "lucide-react";
import React from "react";
import type { PublishPlatform } from "../../types";
import { PLATFORM_METAS, type PlatformPublishConfig } from "../types";

export interface PublishPlatformTabsProps {
	activePlatform: PublishPlatform;
	onSelectPlatform: (platform: PublishPlatform) => void;
	configs: Record<PublishPlatform, PlatformPublishConfig>;
	onToggleEnabled: (platform: PublishPlatform, e?: React.MouseEvent) => void;
	onSyncFromWechat: (target: PublishPlatform) => void;
}

/**
 * Top platform selection tabs bar with enable toggles and cross-platform sync actions.
 */
export function PublishPlatformTabs({
	activePlatform,
	onSelectPlatform,
	configs,
	onToggleEnabled,
	onSyncFromWechat,
}: PublishPlatformTabsProps) {
	return (
		<div className="border-b border-border bg-surface-secondary/30 px-5 pt-3 pb-2.5 shrink-0">
			<div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
				<div className="flex items-center gap-1.5 min-w-0">
					{PLATFORM_METAS.map((meta) => {
						const isCurrent = activePlatform === meta.id;
						const isEnabled = configs[meta.id]?.enabled;

						return (
							<div
								key={meta.id}
								className={`group relative flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-all select-none border ${
									isCurrent
										? "bg-surface text-foreground border-accent shadow-xs ring-1 ring-accent/20"
										: "bg-surface/50 text-muted hover:text-foreground hover:bg-surface border-border/80"
								}`}
							>
								{/* Platform Publish Checkbox */}
								<Checkbox
									isSelected={isEnabled}
									onChange={() => onToggleEnabled(meta.id)}
									aria-label={`发布到 ${meta.name}`}
									variant="secondary"
								>
									<Checkbox.Content>
										<Checkbox.Control>
											<Checkbox.Indicator />
										</Checkbox.Control>
									</Checkbox.Content>
								</Checkbox>

								{/* Platform Selection Click Target */}
								<button
									type="button"
									onClick={() => onSelectPlatform(meta.id)}
									className="flex items-center gap-2 cursor-pointer outline-none bg-transparent border-0 p-0 text-inherit text-xs font-medium"
								>
									<div className="w-4 h-4 rounded shrink-0 overflow-hidden flex items-center justify-center">
										<img
											src={meta.iconPath}
											alt={meta.name}
											className="w-full h-full object-contain"
										/>
									</div>
									<span className="truncate">{meta.name}</span>
								</button>

								{/* Enabled dot indicator */}
								{isEnabled && (
									<span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
								)}
							</div>
						);
					})}
				</div>

				{/* Quick sync button for non-wechat platforms */}
				{activePlatform !== "wechat" && (
					<Tooltip>
						<Tooltip.Trigger>
							<Button
								size="sm"
								variant="ghost"
								onPress={() => onSyncFromWechat(activePlatform)}
								className="h-7 px-2 text-[11px] font-medium text-accent hover:bg-accent/10 rounded-lg shrink-0"
							>
								<RefreshCw className="w-3 h-3 mr-1" />
								从公众号同步
							</Button>
						</Tooltip.Trigger>
						<Tooltip.Content className="text-xs py-1 px-2">
							复用微信公众号设置的标题、标签与封面
						</Tooltip.Content>
					</Tooltip>
				)}
			</div>
		</div>
	);
}

