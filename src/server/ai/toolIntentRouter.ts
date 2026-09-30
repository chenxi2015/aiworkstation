export interface ToolIntentContext {
	question: string;
	module?: string;
	activeNotePath?: string;
}

export interface RequiredToolIntent {
	toolName: string;
	intent: string;
}

/** Resolve explicit action requests only when the active module exposes the tool. */
export function resolveRequiredToolIntent(
	context: ToolIntentContext & { availableToolNames: ReadonlySet<string> },
): RequiredToolIntent | null {
	const { question, module, activeNotePath, availableToolNames } = context;
	const required = (toolName: string, intent: string) =>
		availableToolNames.has(toolName) ? { toolName, intent } : null;

	if (module === "obsidian" && activeNotePath?.endsWith(".canvas")) {
		if (
			/(?:居中|视野.{0,6}中央|白板.{0,6}中央|内容.{0,8}(?:中央|居中)|(?:移动|移到|放到|定位).{0,12}(?:中央|中间|中心)|(?:中央|中间|中心).{0,8}(?:显示|视野))/i.test(
				question,
			)
		) {
			return required("canvas_center_view", "canvas_center_view");
		}

		if (
			/(?:规整|排版|对齐|重排|整理白板|优化.{0,8}(?:布局|排版|连线)|(?:布局|排版|连线).{0,8}优化|切换.{0,8}(?:布局|模式|流程)|vertical_tree|horizontal_tree)/i.test(
				question,
			)
		) {
			return required("canvas_tidy_layout", "canvas_layout");
		}

		if (
			/(?:创建|添加|补充|绘制|梳理).{0,16}(?:节点|脑图|思维导图|架构|流程)/i.test(
				question,
			)
		) {
			return required("canvas_create_elements", "canvas_create");
		}
	}

	if (/(?:统计|盘点|总量|规模|健康度|资产全景|有多少)/i.test(question)) {
		const intent = required("get_stats", "bookmark_statistics");
		if (intent) return intent;
	}

	if (
		/(?:合并|归并).{0,12}(?:文件夹|目录)|(?:文件夹|目录).{0,12}(?:合并|归并)/i.test(
			question,
		)
	) {
		const intent = required("merge_folders", "merge_folders");
		if (intent) return intent;
	}

	if (/(?:新建|创建|建一个|建个).{0,8}(?:文件夹|目录|分类)/i.test(question)) {
		const intent = required("create_folder", "create_folder");
		if (intent) return intent;
	}

	if (
		/(?:把|将).{0,40}(?:书签|收藏).{0,20}(?:移动到|移入|归档到|整理到)/i.test(
			question,
		)
	) {
		const intent = required("move_bookmarks_to_folder", "move_bookmarks");
		if (intent) return intent;
	}

	if (
		/(?:查询|检索|搜索|找出|列出|有哪些).{0,20}(?:书签|收藏|文件夹|链接|工具)|(?:我收藏的|收藏库里的)/i.test(
			question,
		)
	) {
		const intent = required("query_bookmarks", "query_bookmarks");
		if (intent) return intent;
	}

	return null;
}
