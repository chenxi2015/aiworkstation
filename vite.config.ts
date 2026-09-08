import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import { extensionApiPlugin } from "./src/server/api/extensionApiPlugin.ts";

process.env.VITE_CONFIG_NATIVE_IGNORE_WARNING = "true";

// DEPLOY_TARGET=node produces a self-contained Node server (.output/) for
// Docker; the default build target stays Cloudflare Workers.
const isNodeTarget = process.env.DEPLOY_TARGET === "node";

const config = defineConfig(({ command }) => ({
	server: {
		port: 3888,
	},
	resolve: { tsconfigPaths: true },
	plugins: [
		extensionApiPlugin(),
		devtools(),
		// Only enable Cloudflare worker runner during build to allow native SQLite in local dev
		...(command === "build" && !isNodeTarget
			? [cloudflare({ viteEnvironment: { name: "ssr" } })]
			: []),
		tailwindcss(),
		tanstackStart(),
		// Node/Docker target: Nitro bundles the SSR server plus the extension
		// API routes (same route table as the dev plugin, node-format handler).
		...(isNodeTarget
			? [
					nitro({
						handlers: [
							{
								route: "/api/**",
								handler: "./src/server/api/extensionApi.nitro.ts",
								format: "node",
							},
						],
					}),
				]
			: []),
		viteReact(),
	],
}));

export default config;
