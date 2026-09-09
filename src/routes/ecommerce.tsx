import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholderPage } from "../components/modules/ModulePlaceholderPage";
import { ModuleSkeleton } from "../components/workbench/skeletons";
import { workbenchLoader } from "./-workbenchLoader";

export const Route = createFileRoute("/ecommerce")({
	loader: workbenchLoader,
	pendingComponent: ModuleSkeleton,
	pendingMs: 0,
	component: EcommercePage,
});

function EcommercePage() {
	const { unclassified, settings } = Route.useLoaderData();
	return (
		<ModulePlaceholderPage
			moduleCode="ecommerce"
			unclassifiedCount={unclassified.length}
			navLayout={settings.navLayout}
		/>
	);
}
