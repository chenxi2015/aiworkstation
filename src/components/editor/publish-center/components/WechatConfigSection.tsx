import {
	Label,
	ListBox,
	ListBoxItem,
	Select,
	SelectPopover,
	SelectTrigger,
	SelectValue,
} from "@heroui/react";
import type { PlatformAccountInfo } from "../../types";

export interface WechatConfigSectionProps {
	accounts: PlatformAccountInfo[];
	selectedAccountId?: number | null;
	onSelectAccount: (accountId: number) => void;
}

/**
 * Dedicated configuration section for WeChat Official Account selection
 */
export function WechatConfigSection({
	accounts,
	selectedAccountId,
	onSelectAccount,
}: WechatConfigSectionProps) {
	return (
		<div className="p-3.5 rounded-xl border border-border/80 bg-surface-secondary/40 space-y-2">
			<div className="flex items-center justify-between">
				<Label className="text-xs font-semibold text-foreground">
					关联微信公众号账号
				</Label>
				<span className="text-[10px] text-muted">官方草稿箱直接同步</span>
			</div>

			{accounts.length > 0 ? (
				<Select
					aria-label="选择微信公众号账号"
					selectedKey={String(selectedAccountId ?? accounts[0]?.id ?? "")}
					onSelectionChange={(key) => {
						if (key != null) {
							onSelectAccount(Number(key));
						}
					}}
					className="w-full"
				>
					<SelectTrigger className="w-full h-8 px-3 text-xs rounded-lg border border-border/80 bg-surface text-foreground flex items-center justify-between">
						<SelectValue className="text-xs truncate leading-none" />
					</SelectTrigger>
					<SelectPopover className="rounded-xl border border-border bg-surface shadow-lg max-h-48 overflow-y-auto min-w-[200px] z-50">
						<ListBox>
							{accounts.map((acc) => (
								<ListBoxItem
									key={acc.id}
									id={String(acc.id)}
									textValue={acc.label}
									className="text-xs rounded-lg cursor-pointer"
								>
									{acc.label}
								</ListBoxItem>
							))}
						</ListBox>
					</SelectPopover>
				</Select>
			) : (
				<div className="p-2.5 rounded-lg border border-warning/30 bg-warning/5 text-warning text-xs flex items-center justify-between">
					<span>未检测到绑定的公众号账号</span>
					<span className="text-[11px] underline cursor-pointer">
						前往设置中心绑定
					</span>
				</div>
			)}
		</div>
	);
}
