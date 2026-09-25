import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CreatorContextProvider } from "../components/creator/CreatorContext";
import { CreatorSubNav } from "../components/creator/CreatorSubNav";
import { CreatorSkeleton } from "../components/workbench/skeletons";
import { fetchMaterials } from "../services/api/creatorClient";
import { workbenchLoader } from "./-workbenchLoader";

export const Route = createFileRoute("/creator")({
	loader: workbenchLoader,
	pendingComponent: CreatorSkeleton,
	pendingMs: 200,
	component: CreatorLayout,
});

/**
 * Creator Layout route:
 * Sub-routes inherit the persistent global WorkbenchHeader from AppShell,
 * rendering only secondary sub-navigation and sub-route outlet here.
 */
function CreatorLayout() {
	const { unclassified, settings, folders } = Route.useLoaderData();
	const [materialsCount, setMaterialsCount] = useState<number>(0);

	useEffect(() => {
		let isMounted = true;
		fetchMaterials()
			.then((items) => {
				if (isMounted) setMaterialsCount(items.length);
			})
			.catch(() => {});
		return () => {
			isMounted = false;
		};
	}, []);

	return (
		<CreatorContextProvider
			value={{
				folders,
				unclassifiedCount: unclassified.length,
				navLayout: settings.navLayout,
				materialsCount,
				setMaterialsCount,
			}}
		>
			<div className="h-full bg-surface dark:bg-background text-foreground flex flex-col overflow-hidden">
				<CreatorSubNav materialsCount={materialsCount} />
				<main className="flex-1 overflow-hidden flex flex-col min-h-0">
					<Outlet />
				</main>
			</div>
		</CreatorContextProvider>
	);
}
