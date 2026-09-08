import type { Plugin } from "vite";
import { dispatchExtensionApiRequest } from "./router.ts";

/**
 * Vite plugin that mounts API middleware for the AI Collector Chrome Extension.
 * The actual route table lives in ./router.ts and is shared with the Nitro
 * production handler (extensionApi.nitro.ts) used in Docker/Node deployments.
 */
export function extensionApiPlugin(): Plugin {
	return {
		name: "extension-collector-api-plugin",
		configureServer(server) {
			server.middlewares.use(async (req, res, next) => {
				const handled = await dispatchExtensionApiRequest(req, res);
				if (!handled) {
					return next();
				}
			});
		},
	};
}
