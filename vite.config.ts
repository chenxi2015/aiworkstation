import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { extensionApiPlugin } from "./src/server/api/extensionApiPlugin.ts";

const config = defineConfig({
	server: {
		port: 3888,
	},
	resolve: { tsconfigPaths: true },
	plugins: [
		extensionApiPlugin(),
		devtools(),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
	],
});

export default config;
