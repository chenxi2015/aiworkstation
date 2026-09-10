import { createFileRoute } from "@tanstack/react-router";
import { CreatorApp } from "../components/creator/CreatorApp";
import { ModuleSkeleton } from "../components/workbench/skeletons";
import { workbenchLoader } from "./-workbenchLoader";

export const Route = createFileRoute("/creator")({
	loader: workbenchLoader,
	pendingComponent: ModuleSkeleton,
	pendingMs: 200,
	component: CreatorPage,
});

function CreatorPage() {
	const { unclassified, settings, folders } = Route.useLoaderData();
	return (
		<CreatorApp
			unclassifiedCount={unclassified.length}
			navLayout={settings.navLayout}
			folders={folders}
		/>
	);
}
