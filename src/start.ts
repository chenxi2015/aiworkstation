import { createCsrfMiddleware, createStart } from "@tanstack/react-start";

// 本地优先工具：无 SEO、数据在本机 SQLite，全局 SPA 模式。
// 服务端仍保留 server functions / /api/* / 定时任务，只是不再服务端渲染页面。
const csrfMiddleware = createCsrfMiddleware({
	filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
	defaultSsr: false,
	requestMiddleware: [csrfMiddleware],
}));
