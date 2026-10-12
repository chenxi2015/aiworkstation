import { useNavigate } from "@tanstack/react-router";
import {
	FileText,
	LayoutGrid,
	Palette,
	SquareArrowOutUpRight,
} from "lucide-react";
import { memo } from "react";
import type { AgentStep } from "../../../../../types/agent.ts";

/**
 * Prominent artifact result cards rendered at message level.
 *
 * Headless tool executions (e.g. silently creating/drawing a board from an
 * unrelated module) attach a `navigation` payload to their steps. This list
 * surfaces those artifacts directly under the assistant's reply so the user
 * never has to expand the collapsed tool timeline to find the entry point.
 */
export const ArtifactCardList = memo(function ArtifactCardList({
	steps,
}: {
	steps?: AgentStep[];
}) {
	const navigate = useNavigate();

	const cards = (steps ?? []).filter(
		(s) => s.status === "completed" && s.navigation,
	);
	if (cards.length === 0) return null;

	return (
		<div className="flex flex-col gap-2 mt-1">
			{cards.map((step) => {
				const nav = step.navigation!;
				const notePath = nav.searchParams?.note ?? "";
				const docId = nav.searchParams?.doc;
				const isDocument = Boolean(docId);
				const fileName = isDocument
					? (typeof step.args?.title === "string" && step.args.title) ||
						`文档 #${docId}`
					: notePath.split("/").pop() || notePath;
				const dir = isDocument
					? "创作台"
					: notePath.includes("/")
						? notePath.slice(0, notePath.lastIndexOf("/"))
						: "Vault 根目录";
				const isExcalidraw = notePath.endsWith(".excalidraw");
				const Icon = isDocument
					? FileText
					: isExcalidraw
						? Palette
						: LayoutGrid;
				const kindLabel = isDocument
					? "长文文档"
					: isExcalidraw
						? "Excalidraw 画板"
						: "Canvas 白板";

				return (
					<button
						key={`${step.id}-card`}
						type="button"
						onClick={() =>
							void navigate({
								to: nav.route,
								search: nav.searchParams,
							})
						}
						className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border border-accent/50 bg-gradient-to-r from-accent-soft/40 to-accent-soft/10 hover:from-accent-soft/60 hover:to-accent-soft/25 hover:border-accent/80 hover:shadow-md hover:shadow-accent/10 transition-all text-left cursor-pointer group/card"
					>
						<div className="w-9 h-9 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center shrink-0 group-hover/card:scale-105 transition-transform">
							<Icon className="w-4.5 h-4.5 text-accent" />
						</div>
						<div className="flex-1 min-w-0">
							<div className="text-[13px] font-semibold text-foreground truncate">
								{fileName}
							</div>
							<div className="text-[11px] text-muted truncate mt-0.5">
								{kindLabel} · {dir}
							</div>
						</div>
						<div className="flex items-center gap-1 text-[12px] font-medium text-accent shrink-0">
							<span className="group-hover/card:underline underline-offset-2">
								{nav.label}
							</span>
							<SquareArrowOutUpRight className="w-3.5 h-3.5 group-hover/card:translate-x-0.5 group-hover/card:-translate-y-0.5 transition-transform" />
						</div>
					</button>
				);
			})}
		</div>
	);
});
