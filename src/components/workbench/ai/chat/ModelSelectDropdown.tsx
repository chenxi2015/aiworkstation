import { Dropdown } from "@heroui/react";
import { Check, ChevronDown, Sparkles } from "lucide-react";
import { memo } from "react";
import { WorkbenchStorageService } from "../../../../services/workbenchStorage";
import { inferProviderId, LLM_PROVIDERS } from "../../settings/constants";

export interface ModelSelectDropdownProps {
	/** 当前生效模型名 */
	currentModel: string;
	/** 切换后回调（设置已持久化，用于父组件刷新展示） */
	onModelChange?: (model: string) => void;
}

interface ModelOption {
	/** 唯一键：providerId + model */
	key: string;
	model: string;
	providerId: string;
	providerName: string;
	/** 该 provider 预设/已配置的 baseUrl 与 apiKey */
	baseUrl: string;
	apiKey: string;
}

/** 只列出设置里配置好的 provider 的当前模型（apiKey 判定已配置），当前生效模型兜底置顶 */
function buildOptions(currentModel: string): ModelOption[] {
	const settings = WorkbenchStorageService.getSettings();
	const providersConfig = settings.llmProvidersConfig ?? {};

	const list: ModelOption[] = [];
	for (const preset of LLM_PROVIDERS) {
		const cfg = providersConfig[preset.id];
		// 只展示「设置里配置好」的 provider：以 apiKey 为准，无 key 一律不显示
		const apiKey = (cfg?.apiKey ?? "").trim();
		if (!cfg || !apiKey) continue;

		const baseUrl = (cfg.baseUrl || preset.baseUrl || "").trim();
		const model = (cfg.model || preset.models[0] || "").trim();
		if (!model) continue;

		list.push({
			key: `${preset.id}::${model}`,
			model,
			providerId: preset.id,
			providerName: preset.name,
			baseUrl,
			apiKey,
		});
	}

	// 当前生效模型未出现在已配置列表时兜底置顶（仅当它自身有 key），保证下拉能显示当前值
	if (
		currentModel &&
		settings.apiKey?.trim() &&
		!list.some((o) => o.model === currentModel)
	) {
		const pid =
			settings.llmProvider || inferProviderId(settings.baseUrl, LLM_PROVIDERS);
		const matched = LLM_PROVIDERS.find((p) => p.id === pid);
		list.unshift({
			key: `current::${currentModel}`,
			model: currentModel,
			providerId: pid,
			providerName: matched?.name ?? "当前",
			baseUrl: settings.baseUrl ?? "",
			apiKey: settings.apiKey ?? "",
		});
	}
	return list;
}

/**
 * 输入框顶栏的模型切换下拉：展平全部 LLM provider 预设模型，
 * 选中即联动切换 provider + baseUrl + apiKey + model 并持久化到设置。
 * 对齐设置页「设为当前生效模型」的语义。
 */
export const ModelSelectDropdown = memo(function ModelSelectDropdown({
	currentModel,
	onModelChange,
}: ModelSelectDropdownProps) {
	// 每次渲染都重算（同步读 localStorage，成本可忽略），保证设置页改动后下拉立即反映最新配置
	const options = buildOptions(currentModel);
	const hasOptions = options.length > 0;

	const handleSelect = (opt: ModelOption) => {
		const settings = WorkbenchStorageService.getSettings();
		WorkbenchStorageService.saveSettings({
			...settings,
			llmProvider: opt.providerId,
			apiKey: opt.apiKey,
			baseUrl: opt.baseUrl,
			model: opt.model,
		});
		onModelChange?.(opt.model);
	};

	// 无任何已配置模型时渲染静态徽章（禁用态），不给空下拉
	if (!hasOptions) {
		return (
			<div
				className="inline-flex items-center gap-1.5 px-2 py-0.5 h-6 rounded-full bg-surface-secondary/70 border border-border/60 text-[11px] font-medium text-foreground/90 shadow-2xs select-none shrink-0 cursor-default opacity-80"
				title="暂无已配置模型的 provider，请先到设置中配置 API Key"
			>
				<span className="w-4 h-4 rounded-full bg-gradient-to-tr from-violet-500 via-indigo-500 to-fuchsia-500 flex items-center justify-center text-white shrink-0 shadow-2xs">
					<Sparkles className="w-2.5 h-2.5" />
				</span>
				<span className="max-w-[110px] truncate text-[10px] font-semibold text-foreground/80">
					{currentModel}
				</span>
			</div>
		);
	}

	return (
		<Dropdown>
			<Dropdown.Trigger
				aria-label="切换模型"
				className="inline-flex items-center gap-1.5 px-2 py-0.5 h-6 rounded-full bg-surface-secondary/70 border border-border/60 text-[11px] font-medium text-foreground/90 shadow-2xs select-none shrink-0 cursor-pointer hover:bg-surface-secondary transition-colors"
			>
				<span className="w-4 h-4 rounded-full bg-gradient-to-tr from-violet-500 via-indigo-500 to-fuchsia-500 flex items-center justify-center text-white shrink-0 shadow-2xs">
					<Sparkles className="w-2.5 h-2.5" />
				</span>
				<span className="max-w-[110px] truncate text-[10px] font-semibold text-foreground/80">
					{currentModel}
				</span>
				<ChevronDown className="w-3 h-3 text-muted shrink-0" />
			</Dropdown.Trigger>
			<Dropdown.Popover
				placement="bottom start"
				className="min-w-[220px] max-h-[320px] overflow-y-auto p-1 shadow-lg border border-border/80 rounded-xl bg-surface"
			>
				<Dropdown.Menu aria-label="切换模型">
					{options.map((opt) => (
						<Dropdown.Item
							key={opt.key}
							id={opt.key}
							textValue={`${opt.providerName} ${opt.model}`}
							onAction={() => handleSelect(opt)}
						>
							<div className="flex items-center justify-between gap-2 w-full py-0.5">
								<div className="flex flex-col min-w-0">
									<span className="text-xs font-medium truncate">
										{opt.model}
									</span>
									<span className="text-[10px] text-muted truncate">
										{opt.providerName}
									</span>
								</div>
								{opt.model === currentModel && (
									<Check className="w-3.5 h-3.5 text-accent shrink-0" />
								)}
							</div>
						</Dropdown.Item>
					))}
				</Dropdown.Menu>
			</Dropdown.Popover>
		</Dropdown>
	);
});
