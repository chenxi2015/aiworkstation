import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholderPage } from "../components/modules/ModulePlaceholderPage";
import { workbenchLoader } from "./-workbenchLoader";

export const Route = createFileRoute("/ecommerce")({
	loader: workbenchLoader,
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
