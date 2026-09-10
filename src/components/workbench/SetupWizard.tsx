import {
	Button,
	Input,
	InputGroup,
	Label,
	ListBox,
	ListBoxItem,
	Modal,
	Select,
	SelectPopover,
	SelectTrigger,
	SelectValue,
	TextField,
	toast,
} from "@heroui/react";
import {
	AlertTriangle,
	ArrowRight,
	Brain,
	CheckCircle2,
	Database,
	Eye,
	EyeOff,
	FolderOpen,
	Loader2,
	Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { WorkbenchStorageService } from "../../services/workbenchStorage";
import { EMBEDDING_PROVIDERS, LLM_PROVIDERS } from "./settings/constants";
import type { WorkbenchSettings } from "./types";

interface SetupWizardProps {
	isOpen: boolean;
	existingSettings: WorkbenchSettings;
	onComplete: (settings: WorkbenchSettings) => void;
}

function isWindowsClient(): boolean {
	return (
		typeof navigator !== "undefined" && /windows/i.test(navigator.userAgent)
	);
}

// ── Step index ───────────────────────────────────────────────────
const STEPS = ["AI 配置", "存储配置"];

export function SetupWizard({
	isOpen,
	existingSettings,
	onComplete,
}: SetupWizardProps) {
	const hasApiKey = Boolean(existingSettings.apiKey?.trim());
	const [step, setStep] = useState(hasApiKey ? 1 : 0);

	// Step 1: LLM
	const [llmProvider, setLlmProvider] = useState(
		existingSettings.llmProvider ?? "deepseek",
	);
	const [apiKey, setApiKey] = useState(existingSettings.apiKey ?? "");
	const [baseUrl, setBaseUrl] = useState(
		existingSettings.baseUrl ?? LLM_PROVIDERS[0].baseUrl,
	);
	const [showKey, setShowKey] = useState(false);

	// Step 1: Embedding
	const [embProvider, setEmbProvider] = useState(
		existingSettings.embeddingProvider ?? "siliconflow",
	);
	const [embApiKey, setEmbApiKey] = useState(
		existingSettings.embeddingApiKey ?? "",
	);
	const [embBaseUrl, setEmbBaseUrl] = useState(
		existingSettings.embeddingBaseUrl ?? EMBEDDING_PROVIDERS[0].baseUrl,
	);
	const [embModel, setEmbModel] = useState(
		existingSettings.embeddingModel ?? EMBEDDING_PROVIDERS[0].models[0],
	);
	const [showEmbKey, setShowEmbKey] = useState(false);

	// Step 2: Storage
	const [filesRootDir, setFilesRootDir] = useState(
		existingSettings.filesRootDir ?? existingSettings.downloadsDir ?? "",
	);

	const [saving, setSaving] = useState(false);
	const isWindows = isWindowsClient();

	useEffect(() => {
		if (isOpen) setStep(hasApiKey ? 1 : 0);
	}, [isOpen, hasApiKey]);

	// Sync LLM baseUrl when provider changes
	useEffect(() => {
		const preset = LLM_PROVIDERS.find((p) => p.id === llmProvider);
		if (preset && preset.id !== "custom") setBaseUrl(preset.baseUrl);
	}, [llmProvider]);

	// Sync Embedding baseUrl/model when provider changes
	useEffect(() => {
		const preset = EMBEDDING_PROVIDERS.find((p) => p.id === embProvider);
		if (preset && preset.id !== "custom") {
			setEmbBaseUrl(preset.baseUrl);
			setEmbModel(preset.models[0] ?? "");
		}
	}, [embProvider]);

	const handleNext = () => {
		setStep(1);
	};

	const handleComplete = async () => {
		// Files root dir is required for Windows
		if (isWindows && !filesRootDir.trim()) {
			toast.warning(
				"Windows 用户建议填写文件管理根目录路径，否则视频文件将无法保存到本机",
			);
		}
		setSaving(true);
		try {
			const newSettings: WorkbenchSettings = {
				...existingSettings,
				// LLM
				apiKey: apiKey.trim(),
				baseUrl: baseUrl.trim() || LLM_PROVIDERS[0].baseUrl,
				model:
					existingSettings.model ||
					LLM_PROVIDERS.find((p) => p.id === llmProvider)?.models[0] ||
					"deepseek-chat",
				batchSize: existingSettings.batchSize ?? 15,
				concurrency: existingSettings.concurrency ?? 2,
				llmProvider,
				// Embedding
				embeddingProvider: embProvider,
				embeddingApiKey: embApiKey.trim(),
				embeddingBaseUrl: embBaseUrl.trim(),
				embeddingModel: embModel.trim(),
				// Storage
				filesRootDir: filesRootDir.trim() || undefined,
				downloadsDir: undefined,
				setupComplete: true,
			};
			await WorkbenchStorageService.saveSettings(newSettings);
			toast.success("配置已保存，欢迎使用 AI 工作台！");
			onComplete(newSettings);
		} catch (err) {
			toast.danger("保存失败，请重试");
			console.error("[SetupWizard] save error:", err);
		} finally {
			setSaving(false);
		}
	};

	return (
		<Modal.Backdrop isOpen={isOpen} variant="blur">
			<Modal.Container size="md" className="w-full max-w-[620px]">
				<Modal.Dialog aria-label="初始配置向导">
					{/* Header */}
					<Modal.Header>
						<div className="flex items-center gap-3">
							<div className="flex items-center justify-center w-8 h-8 rounded-xl bg-accent/10 shrink-0">
								<Sparkles className="w-4 h-4 text-accent" />
							</div>
							<div>
								<Modal.Heading>欢迎使用 AI 工作台</Modal.Heading>
								<p className="text-xs text-muted mt-0.5">
									首次使用，请完成初始配置
								</p>
							</div>
						</div>
					</Modal.Header>

					{/* Step indicator */}
					<div className="flex gap-1.5 px-6 pb-3">
						{STEPS.map((label, i) => (
							<div key={label} className="flex items-center gap-1.5 flex-1">
								<div
									className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold shrink-0 transition-colors ${
										i < step
											? "bg-accent text-white"
											: i === step
												? "bg-accent/20 text-accent border border-accent/40"
												: "bg-muted/20 text-muted"
									}`}
								>
									{i < step ? <CheckCircle2 className="w-3 h-3" /> : i + 1}
								</div>
								<span
									className={`text-[11px] transition-colors ${
										i === step ? "text-foreground font-medium" : "text-muted"
									}`}
								>
									{label}
								</span>
								{i < STEPS.length - 1 && (
									<div className="flex-1 h-px bg-border mx-1" />
								)}
							</div>
						))}
					</div>

					{/* Body */}
					<Modal.Body className="flex flex-col gap-5 max-h-[60vh] overflow-y-auto">
						{step === 0 ? (
							<StepAI
								llmProvider={llmProvider}
								onLlmProviderChange={setLlmProvider}
								apiKey={apiKey}
								onApiKeyChange={setApiKey}
								baseUrl={baseUrl}
								onBaseUrlChange={setBaseUrl}
								showKey={showKey}
								onToggleKey={() => setShowKey((v) => !v)}
								embProvider={embProvider}
								onEmbProviderChange={setEmbProvider}
								embApiKey={embApiKey}
								onEmbApiKeyChange={setEmbApiKey}
								embBaseUrl={embBaseUrl}
								onEmbBaseUrlChange={setEmbBaseUrl}
								embModel={embModel}
								onEmbModelChange={setEmbModel}
								showEmbKey={showEmbKey}
								onToggleEmbKey={() => setShowEmbKey((v) => !v)}
							/>
						) : (
							<StepStorage
								isWindows={isWindows}
								filesRootDir={filesRootDir}
								onFilesRootDirChange={setFilesRootDir}
							/>
						)}
					</Modal.Body>

					{/* Footer */}
					<Modal.Footer className="flex items-center justify-between">
						{step === 1 && !hasApiKey ? (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="cursor-pointer"
								onPress={() => setStep(0)}
							>
								上一步
							</Button>
						) : (
							<div />
						)}

						{step === 0 ? (
							<Button
								type="button"
								variant="primary"
								size="sm"
								className="flex items-center gap-1.5 cursor-pointer rounded-full"
								onPress={handleNext}
							>
								<span>下一步</span>
								<ArrowRight className="w-3.5 h-3.5" />
							</Button>
						) : (
							<Button
								type="button"
								variant="primary"
								size="sm"
								className="flex items-center gap-1.5 cursor-pointer rounded-full"
								onPress={handleComplete}
								isDisabled={saving}
							>
								{saving ? (
									<Loader2 className="w-3.5 h-3.5 animate-spin" />
								) : (
									<CheckCircle2 className="w-3.5 h-3.5" />
								)}
								<span>完成设置</span>
							</Button>
						)}
					</Modal.Footer>
				</Modal.Dialog>
			</Modal.Container>
		</Modal.Backdrop>
	);
}

// ── Step 1: AI 配置（LLM + Embedding）───────────────────────────

interface StepAIProps {
	llmProvider: string;
	onLlmProviderChange: (id: string) => void;
	apiKey: string;
	onApiKeyChange: (v: string) => void;
	baseUrl: string;
	onBaseUrlChange: (v: string) => void;
	showKey: boolean;
	onToggleKey: () => void;
	embProvider: string;
	onEmbProviderChange: (id: string) => void;
	embApiKey: string;
	onEmbApiKeyChange: (v: string) => void;
	embBaseUrl: string;
	onEmbBaseUrlChange: (v: string) => void;
	embModel: string;
	onEmbModelChange: (v: string) => void;
	showEmbKey: boolean;
	onToggleEmbKey: () => void;
}

function StepAI({
	llmProvider,
	onLlmProviderChange,
	apiKey,
	onApiKeyChange,
	baseUrl,
	onBaseUrlChange,
	showKey,
	onToggleKey,
	embProvider,
	onEmbProviderChange,
	embApiKey,
	onEmbApiKeyChange,
	embBaseUrl,
	onEmbBaseUrlChange,
	embModel,
	onEmbModelChange,
	showEmbKey,
	onToggleEmbKey,
}: StepAIProps) {
	const isLlmCustom = llmProvider === "custom";
	const isEmbCustom = embProvider === "custom";

	return (
		<div className="flex flex-col gap-5">
			{/* ① LLM */}
			<section className="flex flex-col gap-3">
				<div className="flex items-center gap-2 pb-1 border-b border-border">
					<Sparkles className="w-3.5 h-3.5 text-accent shrink-0" />
					<span className="text-xs font-semibold text-foreground">
						① 对话模型（非必填）
					</span>
					<span className="ml-auto text-[10px] text-muted">
						不填则 AI 功能不可用
					</span>
				</div>

				<div className="grid grid-cols-2 gap-3">
					<div className="flex flex-col gap-1.5">
						<Label>服务商</Label>
						<Select
							aria-label="LLM 服务商"
							selectedKey={llmProvider}
							onSelectionChange={(k) => k && onLlmProviderChange(String(k))}
							variant="secondary"
							className="w-full"
						>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectPopover className="max-h-60 overflow-y-auto min-w-[200px]">
								<ListBox>
									{LLM_PROVIDERS.map((p) => (
										<ListBoxItem key={p.id} id={p.id} textValue={p.name}>
											{p.name}
										</ListBoxItem>
									))}
								</ListBox>
							</SelectPopover>
						</Select>
					</div>

					<TextField
						value={apiKey}
						onChange={onApiKeyChange}
						className="min-w-0"
					>
						<Label>API Key</Label>
						<InputGroup fullWidth variant="secondary">
							<InputGroup.Input
								type={showKey ? "text" : "password"}
								placeholder="sk-..."
							/>
							<InputGroup.Suffix>
								<button
									type="button"
									onClick={onToggleKey}
									className="cursor-pointer hover:opacity-80 transition-opacity"
								>
									{showKey ? (
										<EyeOff className="size-3.5 text-muted" />
									) : (
										<Eye className="size-3.5 text-muted" />
									)}
								</button>
							</InputGroup.Suffix>
						</InputGroup>
					</TextField>
				</div>

				{isLlmCustom && (
					<TextField
						value={baseUrl}
						onChange={onBaseUrlChange}
						className="w-full"
					>
						<Label>Base URL</Label>
						<Input
							placeholder="https://api.openai.com/v1"
							variant="secondary"
						/>
					</TextField>
				)}
			</section>

			{/* ② Embedding */}
			<section className="flex flex-col gap-3">
				<div className="flex items-center gap-2 pb-1 border-b border-border">
					<Brain className="w-3.5 h-3.5 text-accent shrink-0" />
					<span className="text-xs font-semibold text-foreground">
						② 向量模型（非必填）
					</span>
					<span className="ml-auto text-[10px] text-muted">
						不填则语义搜索退化为关键词
					</span>
				</div>

				<div className="grid grid-cols-2 gap-3">
					<div className="flex flex-col gap-1.5">
						<Label>Embedding 服务商</Label>
						<Select
							aria-label="Embedding 服务商"
							selectedKey={embProvider}
							onSelectionChange={(k) => k && onEmbProviderChange(String(k))}
							variant="secondary"
							className="w-full"
						>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectPopover className="max-h-60 overflow-y-auto min-w-[200px]">
								<ListBox>
									{EMBEDDING_PROVIDERS.map((p) => (
										<ListBoxItem key={p.id} id={p.id} textValue={p.name}>
											{p.name}
										</ListBoxItem>
									))}
								</ListBox>
							</SelectPopover>
						</Select>
					</div>

					<TextField
						value={embApiKey}
						onChange={onEmbApiKeyChange}
						className="min-w-0"
					>
						<Label>Embedding API Key</Label>
						<InputGroup fullWidth variant="secondary">
							<InputGroup.Input
								type={showEmbKey ? "text" : "password"}
								placeholder="sk-..."
							/>
							<InputGroup.Suffix>
								<button
									type="button"
									onClick={onToggleEmbKey}
									className="cursor-pointer hover:opacity-80 transition-opacity"
								>
									{showEmbKey ? (
										<EyeOff className="size-3.5 text-muted" />
									) : (
										<Eye className="size-3.5 text-muted" />
									)}
								</button>
							</InputGroup.Suffix>
						</InputGroup>
					</TextField>
				</div>

				{isEmbCustom && (
					<div className="grid grid-cols-2 gap-3">
						<TextField value={embBaseUrl} onChange={onEmbBaseUrlChange}>
							<Label>Embedding Base URL</Label>
							<Input
								placeholder="http://localhost:11434/v1"
								variant="secondary"
							/>
						</TextField>
						<TextField value={embModel} onChange={onEmbModelChange}>
							<Label>Embedding 模型</Label>
							<Input placeholder="nomic-embed-text" variant="secondary" />
						</TextField>
					</div>
				)}
			</section>
		</div>
	);
}

// ── Step 2: 存储配置（下载目录 + 数据库位置）────────────────────

interface StepStorageProps {
	isWindows: boolean;
	filesRootDir: string;
	onFilesRootDirChange: (v: string) => void;
}

function StepStorage({
	isWindows,
	filesRootDir,
	onFilesRootDirChange,
}: StepStorageProps) {
	return (
		<div className="flex flex-col gap-5">
			{/* ③ 文件管理根目录 */}
			<section className="flex flex-col gap-3">
				<div className="flex items-center gap-2 pb-1 border-b border-border">
					<FolderOpen className="w-3.5 h-3.5 text-accent shrink-0" />
					<span className="text-xs font-semibold text-foreground">
						③ 文件管理根目录
					</span>
					{isWindows ? (
						<span className="ml-auto text-[10px] text-warning font-medium">
							Windows 必填
						</span>
					) : (
						<span className="ml-auto text-[10px] text-muted">
							macOS / Linux 自动配置
						</span>
					)}
				</div>

				{isWindows ? (
					<>
						<div className="flex items-start gap-2 p-3 rounded-lg bg-warning/8 border border-warning/20">
							<AlertTriangle className="w-3.5 h-3.5 text-warning mt-0.5 shrink-0" />
							<p className="text-[11px] text-muted leading-relaxed">
								工作台运行在 Docker 容器内，请填写你在 Windows
								上的文件管理根目录路径，下载的视频与素材文件将保存到此处。
							</p>
						</div>
						<TextField
							value={filesRootDir}
							onChange={onFilesRootDirChange}
							className="w-full"
						>
							<Label>Windows 文件管理根目录路径</Label>
							<Input
								placeholder={`C:\\Users\\你的用户名\\Downloads`}
								variant="secondary"
							/>
						</TextField>
						<p className="text-[11px] text-muted">
							💡 打开文件资源管理器 → 进入下载文件夹 → 复制地址栏路径粘贴到此处
						</p>
					</>
				) : (
					<div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-accent/8 border border-accent/20">
						<CheckCircle2 className="w-4 h-4 text-accent mt-0.5 shrink-0" />
						<div>
							<p className="text-xs font-medium text-foreground">已自动配置</p>
							<p className="text-[11px] text-muted mt-0.5 leading-relaxed">
								下载与素材文件将自动保存到系统默认的「下载」(Downloads)
								目录，无需额外配置。
							</p>
						</div>
					</div>
				)}
			</section>

			{/* ④ 数据库存储位置（只读展示） */}
			<section className="flex flex-col gap-3">
				<div className="flex items-center gap-2 pb-1 border-b border-border">
					<Database className="w-3.5 h-3.5 text-accent shrink-0" />
					<span className="text-xs font-semibold text-foreground">
						④ 数据库存储位置
					</span>
					<span className="ml-auto text-[10px] text-muted">只读</span>
				</div>

				<div className="flex flex-col gap-2 p-3.5 rounded-xl bg-muted/5 border border-border">
					<div className="flex items-start gap-2">
						<div className="flex-1 min-w-0">
							<p className="text-[11px] text-muted leading-relaxed">
								工作台数据（书签、AI 对话记录、爬取的网页）统一存储在：
							</p>
							<code className="block mt-1.5 text-[11px] text-accent bg-accent/8 px-2 py-1 rounded-md font-mono">
								{isWindows
									? "Docker 容器内 /app/.aiworkstation"
									: "~/.aiworkstation（已挂载到项目目录）"}
							</code>
						</div>
					</div>

					{isWindows && (
						<p className="text-[11px] text-muted leading-relaxed border-t border-border pt-2 mt-0.5">
							💾 Docker 会将容器内的数据目录自动映射到你电脑上的{" "}
							<code className="text-accent bg-accent/10 px-1 rounded">
								docker-compose.yml
							</code>{" "}
							所在文件夹的{" "}
							<code className="text-accent bg-accent/10 px-1 rounded">
								.aiworkstation\
							</code>{" "}
							子目录，数据不会因容器重启而丢失。
						</p>
					)}
				</div>
			</section>
		</div>
	);
}
