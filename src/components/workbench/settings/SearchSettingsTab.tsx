import { DragDropProvider, type DragEndEvent } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { Button, InputGroup, Label, TextField } from "@heroui/react";
import {
	Clock,
	ExternalLink,
	Eye,
	EyeOff,
	Globe,
	GripVertical,
	KeyRound,
	Power,
	PowerOff,
} from "lucide-react";
import { useCallback, useState } from "react";
import {
	DEFAULT_ENGINE_ORDER,
	type SearchConfig,
	type SearchEngineId,
} from "../../../server/ai/search/registry";
import { arrayMove } from "../dnd/dndUtils";

export interface SearchSettingsFormData {
	engineOrder: SearchEngineId[];
	excludedEngines: SearchEngineId[];
	apiKeys: Partial<Record<SearchEngineId, string>>;
	timeoutMs: number;
}

export const INITIAL_SEARCH_FORM_DATA: SearchSettingsFormData = {
	engineOrder: [...DEFAULT_ENGINE_ORDER],
	excludedEngines: [],
	apiKeys: {},
	timeoutMs: 10_000,
};

/**
 * Merge a persisted SearchConfig into form data, ensuring newly added
 * engines always appear at the tail of the order list.
 */
export function searchConfigToFormData(
	cfg: SearchConfig | null,
): SearchSettingsFormData {
	if (!cfg) return { ...INITIAL_SEARCH_FORM_DATA };
	const known = new Set(cfg.engineOrder ?? []);
	const missing = DEFAULT_ENGINE_ORDER.filter((id) => !known.has(id));
	return {
		engineOrder:
			cfg.engineOrder && cfg.engineOrder.length > 0
				? [...cfg.engineOrder, ...missing]
				: [...DEFAULT_ENGINE_ORDER],
		excludedEngines: Array.isArray(cfg.excludedEngines)
			? cfg.excludedEngines
			: [],
		apiKeys: cfg.apiKeys ?? {},
		timeoutMs:
			typeof cfg.timeoutMs === "number" && cfg.timeoutMs > 0
				? cfg.timeoutMs
				: 10_000,
	};
}

export function formDataToSearchConfig(
	data: SearchSettingsFormData,
): SearchConfig {
	return {
		engineOrder: data.engineOrder,
		excludedEngines: data.excludedEngines,
		timeoutMs: data.timeoutMs,
		apiKeys: Object.fromEntries(
			Object.entries(data.apiKeys)
				.map(([k, v]) => [k, v?.trim() || ""] as const)
				.filter(([, v]) => v.length > 0),
		) as Partial<Record<SearchEngineId, string>>,
	};
}

interface EngineMeta {
	id: SearchEngineId;
	name: string;
	description: string;
	requiresKey: boolean;
	keyEnv: string | null;
	keyUrl: string;
	keyPlaceholder: string;
	keyHint: string;
}

const ENGINE_META: Record<SearchEngineId, EngineMeta> = {
	duckduckgo: {
		id: "duckduckgo",
		name: "DuckDuckGo",
		description: "全球注重隐私的搜索引擎，零配置免 Key 直接使用",
		requiresKey: false,
		keyEnv: null,
		keyUrl: "https://duckduckgo.com",
		keyPlaceholder: "无需配置 API Key",
		keyHint: "完全免配置，开箱即用（支持中文与全球网页检索）",
	},
	tavily: {
		id: "tavily",
		name: "Tavily",
		description: "面向 LLM 优化的搜索引擎，自带相关性评分",
		requiresKey: true,
		keyEnv: "TAVILY_API_KEY",
		keyUrl: "https://app.tavily.com/home",
		keyPlaceholder: "tvly-xxxxxxxxxxxx",
		keyHint: "面向 Agent 优化的搜索 API，按查询次数计费",
	},
	exa: {
		id: "exa",
		name: "Exa",
		description: "语义搜索引擎，擅长「找出与 X 类似的页面」",
		requiresKey: true,
		keyEnv: "EXA_API_KEY",
		keyUrl: "https://dashboard.exa.ai/api-keys",
		keyPlaceholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
		keyHint: "语义搜索引擎，返回相关性 score 与正文摘要",
	},
	brave: {
		id: "brave",
		name: "Brave",
		description: "独立索引，隐私友好，免费额度慷慨",
		requiresKey: true,
		keyEnv: "BRAVE_API_KEY",
		keyUrl: "https://brave.com/search/api/",
		keyPlaceholder: "BSAxxxxxxxxxxxxxxxxx",
		keyHint: "独立索引，不依赖 Google/Bing",
	},
	jina: {
		id: "jina",
		name: "Jina",
		description: "零配置兜底引擎（s.jina.ai），配置 Key 提升速率配额",
		requiresKey: false,
		keyEnv: "JINA_API_KEY",
		keyUrl: "https://jina.ai/api-dashboard",
		keyPlaceholder: "jina_xxxxxxxxxxxxxxxxx",
		keyHint: "可选，不配置也能用（限速更严）",
	},
	anysearch: {
		id: "anysearch",
		name: "AnySearch",
		description: "面向 AI Agent 的联网检索平台，支持免 Key 查询",
		requiresKey: false,
		keyEnv: "ANYSEARCH_API_KEY",
		keyUrl: "https://anysearch.com",
		keyPlaceholder: "as-xxxxxxxxxxxxxxxxx",
		keyHint: "可选，不配置也能用（配置可提升每日额度与并发）",
	},
};

