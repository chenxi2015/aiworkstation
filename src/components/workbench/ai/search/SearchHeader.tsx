import {
	Button,
	ComboBox,
	Input,
	ListBox,
	ListBoxItem,
	ListBoxItemIndicator,
} from "@heroui/react";
import { Globe, Search, X } from "lucide-react";
import type { RefObject } from "react";
import { memo } from "react";
import type { Folder, SearchMode, SearchScope } from "../../types";

export interface SearchHeaderProps {
	query: string;
	mode?: SearchMode;
	scope?: SearchScope;
	folders?: Folder[];
	inputRef: RefObject<HTMLInputElement | null>;
	onChangeQuery: (val: string) => void;
	onChangeMode?: (mode: SearchMode) => void;
	onChangeScope?: (scope: SearchScope) => void;
	onClose?: () => void;
}

/**
 * Top search input header (defaults to hybrid search)
 */
export const SearchHeader = memo(function SearchHeader({
	query,
	scope,
	folders = [],
	inputRef,
	onChangeQuery,
	onChangeScope,
	onClose,
}: SearchHeaderProps) {
	const isGlobal = !scope || scope.type === "global";
	const selectedFolderKeys =
		scope?.type === "folder"
			? (
					scope.folderIds ?? (scope.folderId != null ? [scope.folderId] : [])
				).map(String)
			: [];
	const selectedFolderNames = selectedFolderKeys
		.map((k) => folders.find((f) => String(f.id) === k)?.name)
		.filter((n): n is string => Boolean(n))
		.join("、");

	const handleFolderKeysChange = (keys: string[]) => {
		if (keys.length === 0) {
			onChangeScope?.({ type: "global" });
			return;
		}
		const folderIds = keys
			.map((k) => Number(k))
			.filter((id) => Number.isFinite(id));
		const first = folders.find((f) => f.id === folderIds[0]);
		onChangeScope?.({
			type: "folder",
			folderIds,
			folderId: folderIds[0],
			folderName: first?.name,
		});
	};

	return (
		<div className="p-3 border-b border-border bg-surface shrink-0 flex flex-col gap-2">
			{/* Scope Row: global toggle + multi-folder picker */}
			<div className="flex items-center justify-between gap-2 px-0.5">
				<div className="flex items-center gap-1.5 min-w-0">
					<button
						type="button"
						onClick={() => onChangeScope?.({ type: "global" })}
						className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border transition-colors cursor-pointer shrink-0 ${
							isGlobal
								? "bg-accent-soft/80 text-accent border-accent/30"
								: "bg-surface text-muted hover:text-foreground border-border/60"
						}`}
					>
						<Globe className="w-3 h-3" />
						全局搜索
					</button>
					{scope?.type === "category" && (
						<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent-soft/80 text-accent text-[11px] font-medium border border-accent/30 min-w-0">
							<span className="truncate max-w-[120px]">
								分类: {scope.categoryName}
							</span>
							<button
								type="button"
								onClick={() => onChangeScope?.({ type: "global" })}
								className="p-0.5 hover:bg-accent/20 rounded cursor-pointer text-accent/70 hover:text-accent shrink-0"
								title="清除范围，恢复全局搜索"
							>
								<X className="w-2.5 h-2.5" />
							</button>
						</span>
					)}
				</div>
				<ComboBox
					aria-label="选择文件夹范围"
					selectionMode="multiple"
					variant="secondary"
					className="w-[150px] shrink-0"
					value={selectedFolderKeys}
					onChange={(keys) => handleFolderKeysChange(keys as string[])}
				>
					<ComboBox.InputGroup className="h-6 min-h-6 px-1.5 rounded-md flex items-center gap-1 w-full bg-surface-secondary/50 border border-border/70 focus-within:border-accent/60 transition-colors">
						{selectedFolderNames && (
							<span
								className="text-[11px] text-accent font-medium truncate max-w-[84px] shrink-0 cursor-default"
								title={`已选文件夹：${selectedFolderNames}`}
							>
								{selectedFolderNames}
							</span>
						)}
						<Input
							placeholder={selectedFolderNames ? "" : "选择文件夹"}
							className="text-[11px] h-5 px-0.5 flex-1 min-w-0 bg-transparent border-none shadow-none"
						/>
						<ComboBox.Trigger className="w-4 h-4 shrink-0 [&_svg]:w-3 [&_svg]:h-3" />
					</ComboBox.InputGroup>
					<ComboBox.Popover className="max-h-56 overflow-y-auto min-w-[160px]">
						<ListBox selectionMode="multiple">
							{folders.map((f) => (
								<ListBoxItem
									key={f.id}
									id={String(f.id)}
									textValue={f.name}
									className="text-xs"
								>
									{f.name}
									<ListBoxItemIndicator />
								</ListBoxItem>
							))}
						</ListBox>
					</ComboBox.Popover>
				</ComboBox>
			</div>

			{/* Input row */}
			<div className="flex items-center gap-2 bg-surface-secondary/50 px-2.5 py-1.5 rounded-xl border border-border/70 focus-within:border-accent/60 focus-within:bg-surface transition-all">
				<Search className="w-4 h-4 text-accent shrink-0" />
				<input
					ref={inputRef}
					type="text"
					value={query}
					onChange={(e) => onChangeQuery(e.target.value)}
					placeholder="搜索书签或意图..."
					className="flex-1 bg-transparent border-none text-xs sm:text-sm text-foreground placeholder:text-muted focus:outline-none tracking-tight min-w-0"
				/>
				{query && (
					<button
						type="button"
						onClick={() => onChangeQuery("")}
						className="p-0.5 text-muted hover:text-foreground cursor-pointer rounded-md shrink-0"
						aria-label="清空输入"
					>
						<X className="w-3.5 h-3.5" />
					</button>
				)}
				{onClose && (
					<Button
						variant="ghost"
						size="sm"
						className="text-[10px] px-1.5 h-6 rounded-md text-muted hover:text-foreground cursor-pointer shrink-0"
						onPress={onClose}
					>
						ESC
					</Button>
				)}
			</div>
		</div>
	);
});
