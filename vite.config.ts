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

import type { Plugin } from "vite";

/** Stub client-only @excalidraw packages during SSR bundling so Node.js runtime never evaluates browser globals (window, document) */
function excalidrawSsrStubPlugin(): Plugin {
	const STUB_ID = "\0virtual:excalidraw-ssr-stub";
	const CSS_STUB_ID = "\0virtual:excalidraw-empty-css";
	return {
		name: "excalidraw-ssr-stub",
		enforce: "pre",
		resolveId(source, _importer, options) {
			if (options?.ssr) {
				if (source.startsWith("@excalidraw/") && source.endsWith(".css")) {
					return CSS_STUB_ID;
				}
				if (
					source === "@excalidraw/excalidraw" ||
					source.startsWith("@excalidraw/")
				) {
					return STUB_ID;
				}
			}
			return null;
		},
		load(id) {
			if (id === CSS_STUB_ID) {
				return "";
			}
			if (id === STUB_ID) {
				return `
export const Excalidraw = () => null;
export const MainMenu = Object.assign(() => null, {
	DefaultItems: {
		SaveAsImage: () => null,
		Export: () => null,
		Help: () => null,
		ClearCanvas: () => null,
		ChangeCanvasBackground: () => null,
	},
	Separator: () => null,
});
export const restore = () => ({ elements: [], appState: {}, files: {} });
export const serializeAsJSON = () => "{}";
export default Excalidraw;
`;
			}
			return null;
		},
	};
}

const config = defineConfig(({ command, mode }) => {
	const isCloudflareTarget = mode === "cloudflare";
	return {
		server: {
			port: 3888,
		},
		resolve: { tsconfigPaths: true },
		optimizeDeps: {
			exclude: ["better-sqlite3"],
		},
		plugins: [
			excalidrawSsrStubPlugin(),
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
