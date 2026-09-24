import {
	Code2,
	FileText,
	Layers,
	LineChart,
	Palette,
	Search,
	ShieldCheck,
} from "lucide-react";
import type { SkillInfo } from "./types";

interface SkillIconBadgeProps {
	skill: SkillInfo;
	className?: string;
}

const PRESET_COLORS = [
	{ bg: "bg-orange-500", text: "text-white" },
	{ bg: "bg-indigo-600", text: "text-white" },
	{ bg: "bg-emerald-600", text: "text-white" },
	{ bg: "bg-amber-500", text: "text-white" },
	{ bg: "bg-sky-600", text: "text-white" },
	{ bg: "bg-rose-500", text: "text-white" },
	{ bg: "bg-purple-600", text: "text-white" },
	{ bg: "bg-teal-600", text: "text-white" },
];

/**
 * Returns a consistent stylish color and icon for a skill based on its category/name.
 */
export function SkillIconBadge({
	skill,
	className = "w-10 h-10",
}: SkillIconBadgeProps) {
	// Pick icon based on category
	const getIcon = () => {
		const category = skill.category || "";
		if (category.includes("编程") || category.includes("开发"))
			return <Code2 className="w-5 h-5" />;
		if (category.includes("办公") || category.includes("效率"))
			return <FileText className="w-5 h-5" />;
		if (category.includes("知识") || category.includes("搜索"))
			return <Search className="w-5 h-5" />;
		if (category.includes("多媒体") || category.includes("设计"))
			return <Palette className="w-5 h-5" />;
		if (category.includes("数据") || category.includes("分析"))
			return <LineChart className="w-5 h-5" />;
		if (category.includes("生活") || category.includes("安全"))
			return <ShieldCheck className="w-5 h-5" />;
		if (skill.name.toLowerCase().includes("doc"))
			return <FileText className="w-5 h-5" />;
		return <Layers className="w-5 h-5" />;
	};

	// Hash skill name to pick deterministic color
	let hash = 0;
	for (let i = 0; i < skill.name.length; i++) {
		hash = (hash + skill.name.charCodeAt(i) * 17) % PRESET_COLORS.length;
	}
	const color = PRESET_COLORS[hash] || PRESET_COLORS[0];

	return (
		<div
			className={`${className} rounded-xl ${color.bg} ${color.text} flex items-center justify-center shrink-0 shadow-xs font-semibold text-sm transition-transform group-hover:scale-105`}
		>
			{skill.iconText ? (
				<span className="text-base font-bold">{skill.iconText}</span>
			) : (
				getIcon()
			)}
		</div>
	);
}
