import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { extensionApiPlugin } from "./src/server/api/extensionApiPlugin.ts";

process.env.VITE_CONFIG_NATIVE_IGNORE_WARNING = "true";

const config = defineConfig(({ command }) => ({
	server: {
		port: 3888,
	},
	resolve: { tsconfigPaths: true },
	plugins: [
		extensionApiPlugin(),
		devtools(),
		// Only enable Cloudflare worker runner during build to allow native SQLite in local dev
		...(command === "build"
			? [cloudflare({ viteEnvironment: { name: "ssr" } })]
			: []),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
	],
}));

export default config;
