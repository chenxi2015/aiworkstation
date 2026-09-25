import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ToolSidebar } from "./ToolSidebar";
import { ToolWorkspace } from "./ToolWorkspace";
import { CREATOR_TOOLS } from "./toolsRegistry";
import type { ToolCategory } from "./types";

/**
 * Main Creator Toolbox tab layout:
 * Left sidebar for categorized tool navigation, Right workspace canvas for current tool interaction.
 */
export function ToolsTab() {
	const navigate = useNavigate();
	const [activeCategory, setActiveCategory] = useState<ToolCategory>("all");
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedToolId, setSelectedToolId] = useState<string>(
		CREATOR_TOOLS[0]?.id ?? "video-extract-audio",
	);

	// Filter tools based on category and search query
	const filteredTools = useMemo(() => {
		const query = searchQuery.trim().toLowerCase();
		return CREATOR_TOOLS.filter((tool) => {
			const matchCategory =
				activeCategory === "all" || tool.category === activeCategory;
			const matchQuery =
				!query ||
				tool.name.toLowerCase().includes(query) ||
				tool.description.toLowerCase().includes(query) ||
				tool.engineLabel.toLowerCase().includes(query) ||
				tool.features.some((f) => f.toLowerCase().includes(query));
			return matchCategory && matchQuery;
		});
	}, [activeCategory, searchQuery]);

	// Find currently selected tool, fallback to first matching tool
	const activeTool = useMemo(() => {
		return (
			filteredTools.find((t) => t.id === selectedToolId) ??
			filteredTools[0] ??
			CREATOR_TOOLS[0]
		);
	}, [filteredTools, selectedToolId]);

	const handleSaveToMaterials = (_resultInfo: string) => {
		// Callback for saving output to materials library
	};

	const handleSendToStudio = () => {
		// Navigate to creator studio tab
		navigate({ to: "/creator/studio" });
	};

	return (
		<div className="flex-1 flex h-full overflow-hidden bg-background">
			<ToolSidebar
				tools={filteredTools}
				selectedToolId={activeTool?.id ?? ""}
				onSelectTool={setSelectedToolId}
				activeCategory={activeCategory}
				onSelectCategory={(cat) => {
					setActiveCategory(cat);
				}}
				searchQuery={searchQuery}
				onSearchChange={setSearchQuery}
			/>

			{activeTool ? (
				<ToolWorkspace
					tool={activeTool}
					onSaveToMaterials={handleSaveToMaterials}
					onSendToStudio={handleSendToStudio}
				/>
			) : (
				<div className="flex-1 flex items-center justify-center text-muted text-xs">
					未选择任何工具
				</div>
			)}
		</div>
	);
}
