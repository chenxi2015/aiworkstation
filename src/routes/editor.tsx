import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholderPage } from "../components/modules/ModulePlaceholderPage";
import { ModuleSkeleton } from "../components/workbench/skeletons";
import { workbenchLoader } from "./-workbenchLoader";

export const Route = createFileRoute("/editor")({
	loader: workbenchLoader,
	pendingComponent: ModuleSkeleton,
	pendingMs: 200,
	component: EditorPage,
});

function EditorPage() {
	const { unclassified, settings, folders } = Route.useLoaderData();
	return (
		<ModulePlaceholderPage
			moduleCode="editor"
			unclassifiedCount={unclassified.length}
			navLayout={settings.navLayout}
			folders={folders}
		/>
	);
}
