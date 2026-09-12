import type { ErrorComponentProps } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";

/**
 * Root error boundary component displayed when unhandled route errors occur.
 */
export function RootErrorComponent({ error, reset }: ErrorComponentProps) {
	const errorMessage =
		error instanceof Error
			? error.message
			: typeof error === "string"
				? error
				: "应用发生意外异常，请尝试重试或返回首页。";

	return (
		<div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-16 text-center">
			<div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/10 text-destructive shadow-sm">
				<AlertTriangle className="h-8 w-8" />
			</div>
			<h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
				页面遇到了一些问题
			</h1>
			<p className="mt-2 max-w-md text-sm text-muted">{errorMessage}</p>
			<div className="mt-6 flex items-center gap-3">
				<button
					type="button"
					onClick={() => reset()}
					className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground shadow-sm transition hover:opacity-90 cursor-pointer"
				>
					<RotateCcw className="h-4 w-4" />
					重试
				</button>
				<Link
					to="/"
					className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-surface-secondary"
				>
					<Home className="h-4 w-4" />
					返回首页
				</Link>
			</div>
		</div>
	);
}
