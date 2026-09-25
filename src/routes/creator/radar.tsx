import { createFileRoute } from "@tanstack/react-router";
import { Radar } from "lucide-react";
import { PlaceholderTab } from "../../components/creator/PlaceholderTab";

export const Route = createFileRoute("/creator/radar")({
	component: RadarPage,
});

/**
 * Creator Hot Topics Radar page:
 * Monitoring hot trends across Xiaohongshu, Douyin, WeChat Channels, etc.
 */
function RadarPage() {
	return (
		<PlaceholderTab
			icon={Radar}
			title="热点雷达"
			description="监控小红书、抖音、微信视频号等平台的热点话题，一键转为素材进入「热点 → 创作 → 归档」流水线。"
		/>
	);
}
