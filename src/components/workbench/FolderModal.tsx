import { type FormEvent, useEffect, useState } from "react";
import type { Folder } from "./types";
import { CATEGORIES } from "./types";

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
	const [error, setError] = useState("");

	const isEdit = !!folder;

	useEffect(() => {
		if (isOpen) {
			if (folder) {
				setName(folder.name);
				setCategory(folder.category);
				setDesc(folder.desc || "");
			} else {
				setName("");
				setCategory(defaultCategory || "工作台");
				setDesc("");
			}
			setError("");
		}
	}, [isOpen, folder, defaultCategory]);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (!isOpen) return;
			if (e.key === "Escape") {
				onClose();
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, onClose]);

	if (!isOpen) return null;

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
		<div
			role="dialog"
			aria-modal="true"
			className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200"
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
			onKeyDown={(e) => {
				if (e.key === "Escape") onClose();
			}}
		>
			<div className="w-full max-w-md bg-[var(--surface,oklch(1_0_0))] rounded-3xl border border-[var(--border,oklch(0.9_0.004_286.32))] shadow-2xl p-7 animate-in zoom-in-95 duration-200">
				<h2 className="text-lg font-bold text-[var(--foreground,oklch(0.21_0.006_285.89))] mb-5 tracking-tight">
					{isEdit ? "编辑文件夹" : "新建文件夹"}
				</h2>

				<form onSubmit={handleSubmit} className="space-y-4">
					{/* Name Field */}
					<div>
						<label
							htmlFor="folder-name-input"
							className="block text-xs font-semibold text-[var(--foreground,oklch(0.21_0.006_285.89))] mb-1.5"
						>
							文件夹名称{" "}
							<span className="text-[var(--danger,oklch(0.65_0.23_25.74))]">
								*
							</span>
						</label>
						<input
							id="folder-name-input"
							type="text"
							value={name}
							onChange={(e) => {
								setName(e.target.value);
								if (error) setError("");
							}}
							placeholder="例如：内容创作工具集"
							maxLength={30}
							className="w-full px-3.5 py-2 text-sm rounded-xl border border-[var(--border,oklch(0.9_0.004_286.32))] bg-[var(--surface,oklch(1_0_0))] text-[var(--foreground,oklch(0.21_0.006_285.89))] focus:outline-none focus:border-[var(--accent,oklch(0.62_0.195_253.83))] focus:ring-3 focus:ring-[var(--accent-soft,rgba(99,102,241,0.15))] transition-all"
						/>
						{error && (
							<p className="text-[11px] text-[var(--danger,oklch(0.65_0.23_25.74))] mt-1 font-medium">
								{error}
							</p>
						)}
					</div>

					{/* Category Select */}
					<div>
						<label
							htmlFor="folder-category-select"
							className="block text-xs font-semibold text-[var(--foreground,oklch(0.21_0.006_285.89))] mb-1.5"
						>
							所属分类
						</label>
						<select
							id="folder-category-select"
							value={category}
							onChange={(e) => setCategory(e.target.value)}
							className="w-full px-3.5 py-2 text-sm rounded-xl border border-[var(--border,oklch(0.9_0.004_286.32))] bg-[var(--surface,oklch(1_0_0))] text-[var(--foreground,oklch(0.21_0.006_285.89))] focus:outline-none focus:border-[var(--accent,oklch(0.62_0.195_253.83))] focus:ring-3 focus:ring-[var(--accent-soft,rgba(99,102,241,0.15))] transition-all cursor-pointer"
						>
							{CATEGORIES.map((cat) => (
								<option key={cat} value={cat}>
									{cat}
								</option>
							))}
						</select>
					</div>

					{/* Description Field */}
					<div>
						<label
							htmlFor="folder-desc-input"
							className="block text-xs font-semibold text-[var(--foreground,oklch(0.21_0.006_285.89))] mb-1.5"
						>
							描述（可选）
						</label>
						<textarea
							id="folder-desc-input"
							value={desc}
							onChange={(e) => setDesc(e.target.value)}
							placeholder="这个文件夹用来归集什么？"
							maxLength={120}
							rows={3}
							className="w-full px-3.5 py-2 text-sm rounded-xl border border-[var(--border,oklch(0.9_0.004_286.32))] bg-[var(--surface,oklch(1_0_0))] text-[var(--foreground,oklch(0.21_0.006_285.89))] focus:outline-none focus:border-[var(--accent,oklch(0.62_0.195_253.83))] focus:ring-3 focus:ring-[var(--accent-soft,rgba(99,102,241,0.15))] transition-all resize-none"
						/>
					</div>

					{/* Actions */}
					<div className="flex items-center justify-between pt-3">
						<div>
							{isEdit && (
								<button
									type="button"
									onClick={handleDelete}
									className="px-3.5 py-2 rounded-full text-xs font-medium text-[var(--danger,oklch(0.65_0.23_25.74))] hover:bg-[var(--danger-soft,rgba(239,68,68,0.1))] transition-colors cursor-pointer border border-transparent hover:border-[var(--danger-soft,rgba(239,68,68,0.2))]"
								>
									删除
								</button>
							)}
						</div>

						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={onClose}
								className="px-4 py-2 rounded-full text-xs font-medium text-[var(--foreground,oklch(0.21_0.006_285.89))] border border-[var(--border,oklch(0.9_0.004_286.32))] hover:bg-[var(--surface-secondary,oklch(0.96_0.001_286.37))] transition-colors cursor-pointer"
							>
								取消
							</button>
							<button
								type="submit"
								className="px-5 py-2 rounded-full text-xs font-medium bg-[var(--accent,oklch(0.62_0.195_253.83))] text-[var(--accent-foreground,#ffffff)] hover:opacity-90 shadow-md hover:shadow-lg active:scale-97 transition-all cursor-pointer"
							>
								{isEdit ? "保存" : "创建"}
							</button>
						</div>
					</div>
				</form>
			</div>
		</div>
	);
}
