import { createFileRoute } from "@tanstack/react-router";
import { SkillsApp } from "../components/skills/SkillsApp";
import { ModuleSkeleton } from "../components/workbench/skeletons";
import { workbenchLoader } from "./-workbenchLoader";

export const Route = createFileRoute("/skills")({
	loader: workbenchLoader,
	pendingComponent: ModuleSkeleton,
	pendingMs: 200,
	component: SkillsPage,
});

function SkillsPage() {
	const { unclassified, settings, folders } = Route.useLoaderData();
	return (
		<SkillsApp
			unclassifiedCount={unclassified.length}
			navLayout={settings.navLayout}
			folders={folders}
		/>
	);
}
