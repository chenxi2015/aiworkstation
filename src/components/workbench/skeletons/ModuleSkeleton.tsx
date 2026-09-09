import { HeaderSkeleton } from "./HeaderSkeleton";

/**
 * Pending skeleton for module routes (skills / learn / creator / ecommerce / editor)
 * that share WorkbenchHeader + a single centered content area.
 */
export function ModuleSkeleton() {
	return (
		<div className="h-screen bg-surface dark:bg-background text-foreground flex flex-col overflow-hidden">
			<HeaderSkeleton />
			<main className="flex-1 flex items-center justify-center p-8 overflow-hidden">
				<div className="max-w-md w-full rounded-2xl border border-border bg-surface-secondary/40 p-8 shadow-xs animate-pulse flex flex-col items-center">
					<div className="w-14 h-14 rounded-2xl bg-surface-secondary/80 mb-4" />
					<div className="w-24 h-5 rounded bg-surface-secondary/80" />
					<div className="w-56 h-3 rounded bg-surface-secondary/50 mt-3" />
					<div className="w-full mt-6 space-y-2.5">
						<div className="w-full h-3 rounded bg-surface-secondary/50" />
						<div className="w-11/12 h-3 rounded bg-surface-secondary/40" />
						<div className="w-4/5 h-3 rounded bg-surface-secondary/40" />
					</div>
					<div className="w-40 h-2.5 rounded bg-surface-secondary/40 mt-6" />
				</div>
			</main>
		</div>
	);
}
