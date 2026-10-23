import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ModulePaywall } from "../components/cloud/ModulePaywall";
import { CreatorContextProvider } from "../components/creator/CreatorContext";
import { CreatorSubNav } from "../components/creator/CreatorSubNav";
import { CreatorSkeleton } from "../components/workbench/skeletons";
import { useCloudAuth } from "../lib/cloud/useCloudAuth";
import { fetchMaterials } from "../services/api/creatorClient";
import { useImmersiveMode } from "../stores/immersiveStore";
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
	const { isImmersive } = useImmersiveMode();
	const { isMember } = useCloudAuth();

	useEffect(() => {
		if (!isMember) return;
		let isMounted = true;
		fetchMaterials()
			.then((items) => {
				if (isMounted) setMaterialsCount(items.length);
			})
			.catch(() => {});
		return () => {
			isMounted = false;
		};
	}, [isMember]);

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
				{!isMember ? (
					<ModulePaywall
						moduleName="创作"
						description="开通工作台会员，即可解锁多平台素材库、AI 智能创作台、热点雷达与自媒体全流程创作"
					/>
				) : (
					<>
						{!isImmersive && <CreatorSubNav materialsCount={materialsCount} />}
						<main className="flex-1 overflow-hidden flex flex-col min-h-0">
							<Outlet />
						</main>
					</>
				)}
			</div>
		</CreatorContextProvider>
	);
}
