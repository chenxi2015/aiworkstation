import {
	Button,
	Input,
	Label,
	Modal,
	TextArea,
	TextField,
	toast,
} from "@heroui/react";
import { BookmarkPlus, FileUp, Loader2, PenLine, Search } from "lucide-react";
import {
	type FormEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import {
	createManualMaterialRpc,
	importBookmarkMaterialRpc,
	importFileMaterialRpc,
	searchBookmarksRpc,
} from "../../services/api/creatorClient";
import type { WorkbenchItem } from "../workbench/types";
import { MarkdownEditor } from "./MarkdownEditor";

type ImportTab = "manual" | "bookmark" | "file";

const IMPORT_TABS: Array<{
	id: ImportTab;
	label: string;
	icon: typeof PenLine;
}> = [
	{ id: "manual", label: "手动新建", icon: PenLine },
	{ id: "bookmark", label: "从书签导入", icon: BookmarkPlus },
	{ id: "file", label: "本地文件", icon: FileUp },
];

interface ImportMaterialModalProps {
	isOpen: boolean;
	onClose: () => void;
	/** 导入目标文件夹（null = 未归档） */
	folderId: number | null;
	folderName?: string;
	onImported: () => Promise<void>;
}

/**
 * 素材导入统一入口：手动新建 / 从书签导入 / 本地文件 三种来源 tab 切换。
 * 本地文件会复制进 <filesRootDir>/creator/materials/<id>/ 统一管理。
 */
export function ImportMaterialModal({
	isOpen,
	onClose,
	folderId,
	folderName,
	onImported,
}: ImportMaterialModalProps) {
	const [tab, setTab] = useState<ImportTab>("manual");

	useEffect(() => {
		if (isOpen) setTab("manual");
	}, [isOpen]);

	const handleDone = async () => {
		onClose();
		await onImported();
	};

	return (
		<Modal.Backdrop
			isOpen={isOpen}
			onOpenChange={(open) => !open && onClose()}
			variant="blur"
		>
			<Modal.Container size="lg" className="w-full">
				<Modal.Dialog
					aria-label="导入素材"
					className="!max-w-2xl w-full h-[560px] max-h-[88vh] flex flex-col"
				>
					<Modal.CloseTrigger />
					<Modal.Header className="shrink-0">
						<Modal.Heading>导入素材</Modal.Heading>
						<p className="text-[11px] text-muted mt-1">
							{folderName
								? `导入后归入文件夹「${folderName}」`
								: "导入后放入「未归档」，可稍后再整理"}
						</p>
					</Modal.Header>
					<div className="shrink-0 mt-3 border-b border-border flex items-center gap-1">
						{IMPORT_TABS.map((t) => {
							const Icon = t.icon;
							const active = tab === t.id;
							return (
								<button
									key={t.id}
									type="button"
									onClick={() => setTab(t.id)}
									className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors cursor-pointer ${
										active
											? "border-accent text-accent"
											: "border-transparent text-muted hover:text-foreground"
									}`}
								>
									<Icon className="w-3.5 h-3.5" />
									{t.label}
								</button>
							);
						})}
					</div>
					<Modal.Body className="flex-1 min-h-0 flex flex-col mt-3">
						{tab === "manual" && (
							<ManualPanel folderId={folderId} onDone={handleDone} />
						)}
						{tab === "bookmark" && (
							<BookmarkPanel folderId={folderId} onDone={handleDone} />
						)}
						{tab === "file" && (
							<FilePanel folderId={folderId} onDone={handleDone} />
						)}
					</Modal.Body>
				</Modal.Dialog>
			</Modal.Container>
		</Modal.Backdrop>
	);
}

/** 手动新建面板 */
function ManualPanel({
	folderId,
	onDone,
}: {
	folderId: number | null;
	onDone: () => Promise<void>;
}) {
	const [title, setTitle] = useState("");
	const [content, setContent] = useState("");
	const [note, setNote] = useState("");
	const [saving, setSaving] = useState(false);

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault();
		if (!title.trim() || !content.trim()) {
			toast.warning("标题与正文不能为空");
			return;
		}
		setSaving(true);
		try {
			await createManualMaterialRpc({
				title: title.trim(),
				content: content.trim(),
				note: note.trim() || undefined,
				folderId,
			});
			toast.success("素材已创建");
			await onDone();
		} catch (err) {
			toast.danger(
				`创建失败：${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setSaving(false);
		}
	};

	return (
		<form
			onSubmit={handleSubmit}
			className="flex-1 min-h-0 flex flex-col gap-3"
		>
			<TextField value={title} onChange={setTitle}>
				<Label>素材标题</Label>
				<Input placeholder="这条素材是什么" variant="secondary" />
			</TextField>
			<div className="flex-1 min-h-0 flex flex-col gap-1.5">
				<Label>素材正文</Label>
				<MarkdownEditor
					value={content}
					onChange={setContent}
					placeholder="粘贴原文 / 摘录 / 要点…（支持 Markdown）"
					className="flex-1 min-h-0"
				/>
			</div>
			<TextField value={note} onChange={setNote}>
				<Label>创作意图批注（可选）</Label>
				<TextArea
					placeholder="我想用这条素材表达什么…（会注入二创 prompt，强烈建议填写）"
					variant="secondary"
					rows={2}
				/>
			</TextField>
			<div className="shrink-0 flex justify-end">
				<Button
					type="submit"
					variant="primary"
					size="sm"
					className="rounded-full flex items-center gap-1.5 cursor-pointer"
					isDisabled={saving}
				>
					{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
					创建素材
				</Button>
			</div>
		</form>
	);
}

/** 从书签导入面板（快照复制 content，此后书签更新不影响素材） */
function BookmarkPanel({
	folderId,
	onDone,
}: {
	folderId: number | null;
	onDone: () => Promise<void>;
}) {
	const [query, setQuery] = useState("");
	const [items, setItems] = useState<WorkbenchItem[]>([]);
	const [searching, setSearching] = useState(false);
	const [importingId, setImportingId] = useState<string | number | null>(null);
	const debounceRef = useRef<number | null>(null);

	const runSearch = useCallback(async (q: string) => {
		setSearching(true);
		try {
			setItems(await searchBookmarksRpc(q));
		} finally {
			setSearching(false);
		}
	}, []);

	useEffect(() => {
		runSearch("");
	}, [runSearch]);

	useEffect(() => {
		if (debounceRef.current) window.clearTimeout(debounceRef.current);
		debounceRef.current = window.setTimeout(() => runSearch(query), 300);
		return () => {
			if (debounceRef.current) window.clearTimeout(debounceRef.current);
		};
	}, [query, runSearch]);

	const handleImport = async (item: WorkbenchItem) => {
		if (item.id == null) return;
		setImportingId(item.id);
		try {
			const material = await importBookmarkMaterialRpc({
				bookmarkId: String(item.id),
				folderId,
			});
			toast.success(`已导入素材「${material.title}」`);
			await onDone();
		} catch (err) {
			toast.danger(
				`导入失败：${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setImportingId(null);
		}
	};

	return (
		<div className="flex-1 min-h-0 flex flex-col gap-3">
			<TextField value={query} onChange={setQuery} className="shrink-0">
				<Label className="sr-only">搜索书签</Label>
				<div className="relative">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none z-10" />
					<Input
						placeholder="搜索标题 / 摘要 / 关键词…"
						variant="secondary"
						className="pl-8"
					/>
				</div>
			</TextField>
			<div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5 pr-1">
				{searching && items.length === 0 ? (
					<div className="py-10 flex items-center justify-center gap-2 text-xs text-muted">
						<Loader2 className="w-4 h-4 animate-spin" />
						<span>正在搜索书签库…</span>
					</div>
				) : items.length === 0 ? (
					<div className="py-10 text-center text-xs text-muted bg-surface/50 border border-dashed border-border rounded-xl">
						没有匹配的书签
					</div>
				) : (
					items.map((item) => (
						<div
							key={String(item.id)}
							className="flex items-center gap-3 p-2.5 rounded-xl border border-border bg-surface/60 hover:border-accent/30 transition-colors"
						>
							<div className="flex-1 min-w-0">
								<p className="text-xs font-medium text-foreground truncate">
									{item.name}
								</p>
								<p className="text-[10px] text-muted truncate mt-0.5">
									{item.summary || item.description || item.url}
								</p>
							</div>
							<Button
								type="button"
								variant="secondary"
								size="sm"
								className="rounded-full h-7 text-[11px] shrink-0 cursor-pointer"
								isDisabled={importingId !== null}
								onPress={() => handleImport(item)}
							>
								{importingId === item.id ? (
									<Loader2 className="w-3 h-3 animate-spin" />
								) : (
									"导入"
								)}
							</Button>
						</div>
					))
				)}
			</div>
		</div>
	);
}

/** 本地文件导入面板：复制入 <filesRootDir>/creator/materials/<id>/ 并登记 assets */
function FilePanel({
	folderId,
	onDone,
}: {
	folderId: number | null;
	onDone: () => Promise<void>;
}) {
	const [sourcePath, setSourcePath] = useState("");
	const [title, setTitle] = useState("");
	const [note, setNote] = useState("");
	const [saving, setSaving] = useState(false);

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault();
		if (!sourcePath.trim()) {
			toast.warning("请填写本地文件路径");
			return;
		}
		setSaving(true);
		try {
			const material = await importFileMaterialRpc({
				sourcePath: sourcePath.trim(),
				title: title.trim() || undefined,
				note: note.trim() || undefined,
				folderId,
			});
			toast.success(`文件已导入素材「${material.title}」`);
			await onDone();
		} catch (err) {
			toast.danger(
				`导入失败：${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setSaving(false);
		}
	};

	return (
		<form onSubmit={handleSubmit} className="flex flex-col gap-3">
			<p className="text-[11px] text-muted -mt-1">
				支持视频 / Markdown / 图片 / 音频，文件会复制进文件管理根目录的
				creator/materials/ 下统一管理
			</p>
			<TextField value={sourcePath} onChange={setSourcePath}>
				<Label>本地文件路径</Label>
				<Input placeholder="~/Movies/demo.mp4 或绝对路径" variant="secondary" />
			</TextField>
			<TextField value={title} onChange={setTitle}>
				<Label>素材标题（可选，默认取文件名）</Label>
				<Input placeholder="这条素材是什么" variant="secondary" />
			</TextField>
			<TextField value={note} onChange={setNote}>
				<Label>创作意图批注（可选）</Label>
				<TextArea
					placeholder="我想用这条素材表达什么…"
					variant="secondary"
					rows={2}
				/>
			</TextField>
			<div className="shrink-0 flex justify-end">
				<Button
					type="submit"
					variant="primary"
					size="sm"
					className="rounded-full flex items-center gap-1.5 cursor-pointer"
					isDisabled={saving}
				>
					{saving ? (
						<Loader2 className="w-3.5 h-3.5 animate-spin" />
					) : (
						<FileUp className="w-3.5 h-3.5" />
					)}
					导入为素材
				</Button>
			</div>
		</form>
	);
}
