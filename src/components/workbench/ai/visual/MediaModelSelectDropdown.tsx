import { Dropdown } from "@heroui/react";
import { Check, ChevronDown, Sparkles } from "lucide-react";
import { memo } from "react";
import { WorkbenchStorageService } from "../../../../services/workbenchStorage.ts";
import { MEDIA_PROVIDERS } from "../../settings/constants.ts";

export interface MediaModelSelectDropdownProps {
	currentModel: string;
	onModelChange?: (model: string, providerId: string) => void;
}

interface MediaModelOption {
	key: string;
	model: string;
	providerId: string;
	providerName: string;
	baseUrl: string;
	apiKey: string;
}

/** Build available media model options from user settings */
function buildMediaOptions(currentModel: string): MediaModelOption[] {
	const settings = WorkbenchStorageService.getSettings();
	const providersConfig = settings.imageProvidersConfig ?? {};

	const list: MediaModelOption[] = [];
	for (const preset of MEDIA_PROVIDERS) {
		const cfg = providersConfig[preset.id];
		const apiKey = (
			cfg?.apiKey ??
			(preset.id === settings.imageProvider ? settings.imageApiKey : "") ??
			""
		).trim();
		if (!apiKey) continue;

		const baseUrl = (cfg?.baseUrl || preset.baseUrl || "").trim();
		const model = (
			cfg?.model ||
			(preset.id === settings.imageProvider ? settings.imageModel : "") ||
			preset.models[0] ||
			""
		).trim();
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

	// Fallback to active model if not matched in configured providers
	if (
		currentModel &&
		settings.imageApiKey?.trim() &&
		!list.some((o) => o.model === currentModel)
	) {
		const pid = settings.imageProvider || "doubao";
		const matched = MEDIA_PROVIDERS.find((p) => p.id === pid);
		list.unshift({
			key: `current::${currentModel}`,
			model: currentModel,
			providerId: pid,
			providerName: matched?.name ?? "当前视觉模型",
			baseUrl: settings.imageBaseUrl ?? "",
			apiKey: settings.imageApiKey ?? "",
		});
	}

	return list;
}

/**
 * Dropdown switcher for Text-to-Image / Visual media models in the visual generation bar.
 */
export const MediaModelSelectDropdown = memo(function MediaModelSelectDropdown({
	currentModel,
	onModelChange,
}: MediaModelSelectDropdownProps) {
	const options = buildMediaOptions(currentModel);
	const hasOptions = options.length > 0;

	const handleSelect = (opt: MediaModelOption) => {
		const settings = WorkbenchStorageService.getSettings();
		WorkbenchStorageService.saveSettings({
			...settings,
			imageProvider: opt.providerId,
			imageApiKey: opt.apiKey,
			imageBaseUrl: opt.baseUrl,
			imageModel: opt.model,
		});
		onModelChange?.(opt.model, opt.providerId);
	};

	if (!hasOptions) {
		return (
			<div
				className="inline-flex items-center gap-1.5 px-2.5 py-1 h-7 rounded-full bg-surface-secondary/70 border border-border/70 text-xs font-medium text-foreground/80 select-none shrink-0 cursor-default opacity-85"
				title="尚未配置视觉模型，请前往系统设置 -> 视觉模型中配置 API Key"
			>
				<span className="w-3.5 h-3.5 rounded-full bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center text-white shrink-0">
					<Sparkles className="w-2 h-2" />
				</span>
				<span className="max-w-[120px] truncate text-[11px] font-medium text-foreground/80">
					{currentModel || "未配置生图模型"}
				</span>
			</div>
		);
	}

	return (
		<Dropdown>
			<Dropdown.Trigger
				aria-label="切换视觉生图模型"
				className="inline-flex items-center gap-1.5 px-2.5 py-1 h-7 rounded-full bg-surface-secondary/80 hover:bg-surface-secondary border border-border/70 text-xs font-medium text-foreground select-none shrink-0 cursor-pointer transition-all shadow-2xs hover:border-border"
			>
				<span className="w-3.5 h-3.5 rounded-full bg-gradient-to-tr from-amber-500 via-orange-500 to-rose-500 flex items-center justify-center text-white shrink-0 shadow-2xs">
					<Sparkles className="w-2 h-2" />
				</span>
				<span className="max-w-[130px] truncate text-[11px] font-medium text-foreground/90">
					{currentModel}
				</span>
				<ChevronDown className="w-3 h-3 text-muted shrink-0" />
			</Dropdown.Trigger>
			<Dropdown.Popover
				placement="bottom start"
				className="min-w-[220px] max-h-[300px] overflow-y-auto p-1.5 shadow-xl border border-border/80 rounded-xl bg-surface/98 backdrop-blur-md"
			>
				<Dropdown.Menu aria-label="切换视觉模型">
					{options.map((opt) => (
						<Dropdown.Item
							key={opt.key}
							id={opt.key}
							textValue={`${opt.providerName} ${opt.model}`}
							onAction={() => handleSelect(opt)}
						>
							<div className="flex items-center justify-between gap-2 w-full py-1">
								<div className="flex flex-col min-w-0">
									<span className="text-xs font-medium truncate text-foreground">
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
