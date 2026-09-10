import { createFileRoute } from "@tanstack/react-router";
import { EditorApp } from "../components/editor/EditorApp";
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
		<EditorApp
			unclassifiedCount={unclassified.length}
			navLayout={settings.navLayout}
			folders={folders}
		/>
	);
}
