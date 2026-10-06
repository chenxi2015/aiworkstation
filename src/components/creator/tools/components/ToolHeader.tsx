import type { ToolDefinition } from "../types";

interface ToolHeaderProps {
	tool: ToolDefinition;
	extraActions?: React.ReactNode;
}

/**
 * Standardized header banner for creator tools.
 * Displays tool identity, status badge, execution engine, and supported media formats.
 */
export function ToolHeader({ tool, extraActions }: ToolHeaderProps) {
	const Icon = tool.icon;
	const isWasm = tool.engine === "wasm";
	const isAi = tool.engine === "ai";
	const isReady = tool.status === "completed";

	return (
		<header className="p-4 px-6 border-b border-border bg-surface shrink-0">
			<div className="flex items-center justify-between gap-4">
				<div className="flex items-center gap-3.5 min-w-0">
					{/* Tool Category Icon */}
					<div
						className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
							isWasm
								? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
								: isAi
									? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
									: "bg-accent/10 text-accent border-accent/20"
						}`}
					>
						<Icon className="w-5 h-5" />
					</div>

					<div className="min-w-0">
						<div className="flex items-center gap-2 mb-1 flex-wrap">
							<h1 className="text-base font-bold text-foreground truncate">
								{tool.name}
							</h1>

							{/* Status Badge */}
							<span
								className={`text-[10px] px-2 py-0.5 rounded-full font-medium border leading-tight ${
									isReady
										? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
										: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
								}`}
							>
								{isReady ? "已就绪" : "待开发"}
							</span>

							{/* Engine Badge */}
							<span
								className={`text-[10px] px-2 py-0.5 rounded-full font-medium border leading-tight ${
									isWasm
										? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
										: isAi
											? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
											: "bg-muted/15 text-muted border-border"
								}`}
							>
								{tool.engineLabel}
							</span>

							{/* Custom Badges */}
							{tool.badges?.map((badge) => (
								<span
									key={badge}
									className="text-[10px] px-1.5 py-0.5 rounded bg-surface border border-border text-muted hidden sm:inline-block"
								>
									{badge}
								</span>
							))}
						</div>
						<p className="text-xs text-muted truncate max-w-2xl">
							{tool.description}
						</p>
					</div>
				</div>

				{/* Right Side: Formats or Custom Actions */}
				<div className="flex items-center gap-3 shrink-0">
					{extraActions}

					{tool.supportedFormats && tool.supportedFormats.length > 0 && (
						<div className="hidden md:flex flex-col items-end gap-1 shrink-0">
							<span className="text-[9px] text-muted uppercase font-mono tracking-wider">
								支持格式
							</span>
							<div className="flex items-center gap-1">
								{tool.supportedFormats.slice(0, 4).map((fmt) => (
									<span
										key={fmt}
										className="text-[10px] px-1.5 py-0.5 rounded bg-muted/10 font-mono text-muted border border-border/50"
									>
										{fmt}
									</span>
								))}
								{tool.supportedFormats.length > 4 && (
									<span className="text-[10px] text-muted">
										+{tool.supportedFormats.length - 4}
									</span>
								)}
							</div>
						</div>
					)}
				</div>
			</div>
		</header>
	);
}
