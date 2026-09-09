import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholderPage } from "../components/modules/ModulePlaceholderPage";
import { ModuleSkeleton } from "../components/workbench/skeletons";
import { workbenchLoader } from "./-workbenchLoader";

export const Route = createFileRoute("/learn")({
	loader: workbenchLoader,
	pendingComponent: ModuleSkeleton,
	pendingMs: 0,
	component: LearnPage,
});

function LearnPage() {
	const { unclassified, settings } = Route.useLoaderData();
	return (
		<ModulePlaceholderPage
			moduleCode="learn"
			unclassifiedCount={unclassified.length}
			navLayout={settings.navLayout}
		/>
	);
}