interface EngineRowProps {
	id: SearchEngineId;
	index: number;
	meta: EngineMeta;
	disabled: boolean;
	apiKey: string;
	showKey: boolean;
	onToggleDisabled: (id: SearchEngineId, disabled: boolean) => void;
	onToggleShowKey: (id: SearchEngineId) => void;
	onChangeKey: (id: SearchEngineId, value: string) => void;
}

function EngineRow({
	id,
	index,
	meta,
	disabled,
	apiKey,
	showKey,
	onToggleDisabled,
	onToggleShowKey,
	onChangeKey,
}: EngineRowProps) {
	const { ref, isDragging } = useSortable({ id, index });
	const hasKey = Boolean(apiKey.trim());

	return (
		<div
			ref={ref as React.Ref<HTMLDivElement>}
			className={`rounded-lg border transition-all ${
				isDragging
					? "border-accent/60 shadow-md opacity-80"
					: "border-border/70 bg-surface hover:border-border"
			} ${disabled ? "opacity-50" : ""}`}
		>
			{/* Engine header row */}
			<div className="flex items-center gap-3 px-3 py-2.5 border-b border-border/50">
				<span
					className="p-1 -ml-1 text-muted/60 hover:text-muted cursor-grab active:cursor-grabbing"
					title="拖拽调整优先级（越靠上越优先）"
				>
					<GripVertical className="w-3.5 h-3.5" />
				</span>

				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2">
						<span className="text-sm font-semibold text-foreground">
							{meta.name}
						</span>
						<a
							href={meta.keyUrl}
							target="_blank"
							rel="noreferrer"
							className="inline-flex items-center gap-0.5 text-[10px] text-accent hover:underline"
							title={`前往 ${meta.name} 官网`}
						>
							<ExternalLink className="w-3 h-3" />
							<span>官网</span>
						</a>
						<span
							className={`text-[10px] px-1.5 py-0.2 rounded border ${
								meta.requiresKey
									? "bg-warning/5 text-warning/80 border-warning/20"
									: "bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
							}`}
						>
							{meta.requiresKey ? "需 Key" : "零配置"}
						</span>
						{hasKey && (
							<span className="text-[10px] px-1.5 py-0.2 rounded bg-accent/10 text-accent border border-accent/20">
								已配置
							</span>
						)}
					</div>
					<p className="text-[11px] text-muted mt-0.5 truncate">
						{meta.description}
					</p>
				</div>

				<Button
					type="button"
					variant="ghost"
					size="sm"
					isIconOnly
					className="rounded-md"
					onPress={() => onToggleDisabled(id, !disabled)}
					aria-label={disabled ? `启用 ${meta.name}` : `停用 ${meta.name}`}
				>
					{disabled ? (
						<PowerOff className="w-3.5 h-3.5 text-muted" />
					) : (
						<Power className="w-3.5 h-3.5 text-foreground/70" />
					)}
				</Button>
			</div>

			{/* API Key input or Keyless banner */}
			{meta.keyEnv ? (
				<div className="px-3 py-3">
					<TextField
						value={apiKey}
						onChange={(val) => onChangeKey(id, val)}
						isDisabled={disabled}
					>
						<Label className="text-xs font-medium text-foreground flex items-center justify-between">
							<span>{meta.name} API Key</span>
							<span className="text-[10px] text-muted font-normal">
								留空回退到 <code className="font-mono">{meta.keyEnv}</code>
							</span>
						</Label>
						<InputGroup className="bg-transparent border border-border/80 hover:border-foreground/40 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/20 rounded-lg shadow-none">
							<InputGroup.Prefix className="pl-3">
								<KeyRound className="w-3.5 h-3.5 text-muted" />
							</InputGroup.Prefix>
							<InputGroup.Input
								type={showKey ? "text" : "password"}
								placeholder={meta.keyPlaceholder}
								className="bg-transparent font-mono text-xs"
							/>
							<InputGroup.Suffix className="pr-1.5">
								<Button
									type="button"
									variant="ghost"
									size="sm"
									isIconOnly
									className="rounded-md"
									onPress={() => onToggleShowKey(id)}
									aria-label={showKey ? "隐藏密钥" : "显示密钥"}
								>
									{showKey ? (
										<EyeOff className="w-3.5 h-3.5" />
									) : (
										<Eye className="w-3.5 h-3.5" />
									)}
								</Button>
							</InputGroup.Suffix>
						</InputGroup>
						<p className="text-[10px] text-muted mt-1">{meta.keyHint}</p>
					</TextField>
				</div>
			) : (
				<div className="px-3 py-2.5 text-[11px] text-muted flex items-center gap-2">
					<span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
					<span>{meta.keyHint}</span>
				</div>
			)}
		</div>
	);
}

