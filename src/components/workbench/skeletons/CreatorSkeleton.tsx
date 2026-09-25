import { HeaderSkeleton } from "./HeaderSkeleton";

/**
 * Skeleton for materials table view layout
 */
export function MaterialsTableSkeleton({
	rowCount = 8,
}: {
	rowCount?: number;
}) {
	const rows = Array.from({ length: rowCount }, (_, i) => i);

	return (
		<div className="w-full overflow-x-auto animate-pulse">
			<table className="w-full text-xs">
				<thead>
					<tr className="border-b border-border/80 bg-surface/30">
						<th className="px-3 py-2.5 text-left w-14">
							<div className="w-6 h-3 rounded bg-surface-secondary/70" />
						</th>
						<th className="px-3 py-2.5 text-left min-w-[200px]">
							<div className="w-16 h-3 rounded bg-surface-secondary/70" />
						</th>
						<th className="px-3 py-2.5 text-left w-20">
							<div className="w-10 h-3 rounded bg-surface-secondary/70" />
						</th>
						<th className="px-3 py-2.5 text-left w-24">
							<div className="w-10 h-3 rounded bg-surface-secondary/70" />
						</th>
						<th className="px-3 py-2.5 text-left w-28">
							<div className="w-12 h-3 rounded bg-surface-secondary/70" />
						</th>
						<th className="px-3 py-2.5 text-left w-28">
							<div className="w-14 h-3 rounded bg-surface-secondary/70" />
						</th>
						<th className="px-3 py-2.5 text-right w-24 pr-4">
							<div className="w-8 h-3 rounded bg-surface-secondary/70 ml-auto" />
						</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-border/50">
					{rows.map((i) => (
						<tr
							key={`table-row-skel-${i}`}
							className="hover:bg-surface-secondary/20"
						>
							{/* ID */}
							<td className="px-3 py-3 w-14">
								<div className="w-5 h-3 rounded bg-surface-secondary/50" />
							</td>
							{/* Title & Preview badge */}
							<td className="px-3 py-3">
								<div className="flex items-center gap-2">
									<div className="w-4 h-4 rounded bg-surface-secondary/60 shrink-0" />
									<div
										className="h-3.5 rounded bg-surface-secondary/70"
										style={{ width: `${40 + ((i * 17) % 45)}%` }}
									/>
								</div>
							</td>
							{/* Kind tag */}
							<td className="px-3 py-3 w-20">
								<div className="w-12 h-5 rounded-full bg-surface-secondary/60" />
							</td>
							{/* Source tag */}
							<td className="px-3 py-3 w-24">
								<div className="w-14 h-5 rounded-full bg-surface-secondary/50" />
							</td>
							{/* Folder */}
							<td className="px-3 py-3 w-28">
								<div className="w-16 h-3.5 rounded bg-surface-secondary/50" />
							</td>
							{/* Updated Time */}
							<td className="px-3 py-3 w-28">
								<div className="w-20 h-3 rounded bg-surface-secondary/40" />
							</td>
							{/* Actions */}
							<td className="px-3 py-3 text-right pr-4 w-24">
								<div className="flex items-center justify-end gap-1.5">
									<div className="w-6 h-6 rounded-md bg-surface-secondary/50" />
									<div className="w-6 h-6 rounded-md bg-surface-secondary/50" />
								</div>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

/**
 * Skeleton for materials grid view layout
 */
export function MaterialsGridSkeleton({ count = 12 }: { count?: number }) {
	const items = Array.from({ length: count }, (_, i) => i);

	return (
		<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 xl:grid-cols-6 gap-3 p-5 animate-pulse">
			{items.map((i) => (
				<div
					key={`grid-card-skel-${i}`}
					className="rounded-xl border border-border/60 bg-surface/50 overflow-hidden flex flex-col"
				>
					{/* Thumbnail preview */}
					<div className="aspect-video w-full bg-surface-secondary/60 flex items-center justify-center">
						<div className="w-6 h-6 rounded-lg bg-surface-secondary/90" />
					</div>
					{/* Body info */}
					<div className="p-2.5 flex-1 flex flex-col justify-between gap-2">
						<div className="space-y-1.5">
							<div
								className="h-3 rounded bg-surface-secondary/80"
								style={{ width: `${60 + ((i * 23) % 35)}%` }}
							/>
							<div className="w-1/2 h-2.5 rounded bg-surface-secondary/50" />
						</div>
						<div className="flex items-center justify-between pt-1 border-t border-border/40">
							<div className="w-10 h-3.5 rounded-full bg-surface-secondary/50" />
							<div className="w-12 h-2.5 rounded bg-surface-secondary/40" />
						</div>
					</div>
				</div>
			))}
		</div>
	);
}

/**
 * Skeleton for left folder navigation sidebar
 */
export function CreatorFolderSidebarSkeleton() {
	return (
		<aside className="w-52 shrink-0 border-r border-border bg-surface/40 flex flex-col animate-pulse">
			{/* Header */}
			<div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
				<div className="w-16 h-3.5 rounded bg-surface-secondary/80" />
				<div className="w-5 h-5 rounded-md bg-surface-secondary/60" />
			</div>
			{/* Static standard rows */}
			<div className="flex-1 overflow-y-auto px-2 py-2 flex flex-col gap-1">
				<div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-accent/10">
					<div className="flex items-center gap-2">
						<div className="w-3.5 h-3.5 rounded bg-accent/30" />
						<div className="w-16 h-3 rounded bg-accent/40" />
					</div>
					<div className="w-5 h-3 rounded bg-accent/20" />
				</div>
				<div className="flex items-center justify-between px-2 py-1.5 rounded-lg">
					<div className="flex items-center gap-2">
						<div className="w-3.5 h-3.5 rounded bg-surface-secondary/60" />
						<div className="w-12 h-3 rounded bg-surface-secondary/60" />
					</div>
					<div className="w-4 h-3 rounded bg-surface-secondary/40" />
				</div>
				<div className="flex items-center justify-between px-2 py-1.5 rounded-lg">
					<div className="flex items-center gap-2">
						<div className="w-3.5 h-3.5 rounded bg-surface-secondary/60" />
						<div className="w-12 h-3 rounded bg-surface-secondary/60" />
					</div>
					<div className="w-4 h-3 rounded bg-surface-secondary/40" />
				</div>

				{/* Divider */}
				<div className="my-1 border-t border-border/60" />

				{/* Custom folder items */}
				{Array.from({ length: 4 }).map((_, idx) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton keys
						key={idx}
						className="flex items-center justify-between px-2 py-1.5 rounded-lg"
					>
						<div className="flex items-center gap-2">
							<div className="w-3.5 h-3.5 rounded bg-surface-secondary/50" />
							<div
								className="h-3 rounded bg-surface-secondary/50"
								style={{ width: `${50 + ((idx * 19) % 35)}px` }}
							/>
						</div>
						<div className="w-4 h-3 rounded bg-surface-secondary/40" />
					</div>
				))}
			</div>
		</aside>
	);
}

/**
 * Skeleton for top toolbar in materials view
 */
export function MaterialsToolbarSkeleton() {
	return (
		<div className="shrink-0 px-5 pt-4 border-b border-border animate-pulse">
			<div className="flex flex-wrap items-center gap-2 mb-3">
				{/* Title and counter */}
				<div className="w-20 h-4 rounded bg-surface-secondary/80 mr-1" />
				<div className="w-8 h-3 rounded bg-surface-secondary/50" />

				{/* Right actions */}
				<div className="ml-auto flex items-center gap-2">
					<div className="w-44 h-7.5 rounded-lg bg-surface-secondary/50 hidden sm:block" />
					<div className="w-7.5 h-7.5 rounded-lg bg-surface-secondary/50" />
					<div className="w-14 h-7.5 rounded-lg bg-surface-secondary/50" />
					<div className="w-20 h-7.5 rounded-lg bg-surface-secondary/50 hidden md:block" />
					<div className="w-24 h-7.5 rounded-lg bg-surface-secondary/70" />
				</div>
			</div>

			{/* Filter tabs */}
			<div className="flex items-center gap-1 pb-2.5 overflow-x-auto">
				<div className="w-14 h-6 rounded-full bg-accent/20" />
				<div className="w-14 h-6 rounded-full bg-surface-secondary/50" />
				<div className="w-14 h-6 rounded-full bg-surface-secondary/50" />
				<div className="w-14 h-6 rounded-full bg-surface-secondary/50" />
				<div className="w-14 h-6 rounded-full bg-surface-secondary/50" />
			</div>
		</div>
	);
}

/**
 * Skeleton for Drafts tab Kanban lanes
 */
export function DraftsKanbanSkeleton() {
	const lanes = [
		{ label: "待审", count: 2 },
		{ label: "创作中", count: 3 },
		{ label: "已定稿", count: 1 },
		{ label: "待发布", count: 2 },
	];

	return (
		<div className="flex-1 overflow-x-auto overflow-y-hidden min-h-0 animate-pulse">
			<div className="h-full max-w-7xl mx-auto px-6 py-5 flex flex-col gap-3 min-w-[900px]">
				<div className="w-96 h-3 rounded bg-surface-secondary/40 shrink-0" />
				<div className="flex-1 grid grid-cols-4 gap-4 min-h-0">
					{lanes.map((lane, idx) => (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton keys
							key={idx}
							className="flex flex-col rounded-2xl border border-border/70 bg-surface/40 overflow-hidden"
						>
							{/* Lane Header */}
							<div className="p-3.5 border-b border-border/70 flex items-center justify-between">
								<div className="flex items-center gap-2">
									<div className="w-14 h-3.5 rounded bg-surface-secondary/80" />
									<div className="w-5 h-4 rounded-full bg-surface-secondary/50" />
								</div>
								<div className="w-12 h-2.5 rounded bg-surface-secondary/40" />
							</div>

							{/* Lane Cards */}
							<div className="p-3 space-y-3 overflow-y-auto flex-1">
								{Array.from({ length: lane.count }).map((_, cIdx) => (
									<div
										// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton keys
										key={cIdx}
										className="p-3 rounded-xl border border-border/60 bg-surface-secondary/30 space-y-2.5"
									>
										<div className="flex items-center justify-between">
											<div className="w-12 h-4 rounded-full bg-surface-secondary/60" />
											<div className="w-16 h-2.5 rounded bg-surface-secondary/40" />
										</div>
										<div className="space-y-1.5">
											<div className="w-4/5 h-3.5 rounded bg-surface-secondary/70" />
											<div className="w-full h-2.5 rounded bg-surface-secondary/50" />
											<div className="w-3/4 h-2.5 rounded bg-surface-secondary/50" />
										</div>
										<div className="pt-1.5 flex items-center justify-between border-t border-border/40">
											<div className="w-16 h-2.5 rounded bg-surface-secondary/40" />
											<div className="w-12 h-5 rounded-md bg-surface-secondary/50" />
										</div>
									</div>
								))}
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

/**
 * Skeleton for Studio Batch (WorkbenchTab) mode
 */
export function StudioBatchSkeleton() {
	return (
		<div className="flex-1 flex min-h-0 animate-pulse">
			{/* Left Column: Material Selector & Prompt */}
			<aside className="w-[380px] shrink-0 border-r border-border flex flex-col min-h-0 bg-surface/30">
				<div className="px-4 py-3 border-b border-border shrink-0">
					<div className="w-16 h-3 rounded bg-surface-secondary/70" />
				</div>
				<div className="p-2 space-y-1.5 border-b border-border">
					<div className="w-full h-8 rounded-lg bg-surface-secondary/50" />
					<div className="w-full h-8 rounded-lg bg-surface-secondary/40" />
					<div className="w-full h-8 rounded-lg bg-surface-secondary/30" />
				</div>
				<div className="p-4 space-y-3 flex-1">
					<div className="w-20 h-3 rounded bg-surface-secondary/70" />
					<div className="w-full h-24 rounded-xl bg-surface-secondary/40" />
					<div className="w-full h-8 rounded-lg bg-accent/20" />
				</div>
			</aside>

			{/* Right Column: Platform Variants */}
			<div className="flex-1 p-6 overflow-y-auto">
				<div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
					{Array.from({ length: 4 }).map((_, idx) => (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton keys
							key={idx}
							className="rounded-2xl border border-border/70 bg-surface/40 p-4 space-y-3"
						>
							<div className="flex items-center justify-between">
								<div className="w-20 h-4 rounded-full bg-surface-secondary/70" />
								<div className="w-16 h-4 rounded bg-surface-secondary/40" />
							</div>
							<div className="space-y-2 py-2">
								<div className="w-full h-3 rounded bg-surface-secondary/60" />
								<div className="w-5/6 h-3 rounded bg-surface-secondary/50" />
								<div className="w-4/6 h-3 rounded bg-surface-secondary/40" />
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

/**
 * Skeleton for Archive tab
 */
export function ArchiveTableSkeleton() {
	return (
		<div className="flex-1 flex flex-col min-h-0 animate-pulse">
			{/* Toolbar */}
			<div className="shrink-0 px-6 py-4 border-b border-border flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="w-24 h-4 rounded bg-surface-secondary/80" />
					<div className="w-12 h-3 rounded bg-surface-secondary/50" />
				</div>
				<div className="flex items-center gap-2">
					<div className="w-40 h-7.5 rounded-lg bg-surface-secondary/50" />
					<div className="w-24 h-7.5 rounded-lg bg-surface-secondary/60" />
				</div>
			</div>
			{/* Table */}
			<div className="flex-1 p-5 overflow-y-auto">
				<MaterialsTableSkeleton rowCount={6} />
			</div>
		</div>
	);
}

/**
 * Full page skeleton placeholder for Creator route pending state.
 * Faithfully matches CreatorApp layout: WorkbenchHeader + Creator SubTabs + Materials View.
 */
export function CreatorSkeleton() {
	return (
		<div className="h-screen bg-surface dark:bg-background text-foreground flex flex-col overflow-hidden">
			{/* 1. Top Workbench Header */}
			<HeaderSkeleton />

			{/* 2. Creator Sub-Navigation Tabs */}
			<div className="border-b border-border bg-surface/60 shrink-0">
				<div className="mx-auto px-6 flex items-center gap-1">
					<div className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 border-accent text-accent">
						<div className="w-3.5 h-3.5 rounded bg-accent/40" />
						<span>素材库</span>
						<div className="ml-1 w-4 h-3.5 rounded-full bg-accent/20" />
					</div>
					<div className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium text-muted">
						<div className="w-3.5 h-3.5 rounded bg-surface-secondary/60" />
						<span>创作台</span>
					</div>
					<div className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium text-muted">
						<div className="w-3.5 h-3.5 rounded bg-surface-secondary/60" />
						<span>归档</span>
					</div>
					<div className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium text-muted hidden sm:flex">
						<div className="w-3.5 h-3.5 rounded bg-surface-secondary/60" />
						<span>工具箱</span>
					</div>
					<div className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium text-muted hidden sm:flex">
						<div className="w-3.5 h-3.5 rounded bg-surface-secondary/60" />
						<span>热点雷达</span>
					</div>
				</div>
			</div>

			{/* 3. Main Body: Folder Sidebar + Materials Content */}
			<main className="flex-1 overflow-hidden flex min-h-0">
				{/* Left Folder Sidebar */}
				<CreatorFolderSidebarSkeleton />

				{/* Right Materials Content Area */}
				<section className="flex-1 min-w-0 flex flex-col overflow-hidden">
					<MaterialsToolbarSkeleton />
					<div className="flex-1 overflow-y-auto min-h-0">
						<MaterialsTableSkeleton rowCount={10} />
					</div>
				</section>
			</main>
		</div>
	);
}
