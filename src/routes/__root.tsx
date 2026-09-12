import { Toast } from "@heroui/react";
import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import {
	ClientOnly,
	createRootRouteWithContext,
	HeadContent,
	Scripts,
	useRouterState,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { Suspense } from "react";
import Footer from "../components/Footer";
import Header from "../components/Header";
import NotFound from "../components/NotFound";
import { RootErrorComponent } from "../components/RootErrorComponent";
import { AppShell } from "../components/shell/AppShell";
import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";
import appCss from "../styles.css?url";
import { workbenchLoader } from "./-workbenchLoader";

interface MyRouterContext {
	queryClient: QueryClient;
}

const THEME_INIT_SCRIPT = `(function(){try{var stored=window.localStorage.getItem('theme');var mode=(stored==='light'||stored==='dark')?stored:'light';var root=document.documentElement;root.classList.remove('light','dark');root.classList.add(mode);root.setAttribute('data-theme',mode);root.style.colorScheme=mode;}catch(e){}})();`;

export const Route = createRootRouteWithContext<MyRouterContext>()({
	// 根级加载文件夹/设置：喂给全局常驻 AI 面板（右侧边栏）
	loader: workbenchLoader,
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				name: "referrer",
				content: "no-referrer",
			},
			{
				title: "AI 工作台 - 本地优先的内容工作台",
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
		],
	}),
	notFoundComponent: NotFound,
	errorComponent: RootErrorComponent,
	shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	// 模板示例 Header/Footer 仅保留在 about 演示页；应用路由使用自己的模块导航
	const showTemplateChrome = pathname === "/about";
	const { queryClient } = Route.useRouteContext();

	return (
		<html lang="zh-CN" suppressHydrationWarning>
			<head>
				{/* biome-ignore lint/security/noDangerouslySetInnerHtml: theme init script */}
				<script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
				<HeadContent />
			</head>
			<body
				suppressHydrationWarning
				className="font-sans antialiased [overflow-wrap:anywhere] selection:bg-accent-soft selection:text-accent-soft-foreground"
			>
				<QueryClientProvider client={queryClient}>
					{showTemplateChrome ? (
						<>
							<Header />
							{children}
							<Footer />
						</>
					) : (
						// 全局 SPA 模式：服务端只输出文档壳，loader 数据在客户端就绪后再渲染 AppShell
						<ClientOnly fallback={null}>
							<Suspense fallback={null}>
								<AppShellWithData>{children}</AppShellWithData>
							</Suspense>
						</ClientOnly>
					)}
					<TanStackDevtools
						config={{
							position: "bottom-right",
						}}
						plugins={[
							{
								name: "Tanstack Router",
								render: <TanStackRouterDevtoolsPanel />,
							},
							TanStackQueryDevtools,
						]}
					/>
					<Toast.Provider placement="bottom" />
				</QueryClientProvider>
				<Scripts />
			</body>
		</html>
	);
}

function AppShellWithData({ children }: { children: React.ReactNode }) {
	// SPA 模式下首帧 loader 尚未完成，useLoaderData 会短暂为 undefined，待数据就绪后重渲染
	const data = Route.useLoaderData();
	if (!data) return null;
	return (
		<AppShell folders={data.folders} settings={data.settings}>
			{children}
		</AppShell>
	);
}
