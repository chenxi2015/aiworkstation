import {
	Button,
	ColorSwatchPicker,
	FieldError,
	Input,
	Label,
	ListBox,
	ListBoxItem,
	Modal,
	parseColor,
	Select,
	SelectPopover,
	SelectTrigger,
	SelectValue,
	TextArea,
	TextField,
} from "@heroui/react";
import { Palette, RotateCcw } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { FolderAppGridCover } from "./folder/FolderAppGridCover";
import type { Folder } from "./types";
import { FOLDER_CATEGORIES } from "./types";

export const FOLDER_COLORS = [
	"#F43F5E",
	"#D946EF",
	"#8B5CF6",
	"#3B82F6",
	"#06B6D4",
	"#10B981",
	"#84CC16",
];

interface FolderModalProps {
	isOpen: boolean;
	folder: Folder | null;
	folders: Folder[];
	defaultCategory: string;
	defaultParentId?: number | null;
	onClose: () => void;
	onSave: (data: {
		id?: number;
		name: string;
		category: string;
		desc: string;
		color?: string;
		parentId?: number | null;
	}) => void;
	onDelete: (id: number) => void;
}

export function FolderModal({
	isOpen,
	folder,
	folders,
	defaultCategory,
	defaultParentId = null,
	onClose,
	onSave,
	onDelete,
}: FolderModalProps) {
	const [name, setName] = useState("");
	const [category, setCategory] = useState(defaultCategory);
	const [desc, setDesc] = useState("");
	const [color, setColor] = useState("");
	const [parentId, setParentId] = useState<number | null>(null);
	const [error, setError] = useState("");

	const isEdit = !!folder;

	// Parent candidates: all folders except the folder itself and its descendants
	const parentOptions = useMemo(() => {
		if (!folder) return folders;
		const byId = new Map(folders.map((f) => [f.id, f]));
		return folders.filter((candidate) => {
			let current: number | null | undefined = candidate.id;
			const visited = new Set<number>();
			while (current != null) {
				if (current === folder.id) return false;
				if (visited.has(current)) return true;
				visited.add(current);
				current = byId.get(current)?.parentId ?? null;
			}
			return true;
		});
	}, [folders, folder]);

	useEffect(() => {
		if (isOpen) {
			if (folder) {
				setName(folder.name);
				setCategory(folder.category);
				setDesc(folder.desc || "");
				setColor(folder.color || "");
				setParentId(folder.parentId ?? null);
			} else {
				setName("");
				const parent =
					defaultParentId != null
						? folders.find((f) => f.id === defaultParentId)
						: undefined;
				setCategory(parent?.category || defaultCategory || "工作台");
				setDesc("");
				setColor("");
				setParentId(parent?.id ?? null);
			}
			setError("");
		}
	}, [isOpen, folder, folders, defaultCategory, defaultParentId]);

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault();
		const trimmed = name.trim();
		if (!trimmed) {
			setError("请输入文件夹名称");
			return;
		}

		onSave({
			id: folder?.id,
			name: trimmed,
			category,
			desc: desc.trim(),
			color: color.trim() || undefined,
			parentId,
		});
	};

	const handleDelete = () => {
		if (!folder) return;
		if (
			window.confirm(`确定删除文件夹「${folder.name}」吗？此操作不可撤销。`)
		) {
			onDelete(folder.id);
		}
	};

	const fieldClassName =
		"rounded-xl border border-border bg-surface shadow-2xs transition-all hover:border-border/90 focus:border-accent focus:ring-2 focus:ring-accent/15";

	return (
		<Modal.Backdrop
			isOpen={isOpen}
			onOpenChange={(open) => !open && onClose()}
			variant="blur"
		>
			<Modal.Container size="sm">
				<Modal.Dialog aria-label={isEdit ? "编辑文件夹" : "新建文件夹"}>
					{/* Built-in close button from HeroUI */}
					<Modal.CloseTrigger />

					{/* Modal Header */}
					<Modal.Header>
						<Modal.Heading>
							{isEdit ? "编辑文件夹" : "新建文件夹"}
						</Modal.Heading>
					</Modal.Header>

					<form onSubmit={handleSubmit} className="flex flex-col gap-4">
						<Modal.Body className="flex flex-col gap-4">
							{/* Folder Name */}
							<TextField
								value={name}
								onChange={(val) => {
									setName(val);
									if (error) setError("");
								}}
								isInvalid={!!error}
							>
								<Label>
									文件夹名称 <span className="text-danger">*</span>
								</Label>
								<Input
									placeholder="例如：内容创作工具集"
									maxLength={30}
									className={fieldClassName}
								/>
								{error && <FieldError>{error}</FieldError>}
							</TextField>

							{/* Parent Folder Select */}
							<Select
								selectedKey={parentId === null ? "none" : String(parentId)}
								onSelectionChange={(key) => {
									if (key == null) return;
									if (key === "none") {
										setParentId(null);
										return;
									}
									const parent = parentOptions.find(
										(f) => f.id === Number(key),
									);
									setParentId(parent?.id ?? null);
									if (parent) setCategory(parent.category);
								}}
							>
								<Label>父级文件夹</Label>
								<SelectTrigger className={fieldClassName}>
									<SelectValue />
								</SelectTrigger>
								<SelectPopover>
									<ListBox>
										<ListBoxItem id="none" textValue="无（顶级文件夹）">
											无（顶级文件夹）
										</ListBoxItem>
										{parentOptions.map((f) => (
											<ListBoxItem
												key={f.id}
												id={String(f.id)}
												textValue={f.name}
											>
												{f.name}
											</ListBoxItem>
										))}
									</ListBox>
								</SelectPopover>
							</Select>

							{/* Category Select */}
							<Select
								selectedKey={category}
								onSelectionChange={(key) => {
									if (key) setCategory(String(key));
								}}
								isDisabled={parentId !== null}
							>
								<Label>
									所属分类
									{parentId !== null && (
										<span className="ml-1 text-[10px] text-muted font-normal">
											（子文件夹跟随父级分类）
										</span>
									)}
								</Label>
								<SelectTrigger className={fieldClassName}>
									<SelectValue />
								</SelectTrigger>
								<SelectPopover>
									<ListBox>
										{FOLDER_CATEGORIES.map((cat) => (
											<ListBoxItem key={cat} id={cat} textValue={cat}>
												{cat}
											</ListBoxItem>
										))}
									</ListBox>
								</SelectPopover>
							</Select>

							{/* Description */}
							<TextField value={desc} onChange={setDesc}>
								<Label>描述（可选）</Label>
								<TextArea
									placeholder="这个文件夹用来归集什么？"
									maxLength={120}
									rows={2}
									className={fieldClassName}
								/>
							</TextField>

							{/* Color Accent Picker */}
							<div className="flex flex-col gap-2 pt-1 border-t border-border/50">
								<div className="flex items-center justify-between">
									<Label className="text-xs font-medium text-foreground">
										颜色标注（渐变色风格）
									</Label>
									{color && (
										<button
											type="button"
											onClick={() => setColor("")}
											className="text-[11px] text-muted hover:text-foreground flex items-center gap-1 cursor-pointer transition-colors"
										>
											<RotateCcw className="w-3 h-3" />
											<span>重置为默认</span>
										</button>
									)}
								</div>

								{/* Color swatches */}
								{(() => {
									const isCustomColor =
										color !== "" &&
										!FOLDER_COLORS.some(
											(c) => c.toLowerCase() === color.toLowerCase(),
										);
									return (
										<div className="flex items-center gap-2 flex-wrap">
											<ColorSwatchPicker
												value={parseColor(color || "rgba(0,0,0,0)")}
												onChange={(c) => setColor(c.toString("hex"))}
											>
												{FOLDER_COLORS.map((c) => (
													<ColorSwatchPicker.Item key={c} color={c}>
														<ColorSwatchPicker.Swatch />
														<ColorSwatchPicker.Indicator />
													</ColorSwatchPicker.Item>
												))}
											</ColorSwatchPicker>

											{/* Custom Color Input */}
											<label
												title="自定义颜色"
												className={`relative w-7 h-7 rounded-full flex items-center justify-center cursor-pointer border border-dashed border-border/80 hover:border-accent hover:scale-105 transition-all ${
													isCustomColor
														? "ring-2 ring-accent ring-offset-2 scale-110 shadow-sm"
														: ""
												}`}
												style={{
													backgroundColor: isCustomColor ? color : undefined,
												}}
											>
												<Palette
													className={`w-3.5 h-3.5 ${
														isCustomColor
															? "text-white drop-shadow-sm"
															: "text-muted"
													}`}
												/>
												<input
													type="color"
													value={color || "#F43F5E"}
													onChange={(e) => setColor(e.target.value)}
													className="sr-only"
												/>
											</label>
										</div>
									);
								})()}

								{/* Live Preview Card */}
								<div
									className="relative overflow-hidden mt-1 p-2.5 rounded-xl border bg-surface transition-all duration-200 flex items-center gap-3 shadow-xs"
									style={{
										borderColor: color ? `${color}35` : "var(--border)",
									}}
								>
									<FolderAppGridCover
										folder={{
											id: folder?.id || 0,
											name: name.trim() || "文件夹预览",
											category,
											createdAt: "",
											desc,
											color,
											items:
												folder?.items && folder.items.length > 0
													? folder.items
													: [
															{
																name: "微信",
																type: "link",
																url: "https://weixin.qq.com",
															},
															{
																name: "小红书",
																type: "link",
																url: "https://xiaohongshu.com",
															},
															{
																name: "GitHub",
																type: "link",
																url: "https://github.com",
															},
															{
																name: "Google",
																type: "link",
																url: "https://google.com",
															},
														],
										}}
										size="sm"
									/>
									<div className="min-w-0 flex-1">
										<p className="text-xs font-semibold text-foreground truncate">
											{name.trim() || "文件夹名称预览"}
										</p>
										<p className="text-[10px] text-muted">
											{color
												? `已应用手机桌面风格与专属颜色（${color}）`
												: "默认磨砂玻璃风格"}
										</p>
									</div>
								</div>
							</div>
						</Modal.Body>

						{/* Modal Footer */}
						<Modal.Footer className="flex items-center justify-between">
							<div>
								{isEdit && (
									<Button
										type="button"
										variant="danger-soft"
										size="sm"
										className="rounded-full"
										onPress={handleDelete}
									>
										删除
									</Button>
								)}
							</div>

							<div className="flex items-center gap-2">
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="rounded-full"
									onPress={onClose}
								>
									取消
								</Button>
								<Button
									type="submit"
									variant="primary"
									size="sm"
									className="rounded-full"
								>
									{isEdit ? "保存" : "创建"}
								</Button>
							</div>
						</Modal.Footer>
					</form>
				</Modal.Dialog>
			</Modal.Container>
		</Modal.Backdrop>
	);
}
