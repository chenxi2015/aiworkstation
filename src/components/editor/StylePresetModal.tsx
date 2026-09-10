import { Check, Plus, RotateCcw, Sliders, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
	getWorkbenchSettings,
	saveWorkbenchSettings,
} from "../../server/functions/workbench";
import { DEFAULT_STYLE_PRESETS, type EditorStylePreset } from "./types";

export interface StylePresetModalProps {
	isOpen: boolean;
	onClose: () => void;
	/** 预设列表更新后的回调，通知父组件同步下拉菜单 */
	onPresetsUpdated?: (presets: EditorStylePreset[]) => void;
}

export function StylePresetModal({
	isOpen,
	onClose,
	onPresetsUpdated,
}: StylePresetModalProps) {
	const [presets, setPresets] = useState<EditorStylePreset[]>(
		DEFAULT_STYLE_PRESETS,
	);
	const [selectedId, setSelectedId] = useState<string>("official");
	const [saving, setSaving] = useState(false);
	const [savedSuccess, setSavedSuccess] = useState(false);

	// 打开时从 SQLite 读取当前配置
	useEffect(() => {
		if (!isOpen) return;
		(async () => {
			try {
				const settings = await getWorkbenchSettings();
				if (
					settings?.editorStylePresets &&
					Array.isArray(settings.editorStylePresets) &&
					settings.editorStylePresets.length > 0
				) {
					setPresets(settings.editorStylePresets);
					setSelectedId(settings.editorStylePresets[0]?.id ?? "official");
				} else {
					setPresets(DEFAULT_STYLE_PRESETS);
					setSelectedId("official");
				}
			} catch (err) {
				console.warn("[StylePresetModal] Failed to load settings:", err);
			}
		})();
	}, [isOpen]);

	const currentPreset = presets.find((p) => p.id === selectedId) ?? presets[0];

	const handleUpdateField = useCallback(
		(field: keyof EditorStylePreset, value: string) => {
			if (!currentPreset) return;
			setPresets((prev) =>
				prev.map((p) =>
					p.id === currentPreset.id ? { ...p, [field]: value } : p,
				),
			);
		},
		[currentPreset],
	);

	const handleAddCustom = useCallback(() => {
		const newId = `custom_${Date.now().toString(36)}`;
		const newPreset: EditorStylePreset = {
			id: newId,
			label: "新风格预设",
			description: "自定义行文调性描述",
			promptRules: "请按以下要求改写文本：保持通俗易懂，结构紧凑。",
			isBuiltin: false,
		};
		setPresets((prev) => [...prev, newPreset]);
		setSelectedId(newId);
	}, []);

	const handleDelete = useCallback(
		(id: string) => {
			setPresets((prev) => prev.filter((p) => p.id !== id));
			if (selectedId === id) {
				setSelectedId(presets[0]?.id ?? "official");
			}
		},
		[selectedId, presets],
	);

	const handleResetDefaults = useCallback(() => {
		if (window.confirm("确定恢复为默认的 4 大内置行文风格吗？")) {
			setPresets(DEFAULT_STYLE_PRESETS);
			setSelectedId("official");
		}
	}, []);

	const handleSave = useCallback(async () => {
		setSaving(true);
		try {
			const current = (await getWorkbenchSettings()) || {
				apiKey: "",
				baseUrl: "",
				model: "",
				batchSize: 5,
				concurrency: 2,
			};
			await saveWorkbenchSettings({
				data: {
					...current,
					editorStylePresets: presets,
				},
			});
			setSavedSuccess(true);
			onPresetsUpdated?.(presets);
			setTimeout(() => {
				setSavedSuccess(false);
				onClose();
			}, 600);
		} catch (err) {
			window.alert(err instanceof Error ? err.message : "保存设置失败");
		} finally {
			setSaving(false);
		}
	}, [presets, onPresetsUpdated, onClose]);

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
			<div className="bg-surface dark:bg-background border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
				{/* 头部 */}
				<div className="flex items-center justify-between px-5 py-4 border-b border-border">
					<div className="flex items-center gap-2">
						<Sliders className="w-5 h-5 text-accent" />
						<h2 className="text-base font-semibold">行文风格模板设置</h2>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-muted/10 transition-colors cursor-pointer"
					>
						<X className="w-4 h-4" />
					</button>
				</div>

				{/* 主内容 */}
				<div className="flex-1 flex overflow-hidden min-h-[380px]">
					{/* 左侧预设列表 */}
					<aside className="w-52 border-r border-border p-3 flex flex-col justify-between bg-surface-secondary/20">
						<div className="space-y-1 overflow-y-auto flex-1">
							{presets.map((preset) => (
								<button
									key={preset.id}
									type="button"
									onClick={() => setSelectedId(preset.id)}
									className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center justify-between ${
										selectedId === preset.id
											? "bg-accent/15 text-accent font-semibold"
											: "text-muted hover:text-foreground hover:bg-muted/10"
									}`}
								>
									<span className="truncate">{preset.label}</span>
									{!preset.isBuiltin && (
										<button
											type="button"
											title="删除预设"
											onClick={(e) => {
												e.stopPropagation();
												handleDelete(preset.id);
											}}
											className="p-1 text-muted hover:text-danger rounded cursor-pointer"
										>
											<Trash2 className="w-3 h-3" />
										</button>
									)}
								</button>
							))}
						</div>

						<div className="pt-3 border-t border-border space-y-1.5">
							<button
								type="button"
								onClick={handleAddCustom}
								className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-secondary border border-border text-xs text-foreground hover:bg-muted/20 transition-colors cursor-pointer"
							>
								<Plus className="w-3.5 h-3.5" />
								新建风格
							</button>
							<button
								type="button"
								onClick={handleResetDefaults}
								className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] text-muted hover:text-foreground transition-colors cursor-pointer"
							>
								<RotateCcw className="w-3 h-3" />
								恢复内置默认
							</button>
						</div>
					</aside>

					{/* 右侧预设编辑表单 */}
					<div className="flex-1 p-5 overflow-y-auto space-y-4">
						{currentPreset && (
							<>
								<div className="space-y-1.5">
									<label
										htmlFor="preset-label-input"
										className="text-xs font-medium text-foreground"
									>
										模板名称
									</label>
									<input
										id="preset-label-input"
										type="text"
										value={currentPreset.label}
										onChange={(e) => handleUpdateField("label", e.target.value)}
										className="w-full bg-surface-secondary border border-border rounded-lg px-3 py-1.5 text-xs outline-none focus:border-accent"
									/>
								</div>

								<div className="space-y-1.5">
									<label
										htmlFor="preset-desc-input"
										className="text-xs font-medium text-foreground"
									>
										功能简介描述
									</label>
									<input
										id="preset-desc-input"
										type="text"
										value={currentPreset.description}
										onChange={(e) =>
											handleUpdateField("description", e.target.value)
										}
										className="w-full bg-surface-secondary border border-border rounded-lg px-3 py-1.5 text-xs outline-none focus:border-accent"
									/>
								</div>

								<div className="space-y-1.5">
									<div className="flex items-center justify-between">
										<label
											htmlFor="preset-rules-textarea"
											className="text-xs font-medium text-foreground"
										>
											Prompt 改写规则指令
										</label>
										<span className="text-[10px] text-muted">
											注入 AI bar 与改写任务
										</span>
									</div>
									<textarea
										id="preset-rules-textarea"
										rows={7}
										value={currentPreset.promptRules}
										onChange={(e) =>
											handleUpdateField("promptRules", e.target.value)
										}
										className="w-full bg-surface-secondary border border-border rounded-lg p-3 text-xs outline-none focus:border-accent resize-none leading-relaxed font-mono"
									/>
								</div>
							</>
						)}
					</div>
				</div>

				{/* 底部保存按钮 */}
				<div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-surface-secondary/20">
					<button
						type="button"
						onClick={onClose}
						className="px-3.5 py-1.5 rounded-lg border border-border text-xs text-muted hover:text-foreground transition-colors cursor-pointer"
					>
						取消
					</button>
					<button
						type="button"
						disabled={saving}
						onClick={handleSave}
						className="px-4 py-1.5 rounded-lg bg-accent text-accent-foreground text-xs font-medium hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
					>
						{savedSuccess ? (
							<>
								<Check className="w-3.5 h-3.5 text-success" />
								已保存
							</>
						) : (
							"保存配置"
						)}
					</button>
				</div>
			</div>
		</div>
	);
}
