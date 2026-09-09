import { createFileRoute } from "@tanstack/react-router";
import { SkillsApp } from "../components/skills/SkillsApp";
import { workbenchLoader } from "./-workbenchLoader";

export const Route = createFileRoute("/skills")({
	loader: workbenchLoader,
	component: SkillsPage,
});

function SkillsPage() {
	const { unclassified, settings } = Route.useLoaderData();
	return (
		<SkillsApp
			unclassifiedCount={unclassified.length}
			navLayout={settings.navLayout}
		/>
	);
}
