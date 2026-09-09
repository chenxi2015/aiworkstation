import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholderPage } from "../components/modules/ModulePlaceholderPage";
import { workbenchLoader } from "./-workbenchLoader";

export const Route = createFileRoute("/skills")({
	loader: workbenchLoader,
	component: SkillsPage,
});

function SkillsPage() {
	const { unclassified, settings } = Route.useLoaderData();
	return (
		<ModulePlaceholderPage
			moduleCode="skills"
			unclassifiedCount={unclassified.length}
			navLayout={settings.navLayout}
		/>
	);
}
