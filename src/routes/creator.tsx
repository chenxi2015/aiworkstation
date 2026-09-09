import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholderPage } from "../components/modules/ModulePlaceholderPage";
import { ModuleSkeleton } from "../components/workbench/skeletons";
import { workbenchLoader } from "./-workbenchLoader";

export const Route = createFileRoute("/creator")({
	loader: workbenchLoader,
	pendingComponent: ModuleSkeleton,
	pendingMs: 0,
	component: CreatorPage,
});

function CreatorPage() {
	const { unclassified, settings } = Route.useLoaderData();
	return (
		<ModulePlaceholderPage
			moduleCode="creator"
			unclassifiedCount={unclassified.length}
			navLayout={settings.navLayout}
		/>
	);
}
