import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CreatorContextProvider } from "../components/creator/CreatorContext";
import { CreatorSubNav } from "../components/creator/CreatorSubNav";
import { useWorkbenchQuickActions } from "../components/workbench/layout/useWorkbenchQuickActions";
import { WorkbenchHeader } from "../components/workbench/layout/WorkbenchHeader";
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
 * Renders global WorkbenchHeader, secondary sub-navigation, and sub-route outlet.
 */
function CreatorLayout() {
	const { unclassified, settings, folders } = Route.useLoaderData();
	const { actionProps, modals } = useWorkbenchQuickActions({ folders });
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
			<div className="h-screen bg-surface dark:bg-background text-foreground flex flex-col overflow-hidden">
				<WorkbenchHeader
					unclassifiedCount={unclassified.length}
					navLayout={settings.navLayout}
					{...actionProps}
				/>
				<CreatorSubNav materialsCount={materialsCount} />
				<main className="flex-1 overflow-hidden flex flex-col min-h-0">
					<Outlet />
				</main>
				{modals}
			</div>
		</CreatorContextProvider>
	);
}
