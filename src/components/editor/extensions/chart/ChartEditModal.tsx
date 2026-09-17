import { Button, Modal } from "@heroui/react";
import { Plus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	buildChartOption,
	CHART_TYPE_OPTIONS,
	type ChartSpec,
	type ChartType,
	echarts,
} from "./chartSpec";

export interface ChartEditModalProps {
	isOpen: boolean;
	initialSpec: ChartSpec;
	onSave: (spec: ChartSpec) => void;
	onClose: () => void;
}

interface EditableSeries {
	id: string;
	name: string;
}

interface EditableRow {
	id: string;
	category: string;
	values: number[];
}

/**
 * 图表数据编辑弹层：类型切换 + 标题 + 数据网格（类目 × 系列）+ 实时预览。
 * 编辑态用带稳定 id 的行/列模型，保存时再收敛回 ChartSpec。
 */
export function ChartEditModal({
	isOpen,
	initialSpec,
	onSave,
	onClose,
}: ChartEditModalProps) {
	const idCounterRef = useRef(0);
	const nextId = useCallback(() => `c${++idCounterRef.current}`, []);

	const [chartType, setChartType] = useState<ChartType>(initialSpec.type);
	const [title, setTitle] = useState(initialSpec.title ?? "");
	const [seriesList, setSeriesList] = useState<EditableSeries[]>([]);
	const [rows, setRows] = useState<EditableRow[]>([]);
	const previewRef = useRef<HTMLDivElement>(null);
	const previewInstanceRef = useRef<echarts.ECharts | null>(null);

	// 弹层每次打开时重置为当前节点的数据
	useEffect(() => {
		if (!isOpen) return;
		setChartType(initialSpec.type);
		setTitle(initialSpec.title ?? "");
		setSeriesList(
			initialSpec.series.map((s) => ({ id: nextId(), name: s.name })),
		);
		setRows(
			initialSpec.categories.map((category, i) => ({
				id: nextId(),
				category,
				values: initialSpec.series.map((s) => s.data[i] ?? 0),
			})),
		);
	}, [isOpen, initialSpec, nextId]);

	const spec = useMemo<ChartSpec>(
		() => ({
			type: chartType,
			title,
			categories: rows.map((r) => r.category),
			series: seriesList.map((s, i) => ({
				name: s.name,
				data: rows.map((r) => r.values[i] ?? 0),
			})),
		}),
		[chartType, title, rows, seriesList],
	);

	// 实时预览
	useEffect(() => {
		if (!isOpen) return;
		const container = previewRef.current;
		if (!container) return;
		if (!previewInstanceRef.current) {
			previewInstanceRef.current = echarts.init(container);
		}
		previewInstanceRef.current.setOption(buildChartOption(spec), {
			notMerge: true,
		});
	}, [isOpen, spec]);

	useEffect(() => {
		if (!isOpen && previewInstanceRef.current) {
			previewInstanceRef.current.dispose();
			previewInstanceRef.current = null;
		}
	}, [isOpen]);

	const isPie = chartType === "pie";

	const setRowCategory = (rowId: string, value: string) =>
		setRows((prev) =>
			prev.map((r) => (r.id === rowId ? { ...r, category: value } : r)),
		);

	const setCellValue = (rowId: string, seriesIndex: number, value: string) =>
		setRows((prev) =>
			prev.map((r) =>
				r.id === rowId
					? {
							...r,
							values: r.values.map((v, i) =>
								i === seriesIndex ? Number(value) || 0 : v,
							),
						}
					: r,
			),
		);

	const setSeriesName = (seriesId: string, value: string) =>
		setSeriesList((prev) =>
			prev.map((s) => (s.id === seriesId ? { ...s, name: value } : s)),
		);

	const addRow = () =>
		setRows((prev) => [
			...prev,
			{
				id: nextId(),
				category: `类目 ${prev.length + 1}`,
				values: seriesList.map(() => 0),
			},
		]);

	const removeRow = (rowId: string) =>
		setRows((prev) => prev.filter((r) => r.id !== rowId));

	const addSeries = () => {
		setSeriesList((prev) => [
			...prev,
			{ id: nextId(), name: `系列 ${prev.length + 1}` },
		]);
		setRows((prev) => prev.map((r) => ({ ...r, values: [...r.values, 0] })));
	};

	const removeSeries = (seriesIndex: number) => {
		setSeriesList((prev) => prev.filter((_, i) => i !== seriesIndex));
		setRows((prev) =>
			prev.map((r) => ({
				...r,
				values: r.values.filter((_, i) => i !== seriesIndex),
			})),
		);
	};

	const gridTemplateColumns = useMemo(
		() =>
			`minmax(90px, 1fr) ${seriesList.map(() => "minmax(70px, 1fr)").join(" ")} 32px`,
		[seriesList],
	);

	const cellInputClass =
		"h-8 w-full rounded border border-zinc-200 bg-white px-2 text-sm outline-none focus:border-accent";

	return (
		<Modal.Backdrop
			isOpen={isOpen}
			onOpenChange={(open) => !open && onClose()}
			variant="blur"
		>
			<Modal.Container size="lg" className="w-full">
				<Modal.Dialog
					aria-label="编辑图表"
					className="!max-w-3xl w-full flex flex-col"
				>
					<Modal.CloseTrigger />
					<Modal.Header>
						<Modal.Heading>编辑图表</Modal.Heading>
					</Modal.Header>
					<Modal.Body className="flex flex-col gap-4 overflow-y-auto">
						<div className="flex flex-wrap items-center gap-2">
							{CHART_TYPE_OPTIONS.map((option) => (
								<button
									key={option.value}
									type="button"
									onClick={() => setChartType(option.value)}
									className={`h-8 rounded-md border px-3 text-sm transition-colors ${
										chartType === option.value
											? "border-accent bg-accent/10 text-accent"
											: "border-zinc-200 text-zinc-600 hover:border-zinc-300"
									}`}
								>
									{option.label}
								</button>
							))}
							<input
								value={title}
								onChange={(e) => setTitle(e.target.value)}
								placeholder="图表标题（可选）"
								className="ml-auto h-8 w-48 rounded-md border border-zinc-200 px-2 text-sm outline-none focus:border-accent"
							/>
						</div>

						<div
							ref={previewRef}
							className="h-56 w-full rounded-lg border border-zinc-100 bg-zinc-50/50"
						/>

						<div className="flex flex-col gap-1">
							<div
								className="grid items-center gap-1"
								style={{ gridTemplateColumns }}
							>
								<span className="px-1 text-xs text-zinc-400">
									{isPie ? "扇区名称" : "类目"}
								</span>
								{seriesList.map((s, seriesIndex) => (
									<div key={s.id} className="flex items-center gap-1">
										<input
											value={s.name}
											onChange={(e) => setSeriesName(s.id, e.target.value)}
											placeholder={`系列 ${seriesIndex + 1}`}
											className={`${cellInputClass} font-medium`}
										/>
										{seriesList.length > 1 && !isPie && (
											<button
												type="button"
												title="删除该系列"
												className="shrink-0 text-zinc-300 hover:text-red-500"
												onClick={() => removeSeries(seriesIndex)}
											>
												<X className="h-3.5 w-3.5" />
											</button>
										)}
									</div>
								))}
								<span />
							</div>
							{rows.map((row) => (
								<div
									key={row.id}
									className="grid items-center gap-1"
									style={{ gridTemplateColumns }}
								>
									<input
										value={row.category}
										onChange={(e) => setRowCategory(row.id, e.target.value)}
										className={cellInputClass}
									/>
									{seriesList.map((s, seriesIndex) => (
										<input
											key={s.id}
											type="number"
											value={row.values[seriesIndex] ?? 0}
											onChange={(e) =>
												setCellValue(row.id, seriesIndex, e.target.value)
											}
											className={cellInputClass}
										/>
									))}
									<button
										type="button"
										title="删除该行"
										className="flex h-8 items-center justify-center text-zinc-300 hover:text-red-500"
										onClick={() => removeRow(row.id)}
									>
										<X className="h-4 w-4" />
									</button>
								</div>
							))}
							<div className="mt-1 flex items-center gap-2">
								<button
									type="button"
									className="flex h-7 items-center gap-1 rounded-md border border-dashed border-zinc-300 px-2 text-xs text-zinc-500 hover:border-accent hover:text-accent"
									onClick={addRow}
								>
									<Plus className="h-3.5 w-3.5" />
									{isPie ? "添加扇区" : "添加类目"}
								</button>
								{!isPie && (
									<button
										type="button"
										className="flex h-7 items-center gap-1 rounded-md border border-dashed border-zinc-300 px-2 text-xs text-zinc-500 hover:border-accent hover:text-accent"
										onClick={addSeries}
									>
										<Plus className="h-3.5 w-3.5" />
										添加系列
									</button>
								)}
							</div>
						</div>
					</Modal.Body>
					<Modal.Footer>
						<Button variant="ghost" onPress={onClose}>
							取消
						</Button>
						<Button variant="primary" onPress={() => onSave(spec)}>
							保存
						</Button>
					</Modal.Footer>
				</Modal.Dialog>
			</Modal.Container>
		</Modal.Backdrop>
	);
}
