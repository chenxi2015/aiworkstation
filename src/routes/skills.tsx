import { createFileRoute } from "@tanstack/react-router";
import { SkillsApp } from "../components/skills/SkillsApp";
import { SkillsSkeleton } from "../components/workbench/skeletons";
import { workbenchLoader } from "./-workbenchLoader";

/** Skills 模块深链参数：按目录路径直接打开 skill 详情面板 */
export interface SkillsSearch {
	skill?: string;
}

export const Route = createFileRoute("/skills")({
	validateSearch: (search: Record<string, unknown>): SkillsSearch => ({
		skill:
			typeof search.skill === "string" && search.skill
				? search.skill
				: undefined,
	}),
	loader: workbenchLoader,
	pendingComponent: SkillsSkeleton,
	pendingMs: 200,
	component: SkillsPage,
});

function SkillsPage() {
	const { unclassified, settings, folders } = Route.useLoaderData();
	const search = Route.useSearch();
	return (
		<SkillsApp
			unclassifiedCount={unclassified.length}
			navLayout={settings.navLayout}
			folders={folders}
			initialSkillPath={search.skill}
		/>
	);
}
