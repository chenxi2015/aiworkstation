import { createFileRoute } from "@tanstack/react-router";
import { ToolsTab } from "../../components/creator/tools/ToolsTab";

export const Route = createFileRoute("/creator/tools")({
	component: ToolsPage,
});

/**
 * Creator Tools page:
 * Audio processing, video download, stem separation and other local creator utilities.
 */
function ToolsPage() {
	return <ToolsTab />;
}
