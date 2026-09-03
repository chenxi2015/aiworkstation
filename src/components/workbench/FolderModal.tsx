import {
	Button,
	FieldError,
	Input,
	Label,
	ListBox,
	ListBoxItem,
	Modal,
	Select,
	SelectPopover,
	SelectTrigger,
	SelectValue,
	TextArea,
	TextField,
} from "@heroui/react";
import { Check, Palette, RotateCcw } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { FolderAppGridCover } from "./folder/FolderAppGridCover";
import type { Folder } from "./types";
import { CATEGORIES } from "./types";

export const FOLDER_COLOR_PRESETS = [
	{ name: "默认", value: "" },
	{ name: "科技蓝", value: "#4f46e5" },
	{ name: "翡翠绿", value: "#059669" },
	{ name: "琥珀橙", value: "#d97706" },
	{ name: "珊瑚粉", value: "#e11d48" },
	{ name: "梦幻紫", value: "#7c3aed" },
	{ name: "天空蓝", value: "#0284c7" },
	{ name: "烈焰橙", value: "#ea580c" },
	{ name: "高级灰", value: "#475569" },
];

interface FolderModalProps {
	isOpen: boolean;
	folder: Folder | null;
	defaultCategory: string;
	onClose: () => void;
	onSave: (data: {
		id?: number;
		name: string;
		category: string;
		desc: string;
		color?: string;
	}) => void;
	onDelete: (id: number) => void;
}

export function FolderModal({
	isOpen,
	folder,
	defaultCategory,
	onClose,
	onSave,
	onDelete,
}: FolderModalProps) {
	const [name, setName] = useState("");
	const [category, setCategory] = useState(defaultCategory);
	const [desc, setDesc] = useState("");
	const [color, setColor] = useState("");
	const [error, setError] = useState("");

	const isEdit = !!folder;

	useEffect(() => {
		if (isOpen) {
			if (folder) {
				setName(folder.name);
				setCategory(folder.category);
				setDesc(folder.desc || "");
				setColor(folder.color || "");
			} else {
				setName("");
				setCategory(defaultCategory || "工作台");
				setDesc("");
				setColor("");
			}
			setError("");
		}
	}, [isOpen, folder, defaultCategory]);

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
									variant="secondary"
								/>
								{error && <FieldError>{error}</FieldError>}
							</TextField>

							{/* Category Select */}
							<Select
								selectedKey={category}
								onSelectionChange={(key) => {
									if (key) setCategory(String(key));
								}}
								variant="secondary"
							>
								<Label>所属分类</Label>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectPopover>
									<ListBox>
										{CATEGORIES.map((cat) => (
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
									variant="secondary"
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

								{/* Color chips */}
								<div className="flex items-center gap-2 flex-wrap">
									{FOLDER_COLOR_PRESETS.map((p) => {
										const isSelected =
											p.value === ""
												? !color
												: color.toLowerCase() === p.value.toLowerCase();
										return (
											<button
												key={p.name}
												type="button"
												title={p.name}
												onClick={() => setColor(p.value)}
												className={`relative w-7 h-7 rounded-full transition-all flex items-center justify-center cursor-pointer border ${
													isSelected
														? "ring-2 ring-accent ring-offset-2 scale-110 shadow-sm border-transparent"
														: "border-border/60 hover:scale-105 opacity-85 hover:opacity-100"
												}`}
												style={{
													backgroundColor:
														p.value || "var(--surface-secondary)",
												}}
											>
												{isSelected && (
													<Check
														className={`w-3.5 h-3.5 ${
															p.value
																? "text-white drop-shadow-sm"
																: "text-foreground"
														}`}
													/>
												)}
											</button>
										);
									})}

									{/* Custom Color Input */}
									<label
										title="自定义颜色"
										className={`relative w-7 h-7 rounded-full flex items-center justify-center cursor-pointer border border-dashed border-border/80 hover:border-accent hover:scale-105 transition-all ${
											color &&
											!FOLDER_COLOR_PRESETS.some(
												(p) => p.value.toLowerCase() === color.toLowerCase(),
											)
												? "ring-2 ring-accent ring-offset-2 scale-110 shadow-sm"
												: ""
										}`}
										style={{
											backgroundColor:
												color &&
												!FOLDER_COLOR_PRESETS.some(
													(p) => p.value.toLowerCase() === color.toLowerCase(),
												)
													? color
													: undefined,
										}}
									>
										<Palette
											className={`w-3.5 h-3.5 ${
												color &&
												!FOLDER_COLOR_PRESETS.some(
													(p) => p.value.toLowerCase() === color.toLowerCase(),
												)
													? "text-white drop-shadow-sm"
													: "text-muted"
											}`}
										/>
										<input
											type="color"
											value={color || "#4f46e5"}
											onChange={(e) => setColor(e.target.value)}
											className="sr-only"
										/>
									</label>
								</div>

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
