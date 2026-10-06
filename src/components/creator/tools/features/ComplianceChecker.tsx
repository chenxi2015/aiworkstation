import {
	AlertCircle,
	AlertTriangle,
	Check,
	CheckCircle2,
	Copy,
	FileText,
	RotateCcw,
	ShieldAlert,
	ShieldCheck,
	Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
import { uploadMaterialFiles } from "../../../../server/functions/creatorMaterials";
import { ToolBottomDock, ToolHeader } from "../components";
import type { ToolDefinition } from "../types";

/** Comprehensive list of sensitive / extreme advertisement law terms */
const COMPLIANCE_RULES: {
	pattern: RegExp;
	term: string;
	reason: string;
	replacement: string;
	severity: "high" | "medium";
}[] = [
	{
		pattern: /最[高大强好全佳新高级尖优低便宜实惠划算]/g,
		term: "最...",
		reason: "违反广告法极限词规定，严禁使用最高级绝对化描述",
		replacement: "更出色 / 优质 / 前沿",
		severity: "high",
	},
	{
		pattern: /第[一1壹]|首[个屈席选位期发家度]|唯一/g,
		term: "第一 / 首个 / 唯一",
		reason: "绝对化排序词汇，未有国家权威认证不得直接宣称第一",
		replacement: "深受喜爱 / 优先选择 / 特色",
		severity: "high",
	},
	{
		pattern: /国家级|世界级|顶[级尖峰]|极品|至尊|王牌|殿堂级/g,
		term: "国家级 / 顶级 / 极品",
		reason: "夸大虚构荣誉，禁止借用国家机构或封顶词汇背书",
		replacement: "高品质 / 标杆级 / 匠心",
		severity: "high",
	},
	{
		pattern: /全网[最首]|全平台最低|全网独家|史无前例/g,
		term: "全网独家 / 全网最低",
		reason: "虚假比价与排他性绝对宣传",
		replacement: "诚意精选 / 限时优惠",
		severity: "high",
	},
	{
		pattern: /100%|百分之百|绝对|必[须买赢达火爆]|包过|保真/g,
		term: "100% / 必须 / 保真 / 包过",
		reason: "绝对化保证收益或效果，自媒体平台容易被限流与违规处罚",
		replacement: "力求 / 建议 / 值得体验",
		severity: "medium",
	},
	{
		pattern: /秒杀|疯抢|错过后悔一辈子|亏本甩卖|倒闭甩卖/g,
		term: "疯抢 / 错过后悔一辈子",
		reason: "虚假紧迫感与恶俗低俗营销词汇",
		replacement: "限时专享 / 热门精选",
		severity: "medium",
	},
	{
		pattern: /永[久远]|终身|永久有效/g,
		term: "永久 / 终身",
		reason: "承诺不可实现的服务期限，可能构成欺诈",
		replacement: "长期 / 持续支持",
		severity: "medium",
	},
];

interface ComplianceCheckerProps {
	tool: ToolDefinition;
	onSaveToMaterials?: (resultInfo: string) => void;
	onSendToStudio?: () => void;
}

/**
 * Interactive Compliance and Advertising Law Checker workspace aligned with ToolWorkspace layout standards.
 * Features:
 * - Unified Fixed Top Header matching standard creator tools
 * - Dual-pane responsive body: Left for text input & samples, Right for diagnostic report & safe replacement
 * - Unified Fixed Bottom Action Dock
 */
export function ComplianceChecker({
	tool,
	onSaveToMaterials,
	onSendToStudio,
}: ComplianceCheckerProps) {
	const [text, setText] = useState("");
	const [copied, setCopied] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [statusMessage, setStatusMessage] = useState<string | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	// Detect sensitive terms in the current text
	const detectedIssues = useMemo(() => {
		if (!text.trim()) return [];
		const results: {
			term: string;
			reason: string;
			replacement: string;
			severity: "high" | "medium";
			matches: string[];
		}[] = [];

		for (const rule of COMPLIANCE_RULES) {
			const matches = text.match(rule.pattern);
			if (matches && matches.length > 0) {
				const uniqueMatches = Array.from(new Set(matches));
				results.push({
					term: rule.term,
					reason: rule.reason,
					replacement: rule.replacement,
					severity: rule.severity,
					matches: uniqueMatches,
				});
			}
		}
		return results;
	}, [text]);

	// Auto-clean: replace all high-risk keywords with suggested alternatives
	const cleanText = useMemo(() => {
		let cleaned = text;
		for (const rule of COMPLIANCE_RULES) {
			cleaned = cleaned.replace(rule.pattern, (match) => {
				const replacementWords = rule.replacement.split(" / ");
				return replacementWords[0] || match;
			});
		}
		return cleaned;
	}, [text]);

	const handleCopyCleaned = async () => {
		if (!cleanText) return;
		try {
			await navigator.clipboard.writeText(cleanText);
			setCopied(true);
			setStatusMessage("已成功复制净化后的合规文案！");
			setTimeout(() => setCopied(false), 2000);
		} catch (err) {
			console.error("Failed to copy", err);
			setErrorMessage("复制文本失败，请手动选择复制");
		}
	};

	const handleLoadSample = () => {
		setText(
			"欢迎大家观看！这是全网最棒的自媒体工具箱，拥有国家级顶尖技术，100%保证能帮你解决自媒体痛点！全网独家首发，今日点击疯抢，错过后悔一辈子，永久有效！",
		);
		setStatusMessage("已载入测试样本，右侧已实时生成违规词排查报告。");
	};

	const handleSaveToMaterials = async () => {
		if (!text.trim() || isSaving) return;
		setIsSaving(true);
		setStatusMessage(null);
		setErrorMessage(null);

		try {
			const outputContent = cleanText || text;
			const filename = `合规净化文案_${Date.now()}.txt`;
			const file = new File([outputContent], filename, {
				type: "text/plain;charset=utf-8",
			});

			const formData = new FormData();
			formData.append("files", file);

			await uploadMaterialFiles({ data: formData });
			setStatusMessage("已将合规净化文案存入「素材库」！");
			onSaveToMaterials?.(tool.name);
		} catch (err) {
			console.error("Failed to save compliance material", err);
			setErrorMessage("保存失败，请稍后重试");
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<div className="flex-1 flex flex-col h-full bg-background overflow-hidden relative">
			{/* Top Header Bar */}
			<ToolHeader
				tool={tool}
				extraActions={
					<button
						type="button"
						onClick={handleLoadSample}
						className="px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-surface/80 text-foreground text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
					>
						<Sparkles className="w-3.5 h-3.5 text-accent" />
						<span>载入测试文案</span>
					</button>
				}
			/>

			{/* ── Scrollable Body Area (Dual-Pane Layout) ── */}
			<div className="flex-1 min-h-0 overflow-y-auto p-5">
				<div className="max-w-7xl mx-auto space-y-4">
					{/* Status / Error feedback banners */}
					{statusMessage && (
						<div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center justify-between gap-3 animate-in fade-in duration-200">
							<div className="flex items-center gap-2">
								<Check className="w-4 h-4 shrink-0" />
								<span>{statusMessage}</span>
							</div>
							<button
								type="button"
								onClick={() => setStatusMessage(null)}
								className="text-xs hover:opacity-75 cursor-pointer"
							>
								关闭
							</button>
						</div>
					)}

					{errorMessage && (
						<div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center justify-between gap-3 animate-in fade-in duration-200">
							<div className="flex items-center gap-2">
								<AlertCircle className="w-4 h-4 shrink-0" />
								<span>{errorMessage}</span>
							</div>
							<button
								type="button"
								onClick={() => setErrorMessage(null)}
								className="text-xs hover:opacity-75 cursor-pointer"
							>
								关闭
							</button>
						</div>
					)}

					{/* Dual-Pane Grid */}
					<div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
						{/* Left Column: Text Input & Clear (6 cols) */}
						<div className="lg:col-span-6 space-y-4">
							<div className="p-4 rounded-xl border border-border bg-surface shadow-xs space-y-3">
								<div className="flex items-center justify-between">
									<h2 className="text-xs font-bold text-foreground flex items-center gap-1.5">
										<FileText className="w-3.5 h-3.5 text-accent" />
										<span>待检原文文案</span>
									</h2>
									<div className="flex items-center gap-2">
										{text && (
											<button
												type="button"
												onClick={() => {
													setText("");
													setStatusMessage(null);
												}}
												className="text-[11px] text-muted hover:text-foreground flex items-center gap-1 cursor-pointer transition-colors"
											>
												<RotateCcw className="w-3 h-3" />
												<span>清空</span>
											</button>
										)}
									</div>
								</div>

								<div className="relative">
									<textarea
										id="compliance-editor-textarea"
										value={text}
										onChange={(e) => setText(e.target.value)}
										placeholder="在此粘贴小红书图文文案、短视频口播脚本或微信推文正文..."
										rows={15}
										className="w-full p-3.5 rounded-xl border border-border bg-background/50 text-xs text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent leading-relaxed resize-none font-mono"
									/>
									<span className="absolute right-3 bottom-3 text-[10px] text-muted font-mono bg-surface/90 px-1.5 py-0.5 rounded border border-border/50">
										{text.length} 字
									</span>
								</div>

								<div className="p-2.5 rounded-lg border border-border/60 bg-background/30 text-[11px] text-muted flex items-center justify-between">
									<span>内置词库: 新广告法极限词 + 平台违禁违规词</span>
									<span className="text-emerald-500 font-mono text-[10px]">
										实时动态扫描
									</span>
								</div>
							</div>
						</div>

						{/* Right Column: Diagnostic Report & Recommendations (6 cols) */}
						<div className="lg:col-span-6 space-y-4">
							<div className="p-4 rounded-xl border border-border bg-surface shadow-xs space-y-3.5">
								<div className="flex items-center justify-between">
									<h2 className="text-xs font-bold text-foreground flex items-center gap-1.5">
										<ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
										<span>排查诊断报告</span>
									</h2>
									{detectedIssues.length > 0 && (
										<span className="text-[11px] font-medium text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
											发现 {detectedIssues.length} 处违规风险
										</span>
									)}
								</div>

								{/* Diagnostic States */}
								{text.trim().length === 0 ? (
									<div className="aspect-[16/10] rounded-xl border-2 border-dashed border-border/70 bg-background/40 flex flex-col items-center justify-center text-center p-6 space-y-3">
										<div className="w-12 h-12 rounded-2xl bg-muted/10 text-muted flex items-center justify-center">
											<ShieldCheck className="w-6 h-6" />
										</div>
										<div className="space-y-1">
											<p className="text-xs font-semibold text-foreground">
												等待输入排查文案
											</p>
											<p className="text-[11px] text-muted max-w-xs">
												在左侧粘贴输入文案或点击右上角「载入测试文案」，右侧将实时进行合规分析
											</p>
										</div>
									</div>
								) : detectedIssues.length === 0 ? (
									<div className="p-8 text-center rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-2.5">
										<div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-500 mx-auto flex items-center justify-center">
											<Check className="w-6 h-6" />
										</div>
										<h3 className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
											未发现广告法极限词或高危敏感词
										</h3>
										<p className="text-[11px] text-muted max-w-xs mx-auto">
											文案合规度良好，符合主流自媒体平台发布规范，可放心发布。
										</p>
									</div>
								) : (
									<div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
										{detectedIssues.map((issue) => (
											<div
												key={issue.term}
												className={`p-3 rounded-lg border text-xs space-y-1.5 ${
													issue.severity === "high"
														? "bg-rose-500/5 border-rose-500/30 text-rose-700 dark:text-rose-400"
														: "bg-amber-500/5 border-amber-500/30 text-amber-700 dark:text-amber-400"
												}`}
											>
												<div className="flex items-center justify-between font-semibold">
													<div className="flex items-center gap-1.5">
														<AlertTriangle className="w-3.5 h-3.5 shrink-0" />
														<span>触犯词汇: {issue.matches.join(", ")}</span>
													</div>
													<span className="text-[10px] px-1.5 py-0.2 rounded font-mono uppercase">
														{issue.severity === "high" ? "高风险" : "中风险"}
													</span>
												</div>
												<p className="text-[11px] text-muted leading-relaxed">
													{issue.reason}
												</p>
												<div className="pt-1 border-t border-border/40 text-[11px] flex items-center gap-1 text-foreground/80">
													<span className="text-muted">推荐替换:</span>
													<span className="font-medium text-accent">
														{issue.replacement}
													</span>
												</div>
											</div>
										))}
									</div>
								)}

								{/* One-click Cleaned Text Box */}
								{text && detectedIssues.length > 0 && (
									<div className="p-3.5 rounded-xl border border-accent/30 bg-accent/5 space-y-2">
										<div className="flex items-center justify-between">
											<span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
												<CheckCircle2 className="w-3.5 h-3.5 text-accent" />
												<span>一键净化文案建议</span>
											</span>
											<button
												type="button"
												onClick={handleCopyCleaned}
												className="text-xs text-accent hover:underline flex items-center gap-1 cursor-pointer font-medium"
											>
												<Copy className="w-3 h-3" />
												<span>{copied ? "已复制！" : "复制净稿"}</span>
											</button>
										</div>
										<p className="text-[11px] text-muted bg-background/60 p-2.5 rounded-lg border border-border/50 line-clamp-3 font-mono">
											{cleanText}
										</p>
									</div>
								)}
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Fixed Bottom Control Dock */}
			<ToolBottomDock
				hintMessage={
					detectedIssues.length > 0
						? `检测到 ${detectedIssues.length} 处违规或极限词风险，支持一键替换并导出`
						: text.trim().length > 0
							? "当前文案合规度良好，无极限词违规风险"
							: "新广告法与平台敏感词库纯本地离线比对，毫秒响应，零泄露风险"
				}
				onExecute={handleCopyCleaned}
				executeLabel={copied ? "已复制合规文本" : "复制一键净化文案"}
				executeDisabled={!text.trim()}
				onSaveToMaterials={handleSaveToMaterials}
				saveToMaterialsDisabled={!text.trim() || isSaving}
				onSendToStudio={onSendToStudio}
			/>
		</div>
	);
}
