import { BarChart, LineChart, PieChart, RadarChart } from "echarts/charts";
import {
	GridComponent,
	LegendComponent,
	TitleComponent,
	TooltipComponent,
} from "echarts/components";
import type { EChartsCoreOption } from "echarts/core";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
	BarChart,
	LineChart,
	PieChart,
	RadarChart,
	GridComponent,
	LegendComponent,
	TitleComponent,
	TooltipComponent,
	CanvasRenderer,
]);

export { echarts };

export type ChartType = "bar" | "line" | "area" | "pie" | "radar";

export const CHART_TYPE_OPTIONS: { value: ChartType; label: string }[] = [
	{ value: "bar", label: "柱状图" },
	{ value: "line", label: "折线图" },
	{ value: "area", label: "面积图" },
	{ value: "pie", label: "饼图" },
	{ value: "radar", label: "雷达图" },
];

export interface ChartSeriesItem {
	name: string;
	data: number[];
}

/**
 * 图表数据模型（存进 TipTap 节点 attrs 的简化 spec）：
 * - categories：类目轴 / 饼图扇区名 / 雷达图维度
 * - series：数据系列；饼图取第一个系列
 */
export interface ChartSpec {
	type: ChartType;
	title?: string;
	categories: string[];
	series: ChartSeriesItem[];
}

export const DEFAULT_CHART_SPEC: ChartSpec = {
	type: "bar",
	title: "",
	categories: ["一月", "二月", "三月", "四月"],
	series: [
		{ name: "系列 1", data: [120, 200, 150, 80] },
		{ name: "系列 2", data: [60, 100, 140, 180] },
	],
};

/** 节点 attrs 里是 JSON 字符串，这里容错解析（损坏时回退默认样例） */
export function parseChartSpec(raw: unknown): ChartSpec {
	if (raw && typeof raw === "object") return normalizeSpec(raw as ChartSpec);
	if (typeof raw === "string" && raw.trim()) {
		try {
			return normalizeSpec(JSON.parse(raw) as ChartSpec);
		} catch {
			// fallthrough
		}
	}
	return structuredClone(DEFAULT_CHART_SPEC);
}

function normalizeSpec(spec: ChartSpec): ChartSpec {
	const type = CHART_TYPE_OPTIONS.some((o) => o.value === spec.type)
		? spec.type
		: "bar";
	const categories = Array.isArray(spec.categories)
		? spec.categories.map((c) => String(c))
		: [];
	const series = Array.isArray(spec.series)
		? spec.series.map((s) => ({
				name: String(s?.name ?? ""),
				data: Array.isArray(s?.data) ? s.data.map((v) => Number(v) || 0) : [],
			}))
		: [];
	return { type, title: spec.title || "", categories, series };
}

export function serializeChartSpec(spec: ChartSpec): string {
	return JSON.stringify(spec);
}

const PIE_COLORS = [
	"#5470c6",
	"#91cc75",
	"#fac858",
	"#ee6666",
	"#73c0de",
	"#3ba272",
	"#fc8452",
	"#9a60b4",
];

/** 把简化 spec 构建为 ECharts option（编辑器 NodeView 与导出离屏渲染共用） */
export function buildChartOption(spec: ChartSpec): EChartsCoreOption {
	const title = spec.title?.trim()
		? { text: spec.title.trim(), left: "center", top: 6 }
		: undefined;

	if (spec.type === "pie") {
		const first = spec.series[0] ?? { name: "", data: [] };
		return {
			title,
			color: PIE_COLORS,
			tooltip: { trigger: "item" },
			legend: { bottom: 0 },
			series: [
				{
					name: first.name,
					type: "pie",
					radius: ["35%", "65%"],
					center: ["50%", "52%"],
					label: { formatter: "{b}: {c}" },
					data: spec.categories.map((name, i) => ({
						name,
						value: first.data[i] ?? 0,
					})),
				},
			],
		};
	}

	if (spec.type === "radar") {
		const max =
			Math.max(
				1,
				...spec.series.flatMap((s) => s.data.map((v) => Math.abs(v))),
			) * 1.2;
		return {
			title,
			color: PIE_COLORS,
			tooltip: {},
			legend: spec.series.length > 1 ? { bottom: 0 } : undefined,
			radar: {
				indicator: spec.categories.map((name) => ({ name, max })),
				radius: "62%",
				center: ["50%", "52%"],
			},
			series: [
				{
					type: "radar",
					data: spec.series.map((s) => ({
						name: s.name,
						value: spec.categories.map((_, i) => s.data[i] ?? 0),
					})),
				},
			],
		};
	}

	// bar / line / area 共用直角坐标系
	return {
		title,
		color: PIE_COLORS,
		tooltip: { trigger: "axis" },
		legend: spec.series.length > 1 ? { bottom: 0 } : undefined,
		grid: {
			left: 48,
			right: 24,
			top: spec.title?.trim() ? 44 : 24,
			bottom: 40,
		},
		xAxis: { type: "category", data: spec.categories },
		yAxis: { type: "value" },
		series: spec.series.map((s) => ({
			name: s.name,
			type: "line" as const,
			...(spec.type === "bar" ? { type: "bar" as const, barMaxWidth: 40 } : {}),
			...(spec.type === "area" ? { areaStyle: { opacity: 0.25 } } : {}),
			smooth: spec.type !== "bar",
			data: spec.categories.map((_, i) => s.data[i] ?? 0),
		})),
	};
}

/**
 * 离屏渲染图表为 PNG dataURL（导出 docx/pdf、复制图片等场景用）。
 * 渲染完成后实例立即销毁。
 */
export async function renderChartToDataURL(
	spec: ChartSpec,
	{ width = 720, height = 400 }: { width?: number; height?: number } = {},
): Promise<string> {
	const container = document.createElement("div");
	container.style.cssText = `position:fixed;left:-9999px;top:-9999px;width:${width}px;height:${height}px;`;
	document.body.appendChild(container);
	try {
		const instance = echarts.init(container, undefined, {
			renderer: "canvas",
			width,
			height,
		});
		instance.setOption({
			...buildChartOption(spec),
			backgroundColor: "#ffffff",
			animation: false,
		});
		const dataUrl = instance.getDataURL({
			type: "png",
			pixelRatio: 2,
			backgroundColor: "#ffffff",
		});
		instance.dispose();
		return dataUrl;
	} finally {
		document.body.removeChild(container);
	}
}
