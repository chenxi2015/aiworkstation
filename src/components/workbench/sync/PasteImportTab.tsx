import { Button, Label, TextArea, TextField, toast } from "@heroui/react";
import { useState } from "react";
import { WorkbenchStorageService } from "../../../services/workbenchStorage";
import type { BookmarkTDKItem, WorkbenchItem } from "../types";

interface PasteImportTabProps {
	onBookmarksImported: (
		newUnclassified: WorkbenchItem[],
		triggerAICallback?: boolean,
	) => void;
	onClose: () => void;
}

/**
 * Tab panel for importing bookmarks by pasting URLs or JSON
 */
export function PasteImportTab({
	onBookmarksImported,
	onClose,
}: PasteImportTabProps) {
	const [rawText, setRawText] = useState("");

	const handlePasteImport = async () => {
		const trimmed = rawText.trim();
		if (!trimmed) {
			toast.info("请先输入或粘贴书签文本/链接");
			return;
		}

		let items: BookmarkTDKItem[] = [];

		if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
			try {
				const parsed = JSON.parse(trimmed);
				items = Array.isArray(parsed) ? parsed : [parsed];
			} catch {
				// Fallback to line by line parsing
			}
		}

		if (items.length === 0) {
			items = trimmed
				.split("\n")
				.map((line) => line.trim())
				.filter(Boolean)
				.map((line, idx) => {
					const parts = line.split(/\s+/);
					const url = parts[0] || "";
					const title = parts.slice(1).join(" ") || url;
					return {
						id: `paste_${Date.now()}_${idx}`,
						title,
						url,
					};
				})
				.filter((i) => i.url.startsWith("http"));
		}

		if (items.length === 0) {
			toast.warning("未能解析出有效的 URL 链接");
			return;
		}

		await WorkbenchStorageService.addBookmarksToDb(items);
		const { unclassified: updated } =
			await WorkbenchStorageService.fetchAllFromDb();
		toast.success(`已成功导入 ${items.length} 个书签至 SQLite`);
		onBookmarksImported(updated, false);
		onClose();
	};

	return (
		<div className="flex flex-col gap-3">
			<TextField value={rawText} onChange={setRawText}>
				<Label>粘贴书签链接列表或 JSON 数组</Label>
				<TextArea
					placeholder={
						"每行一条链接，或格式如：\nhttps://github.com GitHub代码托管\nhttps://deepseek.com DeepSeek官网"
					}
					rows={6}
					variant="secondary"
				/>
			</TextField>

			<Button
				variant="primary"
				size="sm"
				className="rounded-full shadow-sm cursor-pointer"
				onPress={handlePasteImport}
			>
				导入到未分类池
			</Button>
		</div>
	);
}
