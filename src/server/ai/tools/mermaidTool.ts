import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { executeInsertDocumentBlock } from "./documentTools.ts";
import type { ToolExecutionResult } from "./types.ts";

export const generateMermaidDiagramInputSchema = z.object({
	documentId: z
		.number()
		.optional()
		.describe("要插入图表的文档 ID。省略时自动定位当前活跃文档"),
	title: z
		.string()
		.describe(
			"图表标题（例如：「OAuth2.0 授权码时序图」、「微服务系统架构流程」）",
		),
	diagramType: z
		.enum([
			"flowchart",
			"sequenceDiagram",
			"classDiagram",
			"stateDiagram-v2",
			"erDiagram",
			"gantt",
		])
		.default("flowchart")
		.describe("Mermaid 图表类型"),
	mermaidCode: z
		.string()
		.describe(
			"符合 Mermaid 标准语法的纯文本代码（例如：graph TD\\n A[客户端] --> B[网关]），无需包含包裹的 markdown 反引号",
		),
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

export type GenerateMermaidDiagramInput = z.input<
	typeof generateMermaidDiagramInputSchema
>;

export function executeGenerateMermaidDiagram(
	args: GenerateMermaidDiagramInput & { activeDocumentId?: number },
): ToolExecutionResult {
	const title = args.title.trim();
	let code = args.mermaidCode.trim();

	// Strip backticks if model included them
	if (code.startsWith("```mermaid")) {
		code = code
			.replace(/^```mermaid\s*/i, "")
			.replace(/```$/, "")
			.trim();
	} else if (code.startsWith("```")) {
		code = code
			.replace(/^```\s*/, "")
			.replace(/```$/, "")
			.trim();
	}

	const formattedBlock = `\`\`\`mermaid\n${code}\n\`\`\``;

	// If requested to insert into document
	if (args.insertToDocument !== false) {
		const insertResult = executeInsertDocumentBlock({
			documentId: args.documentId,
			activeDocumentId: args.activeDocumentId,
			blockType: "mermaid",
			content: formattedBlock,
			caption: title,
			targetAnchor: args.targetAnchor,
			position: args.position ?? "after",
			snapshotNote: `AI 插入架构图表「${title}」前自动备份`,
		});

		return {
			toolName: "generate_mermaid_diagram",
			summary: `✅ 已成功生成并插入 Mermaid 图表《${title}》：\n\n${formattedBlock}\n\n${insertResult.summary}`,
			items: [],
			references: [],
			isMutation: insertResult.isMutation,
		};
	}

	return {
		toolName: "generate_mermaid_diagram",
		summary: `已生成 Mermaid 图表《${title}》（类型：${args.diagramType}）：\n\n${formattedBlock}`,
		items: [],
		references: [],
		isMutation: false,
	};
}

export const generateMermaidDiagramToolDef = toolDefinition({
	name: "generate_mermaid_diagram",
	description:
		"生成符合标准 Mermaid 语法的技术图表（流程图、时序图、系统架构图、状态机图、甘特图等），并可直接插入到文章正文相应段落。当用户要求「画一张架构图」、「用流程图说明」、「插入时序图」或需要用图形直观表达逻辑时调用。",
	inputSchema: generateMermaidDiagramInputSchema,
});
