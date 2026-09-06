import { Button, toast } from "@heroui/react";
import { Chrome, Copy, RefreshCw } from "lucide-react";

interface ExtensionGuideCardProps {
	onCheckAgain: () => void;
	isChecking: boolean;
}

const EXTENSION_PATH = "extensions/aicollector/.output/chrome-mv3";

/**
 * Guide card displayed when AI Collector extension is not detected
 */
export function ExtensionGuideCard({
	onCheckAgain,
	isChecking,
}: ExtensionGuideCardProps) {
	const handleCopyPath = () => {
		navigator.clipboard.writeText(EXTENSION_PATH);
		toast.success("已复制扩展相对路径到剪贴板");
	};

	return (
		<div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex flex-col gap-3.5">
			<div className="flex items-start gap-3">
				<div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
					<Chrome className="w-5 h-5" />
				</div>
				<div className="flex-1 min-w-0">
					<h4 className="font-semibold text-foreground text-sm">
						未检测到 AI Collector 浏览器插件
					</h4>
					<p className="text-muted text-xs leading-relaxed mt-1">
						由于浏览器安全机制，网页端无法直接访问您的 Chrome 本地书签。需要配合安装内置的 AI Collector 扩展，即可实现一键实时读取。
					</p>
				</div>
			</div>

			{/* Installation Steps */}
			<div className="bg-surface/80 rounded-lg p-3 border border-border flex flex-col gap-2">
				<div className="font-semibold text-foreground text-[11px]">
					本地插件安装指引（仅需 1 分钟）：
				</div>
				<ol className="list-decimal list-inside space-y-1.5 text-muted text-[11px] leading-relaxed">
					<li>
						在 Chrome 浏览器地址栏打开{" "}
						<code className="bg-surface-secondary px-1.5 py-0.5 rounded border border-border text-foreground">
							chrome://extensions
						</code>
						，开启右上角【开发者模式】。
					</li>
					<li>点击左上角【加载已解压的扩展程序】。</li>
					<li>
						选择项目目录中的：
						<div className="flex items-center gap-1.5 mt-1">
							<code className="bg-surface-secondary px-2 py-1 rounded border border-border text-foreground font-mono text-[10px] break-all select-all flex-1">
								{EXTENSION_PATH}
							</code>
							<Button
								variant="ghost"
								size="sm"
								className="h-7 px-2 text-[10px] cursor-pointer"
								onPress={handleCopyPath}
							>
								<Copy className="w-3 h-3" />
								<span>复制</span>
							</Button>
						</div>
					</li>
				</ol>
			</div>

			{/* Action Button */}
			<div className="pt-1 flex items-center gap-2">
				<Button
					variant="primary"
					size="sm"
					className="flex-1 rounded-full shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
					onPress={onCheckAgain}
					isDisabled={isChecking}
				>
					<RefreshCw
						className={`w-3.5 h-3.5 ${isChecking ? "animate-spin" : ""}`}
					/>
					<span>我已安装，重新检测并读取</span>
				</Button>
			</div>
		</div>
	);
}
