import { Minus, Plus, Sparkles } from "lucide-react";
import React from "react";

interface BatchCountSelectorProps {
	count: number; // 0 means unconstrained (AI decides count)
	onChangeCount: (count: number) => void;
	platform?: string;
	className?: string;
}

const PRESET_COUNTS = [1, 4, 6, 9];

/**
 * Visual generation batch count selector with quick presets, an unconstrained
 * AI-autonomous option ('不限制'), and fine-tuning steppers/direct input.
 */
export const BatchCountSelector: React.FC<BatchCountSelectorProps> = React.memo(
	function BatchCountSelector({
		count,
		onChangeCount,
		platform = "wechat",
		className = "",
	}) {
		const isRedbook = platform === "redbook";
		const isUnconstrained = count === 0;

		const handleDecrease = () => {
			if (count > 1) {
				onChangeCount(count - 1);
			} else if (count === 0) {
				onChangeCount(1);
			}
		};

		const handleIncrease = () => {
			if (count === 0) {
				onChangeCount(isRedbook ? 4 : 2);
			} else {
				onChangeCount(count + 1);
			}
		};

		return (
			<div className={`inline-flex items-center gap-1.5 select-none ${className}`}>
				<span className="text-[11px] font-medium text-muted">生成张数:</span>

				{/* Quick Preset Pills */}
				<div className="flex items-center bg-surface-secondary/70 border border-border/80 rounded-lg p-0.5 shadow-2xs">
					{/* '不限制' Option (AI decides autonomously) */}
					<button
						type="button"
						onClick={() => onChangeCount(0)}
						className={`relative px-2 py-0.5 rounded-md text-[11px] font-medium transition-all cursor-pointer flex items-center gap-1 ${
							isUnconstrained
								? "bg-accent text-accent-foreground shadow-xs font-semibold"
								: "text-muted hover:text-foreground hover:bg-surface/50"
						}`}
						title="不限制张数：由 AI 根据文章篇幅与结构自主决定生成最适张数"
					>
						<Sparkles className="w-3 h-3" />
						<span>不限制</span>
					</button>

					{PRESET_COUNTS.map((num) => {
						const isSelected = count === num;
						const isRecommended =
							(isRedbook && num === 4) || (!isRedbook && num === 1);

						return (
							<button
								type="button"
								key={num}
								onClick={() => onChangeCount(num)}
								className={`relative px-2 py-0.5 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
									isSelected
										? "bg-accent text-accent-foreground shadow-xs font-semibold"
										: "text-muted hover:text-foreground hover:bg-surface/50"
								}`}
								title={isRecommended ? "平台推荐张数" : undefined}
							>
								{num}张
								{isRecommended && !isSelected && (
									<span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
								)}
							</button>
						);
					})}
				</div>

				{/* Stepper & Direct Input adjustment */}
				<div className="flex items-center border border-border/70 rounded-lg bg-surface-secondary/40 overflow-hidden h-6 shadow-2xs">
					<button
						type="button"
						onClick={handleDecrease}
						disabled={count <= 1 && count !== 0}
						className="px-1.5 h-full text-muted hover:text-foreground hover:bg-surface/60 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer flex items-center justify-center"
						aria-label="减少张数"
					>
						<Minus className="w-3 h-3" />
					</button>
					<input
						type="text"
						value={isUnconstrained ? "AI" : count}
						onChange={(e) => {
							const val = parseInt(e.target.value, 10);
							if (!isNaN(val) && val >= 1) {
								onChangeCount(val);
							}
						}}
						className={`w-7 h-full text-[11px] font-semibold text-center bg-transparent border-0 focus:outline-hidden focus:bg-surface/80 ${
							isUnconstrained ? "text-accent font-bold" : "text-foreground"
						}`}
						title={
							isUnconstrained
								? "不限制：由 AI 自主决定张数"
								: "自定义张数（点击可输入）"
						}
					/>
					<button
						type="button"
						onClick={handleIncrease}
						className="px-1.5 h-full text-muted hover:text-foreground hover:bg-surface/60 transition-colors cursor-pointer flex items-center justify-center"
						aria-label="增加张数"
					>
						<Plus className="w-3 h-3" />
					</button>
				</div>
			</div>
		);
	},
);