interface SearchSettingsTabProps {
	data: SearchSettingsFormData;
	onChange: <K extends keyof SearchSettingsFormData>(
		key: K,
		value: SearchSettingsFormData[K],
	) => void;
}

/**
 * 联网搜索设置 Tab：管理四个搜索引擎的 API Key、级联优先级与单引擎超时。
 * 受控组件，状态由 SettingsModal 持有，随底部「保存配置」统一提交。
 */
export function SearchSettingsTab({ data, onChange }: SearchSettingsTabProps) {
	const [showKeyMap, setShowKeyMap] = useState<
		Partial<Record<SearchEngineId, boolean>>
	>({});

	const { engineOrder, excludedEngines, apiKeys, timeoutMs } = data;

	const handleDragEnd = useCallback(
		(event: DragEndEvent) => {
			if (event.canceled) return;
			const { source } = event.operation;
			if (!source || !isSortable(source)) return;
			const { initialIndex, index } = source.sortable;
			if (initialIndex === index) return;
			if (!Number.isInteger(initialIndex) || !Number.isInteger(index)) return;
			onChange("engineOrder", arrayMove(engineOrder, initialIndex, index));
		},
		[engineOrder, onChange],
	);

	const handleToggleExcluded = (id: SearchEngineId, excluded: boolean) => {
		onChange(
			"excludedEngines",
			excluded
				? [...new Set([...excludedEngines, id])]
				: excludedEngines.filter((e) => e !== id),
		);
	};

	const handleChangeKey = (id: SearchEngineId, value: string) => {
		onChange("apiKeys", { ...apiKeys, [id]: value });
	};

	const handleToggleShowKey = useCallback((id: SearchEngineId) => {
		setShowKeyMap((prev) => ({ ...prev, [id]: !prev[id] }));
	}, []);

	// 统计当前可用引擎数（排除禁用且必须有 key 的引擎）
	const availableEngines = engineOrder.filter((id) => {
		if (excludedEngines.includes(id)) return false;
		const meta = ENGINE_META[id];
		if (!meta.requiresKey) return true;
		return Boolean(apiKeys[id]?.trim());
	});

	return (
		<div className="flex flex-col gap-6">
			{/* Active Status Banner */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="w-8 h-8 rounded-lg border border-border/70 flex items-center justify-center shrink-0 text-foreground">
						<Globe className="w-4 h-4" />
					</div>
					<div className="flex items-center gap-2">
						<span className="text-sm font-semibold text-foreground">
							级联策略：
						</span>
						<span className="text-xs text-muted">
							按下方顺序尝试，首个非空结果胜出
						</span>
					</div>
				</div>
				<div className="text-right hidden sm:block">
					<span
						className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
							availableEngines.length > 0
								? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
								: "bg-warning/10 text-warning"
						}`}
					>
						<span
							className={`w-1.5 h-1.5 rounded-full ${
								availableEngines.length > 0
									? "bg-emerald-500 animate-pulse"
									: "bg-warning"
							}`}
						/>
						{availableEngines.length} 个引擎可用
					</span>
				</div>
			</div>

			{/* Engine Priority List */}
			<div className="flex flex-col gap-2.5">
				<div className="flex items-center justify-between">
					<Label className="text-xs font-medium text-foreground">
						引擎优先级（拖拽排序）
					</Label>
					<span className="text-[10px] text-muted">
						{engineOrder.length} 个引擎
					</span>
				</div>
				<DragDropProvider onDragEnd={handleDragEnd}>
					<div className="flex flex-col gap-2">
						{engineOrder.map((id, index) => {
							const meta = ENGINE_META[id];
							if (!meta) return null;
							return (
								<EngineRow
									key={id}
									id={id}
									index={index}
									meta={meta}
									disabled={excludedEngines.includes(id)}
									apiKey={apiKeys[id] ?? ""}
									showKey={Boolean(showKeyMap[id])}
									onToggleDisabled={handleToggleExcluded}
									onToggleShowKey={handleToggleShowKey}
									onChangeKey={handleChangeKey}
								/>
							);
						})}
					</div>
				</DragDropProvider>
			</div>

			{/* Timeout */}
			<div className="flex flex-col gap-1.5">
				<TextField
					value={String(timeoutMs)}
					onChange={(val) => {
						const v = Number.parseInt(val, 10);
						if (Number.isFinite(v) && v > 0) onChange("timeoutMs", v);
					}}
				>
					<Label className="text-xs font-medium text-foreground">
						单引擎超时（毫秒）
					</Label>
					<InputGroup className="bg-transparent border border-border/80 hover:border-foreground/40 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/20 rounded-lg shadow-none">
						<InputGroup.Prefix className="pl-3">
							<Clock className="w-3.5 h-3.5 text-muted" />
						</InputGroup.Prefix>
						<InputGroup.Input
							type="number"
							min={1000}
							max={60000}
							step={1000}
							className="bg-transparent font-mono text-xs"
						/>
					</InputGroup>
					<p className="text-[10px] text-muted mt-1">
						单个搜索引擎超过此时长未响应视为失败，自动降级到下一引擎。建议
						8000-15000ms。
					</p>
				</TextField>
			</div>
		</div>
	);
}
