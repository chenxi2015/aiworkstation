import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import NotFound from "./components/NotFound";
import { getContext } from "./integrations/tanstack-query/root-provider";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
	const context = getContext();

	const router = createTanStackRouter({
		routeTree,
		context,
		scrollRestoration: true,
		defaultPreload: "intent",
		// 本地 SQLite 读写是毫秒级，30s 内复用 loader 数据避免每次 hover/导航都重查库；
		// 数据变更统一走 router.invalidate() 强制刷新，不受 staleTime 影响
		defaultStaleTime: 30_000,
		defaultPreloadStaleTime: 30_000,
		defaultNotFoundComponent: NotFound,
	});

	return router;
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
