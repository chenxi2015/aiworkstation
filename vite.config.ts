import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
// Avoid static DB import at top-level so DB schema edits don't trigger full Vite config server reloads
function extensionCollectorApiPlugin(): Plugin {
	return {
		name: "extension-collector-api-plugin",
		configureServer(server) {
			server.middlewares.use(async (req, res, next) => {
				const fullUrl = req.url || "";
				const pathname = fullUrl.split("?")[0];

				if (pathname !== "/api/collect") {
					return next();
				}

				// Enable CORS for Chrome Extension
				res.setHeader("Access-Control-Allow-Origin", "*");
				res.setHeader(
					"Access-Control-Allow-Methods",
					"GET, POST, OPTIONS, HEAD",
				);
				res.setHeader(
					"Access-Control-Allow-Headers",
					"Content-Type, Authorization",
				);

				if (req.method === "OPTIONS" || req.method === "HEAD") {
					res.statusCode = 204;
					res.end();
					return;
				}

				const sendJson = (data: any, status = 200) => {
					res.setHeader("Content-Type", "application/json");
					res.statusCode = status;
					res.end(JSON.stringify(data));
				};

				const { workbenchDb } = await import("./src/server/db/sqlite.ts");

				if (req.method === "POST") {
					let body = "";
					req.on("data", (chunk) => {
						body += chunk;
					});
					req.on("end", () => {
						try {
							const payload = JSON.parse(body || "{}");
							let items: any[] = [];
							if (Array.isArray(payload.items)) {
								items = payload.items;
							} else if (payload.url) {
								items = [payload];
							}

							const count = workbenchDb.insertBookmarksBatch(items);
							sendJson({
								success: true,
								count,
								message: `成功保存 ${count} 个书签至 SQLite 数据库`,
							});
						} catch (err: any) {
							sendJson({ success: false, error: err?.message }, 400);
						}
					});
					return;
				}

				if (req.method === "GET") {
					const unclassified = workbenchDb.getUnclassifiedItems();
					sendJson({
						success: true,
						count: unclassified.length,
						items: unclassified,
					});
					return;
				}

				next();
			});
		},
	};
}

const config = defineConfig({
	server: {
		port: 3888,
	},
	resolve: { tsconfigPaths: true },
	plugins: [
		extensionCollectorApiPlugin(),
		devtools(),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
	],
});

export default config;
