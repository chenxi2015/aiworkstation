import { Link } from "@tanstack/react-router";
import { ArrowLeft, FileQuestion } from "lucide-react";

export default function NotFound() {
	return (
		<div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-16 text-center">
			<div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-surface-secondary text-muted shadow-sm">
				<FileQuestion className="h-8 w-8 text-accent" />
			</div>
			<h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
				404
			</h1>
			<p className="mt-3 text-lg font-medium text-foreground">
				页面未找到
			</p>
			<p className="mt-1 max-w-sm text-sm text-muted">
				您访问的页面不存在、已被移动或链接有误。
			</p>
			<div className="mt-6 flex items-center gap-3">
				<Link
					to="/"
					className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground shadow-sm transition hover:opacity-90"
				>
					<ArrowLeft className="h-4 w-4" />
					返回首页
				</Link>
			</div>
		</div>
	);
}
