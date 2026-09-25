import { createFileRoute } from "@tanstack/react-router";
import { Wrench } from "lucide-react";
import { PlaceholderTab } from "../../components/creator/PlaceholderTab";

export const Route = createFileRoute("/creator/tools")({
	component: ToolsPage,
});

/**
 * Creator Tools page:
 * Audio processing, video download, stem separation and other local creator utilities.
 */
function ToolsPage() {
	return (
		<PlaceholderTab
			icon={Wrench}
			title="工具箱"
			description="音频处理、视频爬取、音频分离等本地创作工具，将在这里陆续上线。"
		/>
	);
}
