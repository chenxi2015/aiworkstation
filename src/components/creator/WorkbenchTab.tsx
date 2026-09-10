import { Button, TextArea, toast } from "@heroui/react";
import {
	CheckCircle2,
	Copy,
	Library,
	Loader2,
	Paperclip,
	RefreshCw,
	Save,
	Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	adoptDraftRpc,
	generateDraftsRpc,
	updateMaterialRpc,
} from "../../services/api/creatorClient";
import { AiMarkdownRenderer } from "../workbench/ai/shared/AiMarkdownRenderer";
import {
	DRAFT_PLATFORMS,
	type DraftPlatform,
	type DraftVariant,
	type Material,
	PLATFORM_LABELS,
} from "./types";

interface WorkbenchTabProps {
	materials: Material[];
	loading: boolean;
	selectedMaterialId: number | null;
	onSelectMaterial: (id: number) => void;
	onChanged: () => Promise<void>;
	onGoMaterials: () => void;
}

interface VariantState extends DraftVariant {
	regenerating?: boolean;
	adopted?: boolean;
}

/** 生成变体的本地持久化 key（按素材隔离，刷新/切换 Tab 后可恢复） */
const variantsStorageKey = (materialId: number) =>
	`creator_workbench_variants_${materialId}`;

/**
 * 二创工作台 Tab（默认落点）：
 * 左侧选中素材 + note 批注；右侧平台选择 + 生成 + 结果卡片（单条重生成 / 采纳进草稿）
 */
