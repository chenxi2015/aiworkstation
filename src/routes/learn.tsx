import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholderPage } from "../components/modules/ModulePlaceholderPage";
import { workbenchLoader } from "./-workbenchLoader";

export const Route = createFileRoute("/learn")({
	loader: workbenchLoader,
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
