import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { executeInsertDocumentBlock } from "./documentTools.ts";
import type { ToolExecutionResult } from "./types.ts";

export const generateDataChartInputSchema = z.object({
	documentId: z
		.number()
		.optional()
		.describe("要插入图表的文档 ID。省略时自动定位当前活跃文档"),
	title: z
		.string()
		.optional()
		.describe("图表标题（例如：「近三年营收增长对比」），可省略"),
	chartType: z
		.enum(["bar", "line", "area", "pie", "radar"])
		.default("bar")
		.describe(
			"图表类型：bar(柱状图-对比) / line(折线图-趋势) / area(面积图-累计趋势) / pie(饼图-占比) / radar(雷达图-多维能力)",
		),
	categories: z
		.array(z.string())
		.min(1)
		.describe(
			'类目轴标签（柱状/折线/面积图的 X 轴，饼图的扇区名称，雷达图的维度名），例如 ["2023", "2024", "2025"]',
		),
	series: z
		.array(
			z.object({
				name: z.string().describe("系列名称（图例），例如「营收（亿元）」"),
				data: z
					.array(z.number())
					.describe("与 categories 一一对应的数值数组，长度必须一致"),
			}),
		)
		.min(1)
		.describe("数据系列。饼图只取第一个系列"),
	insertToDocument: z
		.boolean()
		.default(true)
		.describe("是否直接将生成的图表插入到当前编辑的文档正文中，默认为 true"),
	targetAnchor: z
		.string()
		.optional()
		.describe("插入锚点：目标段落的首句或关键词。若省略则默认插在文章末尾"),
	position: z
		.enum(["before", "after", "append"])
		.default("after")
		.describe("相对于锚点的位置：before(前) / after(后) / append(文章末尾)"),
});

export type GenerateDataChartInput = z.input<
	typeof generateDataChartInputSchema
>;

export function executeGenerateDataChart(
	args: GenerateDataChartInput & { activeDocumentId?: number },
): ToolExecutionResult {
	const title = args.title?.trim() || "";

	// 校验并对齐 series 与 categories 长度
	const spec = {
		type: args.chartType ?? "bar",
		title,
		categories: args.categories,
		series: args.series.map((s) => ({
			name: s.name,
			data: args.categories.map((_, i) => Number(s.data[i]) || 0),
		})),
	};

	const formattedBlock = `\`\`\`chart\n${JSON.stringify(spec)}\n\`\`\``;
	const typeLabel =
		{
			bar: "柱状图",
			line: "折线图",
			area: "面积图",
			pie: "饼图",
			radar: "雷达图",
		}[spec.type] ?? spec.type;

	if (args.insertToDocument !== false) {
		const insertResult = executeInsertDocumentBlock({
			documentId: args.documentId,
			activeDocumentId: args.activeDocumentId,
			blockType: "chart",
			content: formattedBlock,
			caption: title || undefined,
			targetAnchor: args.targetAnchor,
			position: args.position ?? "after",
			snapshotNote: `AI 插入数据图表「${title || typeLabel}」前自动备份`,
		});

		return {
			toolName: "generate_data_chart",
			summary: `✅ 已成功生成并插入数据图表《${title || typeLabel}》（${typeLabel}，${spec.series.length} 个系列 × ${spec.categories.length} 个类目）。\n${insertResult.summary}`,
			items: [],
			references: [],
			isMutation: insertResult.isMutation,
		};
	}

	return {
		toolName: "generate_data_chart",
		summary: `已生成数据图表《${title || typeLabel}》（${typeLabel}）：\n\n${formattedBlock}`,
		items: [],
		references: [],
		isMutation: false,
	};
}

export const generateDataChartToolDef = toolDefinition({
	name: "generate_data_chart",
	description:
		"生成数据可视化图表（柱状图、折线图、面积图、饼图、雷达图），并可直接插入到文章正文相应段落。当用户要求「画一张数据对比图」、「把数据做成图表」、「插入趋势图/占比图」或需要用统计图表表达数据时调用。注意：逻辑关系/流程/架构类图形请用 generate_mermaid_diagram。",
	inputSchema: generateDataChartInputSchema,
});