export function WorkbenchTab({
	materials,
	loading,
	selectedMaterialId,
	onSelectMaterial,
	onChanged,
	onGoMaterials,
}: WorkbenchTabProps) {
	const selected = useMemo(
		() => materials.find((m) => m.id === selectedMaterialId) ?? null,
		[materials, selectedMaterialId],
	);

	const [noteDraft, setNoteDraft] = useState<string | null>(null);
	const [savingNote, setSavingNote] = useState(false);
	const [platforms, setPlatforms] = useState<DraftPlatform[]>([
		...DRAFT_PLATFORMS,
	]);
	const [variants, setVariants] = useState<VariantState[]>([]);
	const [generating, setGenerating] = useState(false);
	const hydratedKeyRef = useRef<string | null>(null);

	const storageKey = selected ? variantsStorageKey(selected.id) : null;

	// 切换素材/重新挂载时从 localStorage 恢复上次生成的变体，之后随变更写回
	useEffect(() => {
		if (!storageKey) return;
		if (hydratedKeyRef.current !== storageKey) {
			hydratedKeyRef.current = storageKey;
			try {
				const raw = localStorage.getItem(storageKey);
				setVariants(raw ? (JSON.parse(raw) as VariantState[]) : []);
			} catch {
				setVariants([]);
			}
			return;
		}
		if (variants.length === 0) {
			localStorage.removeItem(storageKey);
			return;
		}
		localStorage.setItem(
			storageKey,
			JSON.stringify(variants.map(({ regenerating, ...rest }) => rest)),
		);
	}, [storageKey, variants]);

	const noteValue = noteDraft ?? selected?.note ?? "";

	const togglePlatform = (p: DraftPlatform) => {
		setPlatforms((prev) =>
			prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
		);
	};

	const handleSaveNote = async () => {
		if (!selected) return;
		setSavingNote(true);
		try {
			await updateMaterialRpc({
				id: selected.id,
				note: noteValue.trim() || null,
			});
			setNoteDraft(null);
			toast.success("批注已保存");
			await onChanged();
		} catch (err) {
			toast.danger(
				`保存失败：${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setSavingNote(false);
		}
	};

	const handleGenerate = async () => {
		if (!selected || platforms.length === 0) return;
		setGenerating(true);
		setVariants([]);
		try {
			const { variants: result } = await generateDraftsRpc({
				materialId: selected.id,
				platforms,
			});
			setVariants(result);
			toast.success(`已生成 ${result.length} 个平台变体`);
		} catch (err) {
			toast.danger(
				`生成失败：${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setGenerating(false);
		}
	};

	const handleRegenerate = async (platform: DraftPlatform) => {
		if (!selected) return;
		setVariants((prev) =>
			prev.map((v) =>
				v.platform === platform ? { ...v, regenerating: true } : v,
			),
		);
		try {
			const { variants: result } = await generateDraftsRpc({
				materialId: selected.id,
				platforms: [platform],
			});
			const fresh = result.find((v) => v.platform === platform);
			if (!fresh) throw new Error("AI 未返回该平台的变体");
			setVariants((prev) =>
				prev.map((v) =>
					v.platform === platform
						? { ...fresh, regenerating: false, adopted: false }
						: v,
				),
			);
		} catch (err) {
			toast.danger(
				`重生成失败：${err instanceof Error ? err.message : String(err)}`,
			);
			setVariants((prev) =>
				prev.map((v) =>
					v.platform === platform ? { ...v, regenerating: false } : v,
				),
			);
		}
	};

	const handleAdopt = async (variant: VariantState) => {
		if (!selected || variant.adopted) return;
		try {
			await adoptDraftRpc({
				materialId: selected.id,
				platform: variant.platform,
				content: variant.content,
			});
			setVariants((prev) =>
				prev.map((v) =>
					v.platform === variant.platform ? { ...v, adopted: true } : v,
				),
			);
			toast.success(`已采纳进草稿箱（${PLATFORM_LABELS[variant.platform]}）`);
			await onChanged();
		} catch (err) {
			toast.danger(
				`采纳失败：${err instanceof Error ? err.message : String(err)}`,
			);
		}
	};

	const handleCopy = async (variant: VariantState) => {
		try {
			await navigator.clipboard.writeText(variant.content);
			toast.success("已复制到剪贴板");
		} catch {
			toast.danger("复制失败，请手动选择文本复制");
		}
	};

	if (!loading && materials.length === 0) {
		return (
			<div className="flex-1 flex items-center justify-center p-8">
				<div className="max-w-sm text-center">
					<Library className="w-8 h-8 text-muted mx-auto mb-3" />
					<p className="text-sm font-medium text-foreground">还没有可用素材</p>
					<p className="text-xs text-muted mt-1.5 leading-relaxed">
						先去素材库从书签导入或手动新建一条素材，再回到这里一键生成多平台草稿
					</p>
					<Button
						type="button"
						variant="primary"
						size="sm"
						className="rounded-full mt-4 cursor-pointer"
						onPress={onGoMaterials}
					>
						前往素材库
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="flex-1 flex min-h-0">
			{/* 左栏：素材选择 + 批注 */}
			<aside className="w-[380px] shrink-0 border-r border-border flex flex-col min-h-0">
				<div className="px-4 py-3 border-b border-border shrink-0">
					<p className="text-[11px] font-semibold text-muted uppercase tracking-wide">
						选择素材
					</p>
				</div>
				<div className="max-h-44 overflow-y-auto shrink-0 border-b border-border p-2 flex flex-col gap-1">
					{materials.map((material) => {
						const active = material.id === selectedMaterialId;
						return (
							<button
								key={material.id}
								type="button"
								onClick={() => onSelectMaterial(material.id)}
								className={`w-full text-left px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer ${
									active
										? "bg-accent/10 text-accent font-medium"
										: "text-foreground/80 hover:bg-surface-secondary/60"
								}`}
							>
								<span className="block truncate">{material.title}</span>
							</button>
						);
					})}
				</div>
				{selected && (
					<div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-3">
						<div>
							<p className="text-sm font-semibold text-foreground leading-snug">
								{selected.title}
							</p>
							{selected.assets && selected.assets.length > 0 && (
								<p className="mt-1 flex items-center gap-1 text-[10px] text-muted">
									<Paperclip className="w-3 h-3" />
									{selected.assets.map((a) => a.filename).join("、")}
								</p>
							)}
						</div>
						<div className="px-3 py-2.5 rounded-xl bg-surface-secondary/50 border border-border max-h-52 overflow-y-auto">
							<AiMarkdownRenderer content={selected.content} compact />
						</div>
						<div className="flex flex-col gap-1.5">
							<label
								htmlFor="creator-material-note"
								className="text-[11px] font-medium text-foreground"
							>
								创作意图批注
								<span className="ml-1.5 text-[10px] text-muted font-normal">
									注入二创 prompt，比正文更影响成稿角度
								</span>
							</label>
							<TextArea
								id="creator-material-note"
								value={noteValue}
								onChange={(e) => setNoteDraft(e.target.value)}
								placeholder="我想用这条素材表达什么…"
								variant="secondary"
								rows={3}
							/>
							{noteDraft !== null && noteDraft !== (selected.note ?? "") && (
								<Button
									type="button"
									variant="secondary"
									size="sm"
									className="rounded-full self-end h-7 text-[11px] flex items-center gap-1 cursor-pointer"
									isDisabled={savingNote}
									onPress={handleSaveNote}
								>
									{savingNote ? (
										<Loader2 className="w-3 h-3 animate-spin" />
									) : (
										<Save className="w-3 h-3" />
									)}
									保存批注
								</Button>
							)}
						</div>
					</div>
				)}
			</aside>

			{/* 右栏：平台选择 + 生成 + 结果卡片 */}
			<section className="flex-1 min-w-0 flex flex-col min-h-0">
				<div className="px-5 py-3 border-b border-border shrink-0 flex flex-wrap items-center gap-2">
					<span className="text-[11px] font-semibold text-muted uppercase tracking-wide mr-1">
						目标平台
					</span>
					{DRAFT_PLATFORMS.map((p) => {
						const checked = platforms.includes(p);
						return (
							<button
								key={p}
								type="button"
								onClick={() => togglePlatform(p)}
								className={`px-3 py-1.5 rounded-full text-[11px] font-medium border transition-colors cursor-pointer ${
									checked
										? "border-accent bg-accent/10 text-accent"
										: "border-border text-muted hover:text-foreground"
								}`}
							>
								{PLATFORM_LABELS[p]}
							</button>
						);
					})}
					<Button
						type="button"
						variant="primary"
						size="sm"
						className="rounded-full ml-auto flex items-center gap-1.5 cursor-pointer"
						isDisabled={!selected || platforms.length === 0 || generating}
						onPress={handleGenerate}
					>
						{generating ? (
							<Loader2 className="w-3.5 h-3.5 animate-spin" />
						) : (
							<Sparkles className="w-3.5 h-3.5" />
						)}
						{generating ? "AI 二创中…" : "一键生成"}
					</Button>
				</div>

				<div className="flex-1 min-h-0 overflow-y-auto p-5">
					{generating ? (
						<div className="h-full flex flex-col items-center justify-center gap-2 text-xs text-muted">
							<Loader2 className="w-5 h-5 animate-spin" />
							<span>
								正在为「{selected?.title}」生成 {platforms.length} 个平台变体…
							</span>
						</div>
					) : variants.length === 0 ? (
						<div className="h-full flex items-center justify-center">
							<p className="text-xs text-muted text-center leading-relaxed">
								选好平台后点击「一键生成」
								<br />
								AI 会为每个平台产出一条变体，采纳后进入草稿箱人工审稿
							</p>
						</div>
					) : (
						<div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
							{variants.map((variant) => (
								<div
									key={variant.platform}
									className="flex flex-col rounded-2xl border border-border bg-surface-secondary/40"
								>
									<div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
										<span className="px-2 py-0.5 rounded-md bg-accent/10 text-accent text-[10px] font-semibold">
											{PLATFORM_LABELS[variant.platform]}
										</span>
										<div className="ml-auto flex items-center gap-1">
											<Button
												type="button"
												variant="ghost"
												size="sm"
												className="rounded-full h-7 text-[11px] flex items-center gap-1 cursor-pointer"
												isDisabled={variant.regenerating}
												onPress={() => handleCopy(variant)}
											>
												<Copy className="w-3 h-3" />
												复制
											</Button>
											<Button
												type="button"
												variant="ghost"
												size="sm"
												className="rounded-full h-7 text-[11px] flex items-center gap-1 cursor-pointer"
												isDisabled={variant.regenerating}
												onPress={() => handleRegenerate(variant.platform)}
											>
												{variant.regenerating ? (
													<Loader2 className="w-3 h-3 animate-spin" />
												) : (
													<RefreshCw className="w-3 h-3" />
												)}
												重生成
											</Button>
											<Button
												type="button"
												variant={variant.adopted ? "ghost" : "primary"}
												size="sm"
												className="rounded-full h-7 text-[11px] flex items-center gap-1 cursor-pointer"
												isDisabled={variant.adopted || variant.regenerating}
												onPress={() => handleAdopt(variant)}
											>
												<CheckCircle2 className="w-3 h-3" />
												{variant.adopted ? "已采纳" : "采纳进草稿"}
											</Button>
										</div>
									</div>
									<div className="p-4 max-h-80 overflow-y-auto">
										<AiMarkdownRenderer content={variant.content} compact />
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			</section>
		</div>
	);
}
