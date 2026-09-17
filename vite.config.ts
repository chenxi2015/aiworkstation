import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import { extensionApiPlugin } from "./src/server/api/extensionApiPlugin.ts";

process.env.VITE_CONFIG_NATIVE_IGNORE_WARNING = "true";

// The default build produces a self-contained Node server (.output/) for
// local/Docker; `vite build --mode cloudflare` targets Cloudflare Workers.
// A Vite mode is used instead of an env var so the scripts work on Windows.

const config = defineConfig(({ command, mode }) => {
	const isCloudflareTarget = mode === "cloudflare";
	return {
	server: {
		port: 3888,
	},
	resolve: { tsconfigPaths: true },
	plugins: [
		extensionApiPlugin(),
		devtools(),
		// Only enable Cloudflare worker runner for the cloudflare build to
		// allow native SQLite in local dev / Node builds
		...(command === "build" && isCloudflareTarget
			? [cloudflare({ viteEnvironment: { name: "ssr" } })]
			: []),
		tailwindcss(),
		tanstackStart(),
		// Node/Docker target: Nitro bundles the SSR server plus the extension
		// API routes (same route table as the dev plugin, node-format handler).
		...(command === "build" && !isCloudflareTarget
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
	};
});

export default config;
