import { createFileRoute, redirect } from "@tanstack/react-router";

/** 首页固定跳转到工作台模块 */
export const Route = createFileRoute("/")({
	beforeLoad: () => {
		throw redirect({ to: "/workbench" });
	},
});
