import {
	AlertTriangle,
	Check,
	Copy,
	FileText,
	RotateCcw,
	ShieldAlert,
	ShieldCheck,
	Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
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
}

/**
 * Interactive compliance and advertising law sensitive words scanner for creator copy.
 * Runs instantly in the browser without server calls.
 */
export function ComplianceChecker({ tool: _tool }: ComplianceCheckerProps) {
	const [text, setText] = useState("");
	const [copied, setCopied] = useState(false);

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
			setTimeout(() => setCopied(false), 2000);
		} catch (err) {
			console.error("Failed to copy", err);
		}
	};

	const handleLoadSample = () => {
		setText(
			"欢迎大家观看！这是全网最棒的自媒体工具箱，拥有国家级顶尖技术，100%保证能帮你解决自媒体痛点！全网独家首发，今日点击疯抢，错过后悔一辈子，永久有效！",
		);
	};

	return (
		<div className="flex-1 flex flex-col h-full bg-background overflow-y-auto p-6 space-y-6 max-w-5xl">
			{/* Top header banner */}
			<div className="flex items-start justify-between gap-4 p-4 rounded-xl border border-border bg-surface/30">
				<div>
					<div className="flex items-center gap-2 mb-1">
						<h2 className="text-sm font-bold text-foreground">
							平台违禁词与广告法自检
						</h2>
						<span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-medium">
							纯本地毫秒级检测
						</span>
					</div>
					<p className="text-xs text-muted">
						粘贴或输入推文、短视频口播文案，自动扫描新广告法极限词与平台限流词，提供一键替换建议。
					</p>
				</div>
				<button
					type="button"
					onClick={handleLoadSample}
					className="text-xs text-accent hover:underline flex items-center gap-1 shrink-0 cursor-pointer pt-1"
				>
					<Sparkles className="w-3.5 h-3.5" />
					<span>载入测试文案</span>
				</button>
			</div>

			{/* Main Editor & Analysis Split Grid */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
				{/* Left text input */}
				<div className="space-y-3">
					<div className="flex items-center justify-between">
						<label
							htmlFor="compliance-input"
							className="text-xs font-semibold text-foreground flex items-center gap-1.5"
						>
							<FileText className="w-3.5 h-3.5 text-accent" />
							<span>待检原文文案</span>
						</label>
						{text && (
							<button
								type="button"
								onClick={() => setText("")}
								className="text-[11px] text-muted hover:text-foreground flex items-center gap-1"
							>
								<RotateCcw className="w-3 h-3" />
								<span>清空</span>
							</button>
						)}
					</div>

					<div className="relative">
						<textarea
							id="compliance-input"
							value={text}
							onChange={(e) => setText(e.target.value)}
							placeholder="在此粘贴小红书图文文案、短视频口播脚本或微信推文正文..."
							rows={14}
							className="w-full p-3.5 rounded-xl border border-border bg-surface/20 text-xs text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent leading-relaxed resize-none font-mono"
						/>
						<span className="absolute right-3 bottom-3 text-[10px] text-muted font-mono bg-surface/80 px-1.5 py-0.5 rounded border border-border/50">
							{text.length} 字
						</span>
					</div>
				</div>

				{/* Right diagnostic results */}
				<div className="space-y-3">
					<div className="flex items-center justify-between">
						<span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
							<ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
							<span>排查诊断报告</span>
						</span>
						{detectedIssues.length > 0 && (
							<span className="text-[11px] font-medium text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
								发现 {detectedIssues.length} 处违规风险
							</span>
						)}
					</div>

					{text.trim().length === 0 ? (
						<div className="p-12 text-center rounded-xl border border-dashed border-border bg-surface/20 space-y-2">
							<div className="w-10 h-10 rounded-full bg-muted/10 text-muted mx-auto flex items-center justify-center">
								<ShieldCheck className="w-5 h-5" />
							</div>
							<p className="text-xs text-muted">
								请在左侧输入需要排查的文案内容
							</p>
						</div>
					) : detectedIssues.length === 0 ? (
						<div className="p-8 text-center rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-2">
							<div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-500 mx-auto flex items-center justify-center">
								<Check className="w-5 h-5" />
							</div>
							<h3 className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
								未发现广告法极限词或高危敏感词
							</h3>
							<p className="text-[11px] text-muted max-w-xs mx-auto">
								文案合规度良好，符合主流自媒体平台发布规范，可放心发布。
							</p>
						</div>
					) : (
						<div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
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
				</div>
			</div>

			{/* Bottom Action for Cleaned Text */}
			{text && detectedIssues.length > 0 && (
				<div className="p-4 rounded-xl border border-accent/30 bg-accent/5 flex items-center justify-between flex-wrap gap-3">
					<div className="space-y-0.5">
						<span className="text-xs font-semibold text-foreground">
							一键合规净稿
						</span>
						<p className="text-[11px] text-muted">
							已自动将违规词替换为推荐合规词汇，随时可复制使用。
						</p>
					</div>
					<button
						type="button"
						onClick={handleCopyCleaned}
						className="px-4 py-2 rounded-lg bg-accent text-accent-foreground text-xs font-medium flex items-center gap-1.5 hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
					>
						{copied ? (
							<>
								<Check className="w-3.5 h-3.5" />
								<span>已复制合规文本！</span>
							</>
						) : (
							<>
								<Copy className="w-3.5 h-3.5" />
								<span>复制一键净化文案</span>
							</>
						)}
					</button>
				</div>
			)}
		</div>
	);
}
