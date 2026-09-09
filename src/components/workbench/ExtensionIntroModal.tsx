import { Button, Modal, toast } from "@heroui/react";
import {
	Bookmark,
	Chrome,
	Copy,
	Download,
	Globe,
	Loader2,
	RefreshCw,
	Sparkles,
} from "lucide-react";
import { useCallback, useState } from "react";
import { ExtensionBridgeService } from "../../services/extensionBridge";

interface ExtensionIntroModalProps {
	isOpen: boolean;
	onClose: () => void;
}

const EXTENSION_PATH = "extensions/aicollector/.output/chrome-mv3";

/**
 * Intro / download modal shown when the AI Collector extension
 * is not installed: feature highlights, zip download and
 * local installation guide.
 */
export function ExtensionIntroModal({
	isOpen,
	onClose,
}: ExtensionIntroModalProps) {
	const [isChecking, setIsChecking] = useState(false);

	const handleCopyPath = () => {
		navigator.clipboard.writeText(EXTENSION_PATH);
		toast.success("已复制扩展相对路径到剪贴板");
	};

	const handleCheckAndOpen = useCallback(async () => {
		setIsChecking(true);
		try {
			const installed = await ExtensionBridgeService.checkInstalled();
			if (!installed) {
				toast.warning("仍未检测到插件，请确认已安装并启用，或刷新本页面后重试");
				return;
			}
			const res = await ExtensionBridgeService.openBookmarksPanel();
			if (res.success) {
				toast.success("已呼起 AI Collector 插件侧边栏");
				onClose();
			} else {
				toast.danger(res.error || "呼起插件失败，请重试");
			}
		} finally {
			setIsChecking(false);
		}
	}, [onClose]);

	return (
		<Modal.Backdrop
			isOpen={isOpen}
			onOpenChange={(open) => !open && onClose()}
			variant="blur"
		>
			<Modal.Container size="md">
				<Modal.Dialog aria-label="AI Collector 浏览器插件介绍与下载">
					<Modal.CloseTrigger />
					<Modal.Header>
						<Modal.Heading>AI Collector 浏览器插件</Modal.Heading>
					</Modal.Header>

					<Modal.Body className="flex flex-col gap-4 text-xs">
						{/* Hero */}
						<div className="flex items-start gap-3">
							<div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center shrink-0">
								<Chrome className="w-5 h-5" />
							</div>
							<div className="flex-1 min-w-0">
								<p className="text-muted text-xs leading-relaxed">
									由于浏览器安全机制，网页端无法直接访问您的 Chrome
									本地数据。安装 AI Collector
									插件后，即可在浏览器侧边栏中一键采集、同步书签，并与 AI
									工作台实时联动。
								</p>
							</div>
						</div>

						{/* Feature Highlights */}
						<div className="grid grid-cols-3 gap-2">
							<div className="rounded-lg border border-border bg-surface-secondary/60 p-2.5 flex flex-col items-center gap-1.5 text-center">
								<Bookmark className="w-4 h-4 text-accent" />
								<span className="text-[11px] font-medium text-foreground">
									一键读取书签
								</span>
							</div>
							<div className="rounded-lg border border-border bg-surface-secondary/60 p-2.5 flex flex-col items-center gap-1.5 text-center">
								<Globe className="w-4 h-4 text-accent" />
								<span className="text-[11px] font-medium text-foreground">
									网页随采随存
								</span>
							</div>
							<div className="rounded-lg border border-border bg-surface-secondary/60 p-2.5 flex flex-col items-center gap-1.5 text-center">
								<Sparkles className="w-4 h-4 text-accent" />
								<span className="text-[11px] font-medium text-foreground">
									AI 实时联动
								</span>
							</div>
						</div>

						{/* Download */}
						<Button
							variant="primary"
							size="sm"
							className="w-full rounded-full shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
							onPress={() => {
								window.open("/api/extension/download", "_blank");
							}}
						>
							<Download className="w-3.5 h-3.5" />
							<span>下载插件安装包（Chrome）</span>
						</Button>

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

						{/* Re-check */}
						<Button
							variant="secondary"
							size="sm"
							className="w-full rounded-full flex items-center justify-center gap-1.5 cursor-pointer"
							onPress={handleCheckAndOpen}
							isDisabled={isChecking}
						>
							{isChecking ? (
								<Loader2 className="w-3.5 h-3.5 animate-spin" />
							) : (
								<RefreshCw className="w-3.5 h-3.5" />
							)}
							<span>我已安装，重新检测并打开插件</span>
						</Button>
					</Modal.Body>

					<Modal.Footer className="flex items-center justify-end">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="rounded-full cursor-pointer"
							onPress={onClose}
						>
							关闭
						</Button>
					</Modal.Footer>
				</Modal.Dialog>
			</Modal.Container>
		</Modal.Backdrop>
	);
}
