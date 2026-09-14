import type { CommandProps } from "@tiptap/core";

/**
 * 选区内行内 mark style 颜色清理。
 *
 * 粘贴/导入的内容常带 <strong style="color:..."> 这类内联样式，
 * stylePreservation 会把它保留在 bold/italic 等 mark 的 attrs.style 上。
 * 渲染时 mark 自身的 inline color 直接作用于 <strong> 元素，
 * 优先级高于外层 textStyle <span style="color:..."> 的继承色，
 * 导致对这类文本（典型如加粗）设置文字颜色看似「没有效果」。
 *
 * 因此在设置/清除颜色时，顺带把选区内行内 mark style 里的
 * 同类颜色声明剥掉，让 textStyle 的颜色真正生效。
 */

const TEXT_COLOR_PROPS = ["color"];
const BACKGROUND_COLOR_PROPS = ["background-color", "background"];

/** 从内联 CSS 字符串中移除指定属性；无改动返回 null，清空返回 "" */
function removeStyleDeclarations(style: string, props: string[]): string | null {
	const declarations = style
		.split(";")
		.map((d) => d.trim())
		.filter(Boolean);
	const kept = declarations.filter((declaration) => {
		const colonIndex = declaration.indexOf(":");
		if (colonIndex === -1) return true;
		const property = declaration.slice(0, colonIndex).trim().toLowerCase();
		return !props.includes(property);
	});
	if (kept.length === declarations.length) return null;
	return kept.join("; ");
}

/**
 * 生成一个可接入 editor.chain() 的命令：
 * 移除选区内所有行内 mark style 中的文字颜色 / 背景色声明。
 * 与 setColor/unsetColor 同链调用可合并为单次事务（一次 undo 回退）。
 */
export function stripMarkStyleColor(mode: "text" | "background") {
	const props = mode === "text" ? TEXT_COLOR_PROPS : BACKGROUND_COLOR_PROPS;
	return ({ tr, state }: CommandProps): boolean => {
		for (const range of state.selection.ranges) {
			const from = range.$from.pos;
			const to = range.$to.pos;
			state.doc.nodesBetween(from, to, (node, pos) => {
				if (!node.isInline) return true;
				for (const mark of node.marks) {
					const style = mark.attrs?.style;
					if (typeof style !== "string" || !style) continue;
					const nextStyle = removeStyleDeclarations(style, props);
					if (nextStyle === null) continue;
					tr.addMark(
						pos,
						pos + node.nodeSize,
						mark.type.create({ ...mark.attrs, style: nextStyle || null }),
					);
				}
				return true;
			});
		}
		// 始终返回 true：返回 false 会中断整条 chain，导致 setColor 一起失效
		return true;
	};
}
