import { Button, toast } from "@heroui/react";
import { Chrome, Copy, Download, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import {
	CHROME_EXTENSIONS_URL,
	downloadExtensionFromGithub,
} from "../../../services/extensionDownload";

interface ExtensionGuideCardProps {
	onCheckAgain: () => void;
	isChecking: boolean;
}

/**
 * Guide card displayed when AI Collector extension is not detected
 */
export function ExtensionGuideCard({
	onCheckAgain,
	isChecking,
}: ExtensionGuideCardProps) {
	const [isDownloading, setIsDownloading] = useState(false);

	const handleCopyUrl = () => {
		navigator.clipboard.writeText(CHROME_EXTENSIONS_URL);
		toast.success("已复制 Chrome 扩展页面地址到剪贴板");
	};

	const handleDownload = async () => {
		setIsDownloading(true);
		try {
			await downloadExtensionFromGithub();
		} finally {
			setIsDownloading(false);
		}
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
						由于浏览器安全机制，网页端无法直接访问您的 Chrome
						本地书签。需要配合安装 AI Collector 扩展，即可实现一键实时读取。
					</p>
				</div>
			</div>

			{/* Download Button */}
			<Button
				variant="primary"
				size="sm"
				className="w-full rounded-full shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
				onPress={handleDownload}
				isDisabled={isDownloading}
			>
				{isDownloading ? (
					<Loader2 className="w-3.5 h-3.5 animate-spin" />
				) : (
					<Download className="w-3.5 h-3.5" />
				)}
				<span>下载插件安装包（Chrome）</span>
			</Button>

			{/* Installation Steps */}
			<div className="bg-surface/80 rounded-lg p-3 border border-border flex flex-col gap-2">
				<div className="font-semibold text-foreground text-[11px]">
					插件安装指引（仅需 1 分钟）：
				</div>
				<ol className="list-decimal list-inside space-y-1.5 text-muted text-[11px] leading-relaxed">
					<li>下载上方插件安装包（.zip）后解压到本地任意文件夹。</li>
					<li>
						在 Chrome 浏览器地址栏打开{" "}
						<span className="inline-flex items-center gap-1">
							<code className="bg-surface-secondary px-1.5 py-0.5 rounded border border-border text-foreground">
								{CHROME_EXTENSIONS_URL}
							</code>
							<Button
								variant="ghost"
								size="sm"
								className="h-5 px-1.5 text-[10px] cursor-pointer"
								onPress={handleCopyUrl}
							>
								<Copy className="w-2.5 h-2.5" />
								<span>复制</span>
							</Button>
						</span>
						，开启右上角【开发者模式】。
					</li>
					<li>
						点击左上角【加载已解压的扩展程序】，选择步骤 1 解压后的文件夹即可。
					</li>
				</ol>
			</div>

			{/* Action Button */}
			<div className="pt-1 flex items-center gap-2">
				<Button
					variant="secondary"
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
