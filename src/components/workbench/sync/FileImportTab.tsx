import { toast } from "@heroui/react";
import { UploadCloud } from "lucide-react";
import type { ChangeEvent } from "react";
import { WorkbenchStorageService } from "../../../services/workbenchStorage";
import type { BookmarkTDKItem, WorkbenchItem } from "../types";

interface FileImportTabProps {
	onBookmarksImported: (
		newUnclassified: WorkbenchItem[],
		triggerAICallback?: boolean,
	) => void;
	onClose: () => void;
}

/**
 * Parse Netscape Bookmark HTML file (Standard Chrome / Firefox exported bookmarks)
 */
function parseBookmarkHtml(html: string): BookmarkTDKItem[] {
	const results: BookmarkTDKItem[] = [];
	const parser = new DOMParser();
	const doc = parser.parseFromString(html, "text/html");

	const links = doc.querySelectorAll("a");
	links.forEach((a, idx) => {
		const href = a.getAttribute("href");
		if (href && (href.startsWith("http://") || href.startsWith("https://"))) {
			const pathSegments: string[] = [];
			let parent = a.parentElement;
			while (parent && parent !== doc.body) {
				if (parent.tagName === "DL") {
					const h3 = parent.previousElementSibling;
					if (h3 && h3.tagName === "H3" && h3.textContent) {
						pathSegments.unshift(h3.textContent.trim());
					}
				}
				parent = parent.parentElement;
			}

			const title = a.textContent?.trim() || href;
			const addDate = a.getAttribute("add_date");
			const dateAdded = addDate
				? Number.parseInt(addDate, 10) * 1000
				: undefined;

			results.push({
				id: `imp_${Date.now()}_${idx}`,
				title,
				url: href,
				parentTitle: pathSegments[pathSegments.length - 1] || "",
				folderPath: pathSegments.join(" / "),
				dateAdded,
			});
		}
	});

	return results;
}

/**
 * Tab panel for importing bookmarks from HTML / JSON files
 */
export function FileImportTab({
	onBookmarksImported,
	onClose,
}: FileImportTabProps) {
	const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = async (event) => {
			const content = event.target?.result as string;
			if (!content) return;

			let items: BookmarkTDKItem[] = [];

			if (file.name.endsWith(".json")) {
				try {
					const parsed = JSON.parse(content);
					items = Array.isArray(parsed) ? parsed : Object.values(parsed);
				} catch {
					toast.danger("JSON 文件解析失败，请检查格式");
					return;
				}
			} else {
				items = parseBookmarkHtml(content);
			}

			if (items.length === 0) {
				toast.warning("未在文件中找到有效的网页书签链接");
				return;
			}

			await WorkbenchStorageService.addBookmarksToDb(items);
			const { unclassified: updated } =
				await WorkbenchStorageService.fetchAllFromDb();
			toast.success(`已从文件解析并保存 ${items.length} 个书签至 SQLite`);
			onBookmarksImported(updated, false);
			onClose();
		};
		reader.readAsText(file);
	};

	return (
		<div className="flex flex-col gap-3 py-2">
			<p className="text-muted leading-relaxed">
				支持从 Chrome 浏览器书签管理器导出的 <code>bookmarks.html</code> 或 JSON
				结构文件，自动提取每个书签的名称、链接与完整目录路径。
			</p>

			<label className="border-2 border-dashed border-border hover:border-accent/60 bg-surface-secondary/50 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-colors text-center group">
				<UploadCloud className="w-8 h-8 text-muted group-hover:text-accent mb-2 transition-colors" />
				<span className="font-semibold text-foreground mb-0.5">
					点击选择或拖拽书签文件到此处
				</span>
				<span className="text-[11px] text-muted">
					支持 .html (Chrome/Edge/Firefox书签) 或 .json 文件
				</span>
				<input
					type="file"
					accept=".html,.htm,.json"
					className="hidden"
					onChange={handleFileUpload}
				/>
			</label>
		</div>
	);
}
