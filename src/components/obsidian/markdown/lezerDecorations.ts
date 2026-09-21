import { syntaxTree } from "@codemirror/language";
import { Decoration } from "@codemirror/view";
import { DataviewWidget, extractDataviewQuery } from "./DataviewWidget";
import { parseExternalUrl } from "./externalLink";
import type { LivePreviewContext } from "./livePreviewContext";
import { MermaidWidget } from "./MermaidWidget";
import { MediaWidget, mediaKindOf, resolveAssetUrl } from "./mediaWidget";
import {
	BulletWidget,
	CALLOUT_ALIASES,
	CalloutIconWidget,
	CheckboxWidget,
	HEADING_CLASSES,
	HorizontalRuleWidget,
	HtmlBlockWidget,
	InlineHtmlWidget,
	isVoidHtmlTag,
	TableWidget,
} from "./widgets";

type AstNodeRef = Parameters<
	NonNullable<Parameters<ReturnType<typeof syntaxTree>["iterate"]>[0]["enter"]>
>[0];

/**
 * Handles HTMLBlock and Table block replacements
 * @returns false to skip descending into children, or undefined if not handled
 */
function handleBlockReplacements(
	node: AstNodeRef,
	ctx: LivePreviewContext,
): boolean | undefined {
	const { from, to, name } = node;
	const { state, touches, replacedBlocks, blockWidgets, resolveHtmlAssetSrc } =
		ctx;

	if (name === "HTMLBlock") {
		if (!touches(from, to)) {
			const fromLine = state.doc.lineAt(from);
			const toLine = state.doc.lineAt(to);
			const blockFrom = fromLine.from;
			const blockTo = toLine.to;
			replacedBlocks.push({ from: blockFrom, to: blockTo });
			blockWidgets.push({
				from: blockFrom,
				to: blockTo,
				deco: Decoration.replace({
					widget: new HtmlBlockWidget(
						resolveHtmlAssetSrc(state.doc.sliceString(blockFrom, blockTo)),
					),
					block: true,
				}),
			});
		}
		return false;
	}

	if (name === "Table") {
		if (!touches(from, to)) {
			const fromLine = state.doc.lineAt(from);
			const toLine = state.doc.lineAt(to);
			const blockFrom = fromLine.from;
			const blockTo = toLine.to;
			replacedBlocks.push({ from: blockFrom, to: blockTo });
			blockWidgets.push({
				from: blockFrom,
				to: blockTo,
				deco: Decoration.replace({
					widget: new TableWidget(state.doc.sliceString(blockFrom, blockTo)),
					block: true,
				}),
			});
		}
		return false;
	}

	return undefined;
}

/**
 * Handles Headings lines and HeaderMark hide decorations
 */
function handleHeadings(node: AstNodeRef, ctx: LivePreviewContext): boolean {
	const { from, to, name } = node;
	const { state, lineTouches, marks, pushLine } = ctx;

	const headingClass = HEADING_CLASSES[name];
	if (headingClass) {
		pushLine(from, to, headingClass);
		return true;
	}

	if (name === "HeaderMark") {
		const line = state.doc.lineAt(from);
		if (!lineTouches(line.from, line.to)) {
			// Lezer's HeaderMark covers '#' only; hide trailing spaces to avoid misaligned text
			let end = to;
			while (
				end < line.to &&
				/[ \t]/.test(state.doc.sliceString(end, end + 1))
			) {
				end++;
			}
			marks.push({ from, to: end });
		}
		return true;
	}

	return false;
}

/**
 * Handles TaskMarker and ListMark decorations
 */
function handleListAndTasks(
	node: AstNodeRef,
	ctx: LivePreviewContext,
): boolean {
	const { from, to, name } = node;
	const { state, lineTouches, inlineItems } = ctx;

	if (name === "TaskMarker") {
		const line = state.doc.lineAt(from);
		if (!lineTouches(line.from, line.to)) {
			const checked = /[xX]/.test(state.doc.sliceString(from, to));
			inlineItems.push({
				from,
				to,
				deco: Decoration.replace({
					widget: new CheckboxWidget(checked, from),
				}),
			});
			if (checked && to < line.to) {
				inlineItems.push({
					from: to,
					to: line.to,
					deco: Decoration.mark({ class: "cm-live-task-done" }),
				});
			}
		}
		return true;
	}

	if (name === "ListMark") {
		const text = state.doc.sliceString(from, to);
		const line = state.doc.lineAt(from);
		if (/\d/.test(text) || lineTouches(line.from, line.to)) return true;

		const after = state.doc.sliceString(to, Math.min(to + 4, state.doc.length));
		if (/^\s*\[[ xX]\]/.test(after)) {
			inlineItems.push({ from, to, deco: Decoration.replace({}) });
			return true;
		}
		inlineItems.push({
			from,
			to,
			deco: Decoration.replace({ widget: new BulletWidget() }),
		});
		return true;
	}

	return false;
}

/**
 * Handles strong, emphasis, strikethrough, inline code and their boundary marks
 */
function handleEmphasisAndInlineCodes(
	node: AstNodeRef,
	ctx: LivePreviewContext,
): boolean {
	const { from, to, name } = node;
	const { inlineItems, lineTouches, marks } = ctx;

	switch (name) {
		case "StrongEmphasis":
			inlineItems.push({
				from,
				to,
				deco: Decoration.mark({ class: "cm-live-strong" }),
			});
			return true;
		case "Emphasis":
			inlineItems.push({
				from,
				to,
				deco: Decoration.mark({ class: "cm-live-em" }),
			});
			return true;
		case "Strikethrough":
			inlineItems.push({
				from,
				to,
				deco: Decoration.mark({ class: "cm-live-strike" }),
			});
			return true;
		case "InlineCode":
			inlineItems.push({
				from,
				to,
				deco: Decoration.mark({ class: "cm-live-incode" }),
			});
			return true;
		case "EmphasisMark":
		case "StrikethroughMark":
		case "SubscriptMark":
		case "SuperscriptMark":
		case "CodeMark": {
			const parent = node.node.parent;
			if (!lineTouches(parent?.from ?? from, parent?.to ?? to)) {
				marks.push({ from, to });
			}
			return true;
		}
		default:
			return false;
	}
}

/**
 * Handles fenced code blocks (including Dataview and Mermaid widgets) and plain code blocks
 */
function handleCodeBlocks(node: AstNodeRef, ctx: LivePreviewContext): boolean {
	const { from, to, name } = node;
	const {
		state,
		options,
		touches,
		replacedBlocks,
		blockWidgets,
		pushLine,
		codeBlockRanges,
	} = ctx;

	if (name === "FencedCode") {
		const infoNode = node.node.getChild("CodeInfo");
		const infoText = infoNode
			? state.doc.sliceString(infoNode.from, infoNode.to).trim().toLowerCase()
			: "";

		if (infoText === "dataview" && !touches(from, to)) {
			const query = extractDataviewQuery(state.doc.sliceString(from, to));
			replacedBlocks.push({ from, to });
			blockWidgets.push({
				from,
				to,
				deco: Decoration.replace({
					widget: new DataviewWidget(query, options.onNavigateNote),
					block: true,
				}),
			});
			return true;
		}

		if (infoText === "mermaid" && !touches(from, to)) {
			const code = extractDataviewQuery(state.doc.sliceString(from, to));
			replacedBlocks.push({ from, to });
			blockWidgets.push({
				from,
				to,
				deco: Decoration.replace({
					widget: new MermaidWidget(code),
					block: true,
				}),
			});
			return true;
		}

		pushLine(from, to, "cm-live-codeblock");
		codeBlockRanges.push({ from, to });
		return true;
	}

	if (name === "CodeBlock") {
		pushLine(from, to, "cm-live-codeblock");
		codeBlockRanges.push({ from, to });
		return true;
	}

	return false;
}

/**
 * Handles Blockquote and Callout formatting
 */
function handleBlockquote(node: AstNodeRef, ctx: LivePreviewContext): boolean {
	const { from, to, name } = node;
	const {
		state,
		lineTouches,
		marks,
		lineItems,
		calloutMarkRanges,
		inlineItems,
		pushLine,
	} = ctx;

	if (name === "QuoteMark") {
		if (calloutMarkRanges.some((c) => from < c.to && to > c.from)) {
			return true;
		}
		const line = state.doc.lineAt(from);
		if (!lineTouches(line.from, line.to)) {
			marks.push({ from, to });
		}
		return true;
	}

	if (name === "Blockquote") {
		const firstLine = state.doc.lineAt(from);
		const markerMatch = firstLine.text.match(/^>\s*\[!([a-zA-Z]+)\][+-]?\s?/);
		if (markerMatch) {
			const rawType = (markerMatch[1] ?? "note").toLowerCase();
			const type = CALLOUT_ALIASES[rawType] ?? rawType;
			const startLine = state.doc.lineAt(from);
			const endLine = state.doc.lineAt(
				Math.max(from, Math.min(to, state.doc.length)),
			);
			for (let l = startLine.number; l <= endLine.number; l++) {
				const lineObj = state.doc.line(l);
				const classes = [
					"cm-live-callout",
					`cm-live-callout-${type}`,
					rawType !== type ? `cm-live-callout-${rawType}` : "",
					l === startLine.number ? "cm-live-callout-first" : "",
					l === endLine.number ? "cm-live-callout-last" : "",
				]
					.filter(Boolean)
					.join(" ");
				lineItems.push({
					pos: lineObj.from,
					deco: Decoration.line({ class: classes }),
				});
			}
			if (!lineTouches(firstLine.from, firstLine.to)) {
				const markTo = firstLine.from + markerMatch[0].length;
				calloutMarkRanges.push({ from: firstLine.from, to: markTo });
				inlineItems.push({
					from: firstLine.from,
					to: markTo,
					deco: Decoration.replace({
						widget: new CalloutIconWidget(rawType),
					}),
				});
				if (markTo < firstLine.to) {
					inlineItems.push({
						from: markTo,
						to: firstLine.to,
						deco: Decoration.mark({
							class: "cm-live-callout-title",
						}),
					});
				}
			}
			return true;
		}
		pushLine(from, to, "cm-live-quote");
		return true;
	}

	return false;
}

/**
 * Handles Link, Autolink, URL, LinkMark, LinkTitle, and Image nodes
 */
function handleLinksAndMedia(
	node: AstNodeRef,
	ctx: LivePreviewContext,
): boolean {
	const { from, to, name } = node;
	const {
		state,
		options,
		lineTouches,
		inlineItems,
		marks,
		replacedBlocks,
		isSourceRevealed,
		pushLine,
		blockWidgets,
	} = ctx;

	if (name === "Link" || name === "Autolink") {
		const isExternal =
			parseExternalUrl(state.doc.sliceString(from, to), name) != null;
		const active = lineTouches(from, to);
		inlineItems.push({
			from,
			to,
			deco: Decoration.mark({
				class: [
					"cm-live-link",
					isExternal ? "cm-live-external-link" : "",
					active ? "cm-live-link-active" : "",
				]
					.filter(Boolean)
					.join(" "),
			}),
		});
		return true;
	}

	if (name === "LinkMark" || name === "LinkTitle") {
		if (
			!lineTouches(node.node.parent?.from ?? from, node.node.parent?.to ?? to)
		) {
			marks.push({ from, to });
		}
		return true;
	}

	if (name === "URL") {
		if (node.node.parent?.name === "Link") {
			if (!lineTouches(node.node.parent.from, node.node.parent.to)) {
				marks.push({ from, to });
			}
			return true;
		}
		inlineItems.push({
			from,
			to,
			deco: Decoration.mark({
				class: "cm-live-link cm-live-external-link",
			}),
		});
		return true;
	}

	if (name === "Image") {
		const raw = state.doc.sliceString(from, to);
		const m = raw.match(/^!\[(.*?)\]\(([^)\s]+)[^)]*\)$/s);
		if (!m) return true;
		const kind = mediaKindOf(m[2]);
		if (!kind) return true;
		replacedBlocks.push({ from, to });
		const widget = new MediaWidget({
			src: resolveAssetUrl(m[2], options.noteRelPath),
			alt: m[1],
			kind,
			from,
			to,
			syntax: "markdown",
			noteRelPath: options.noteRelPath,
			onPreviewImage: options.onPreviewImage,
		});
		if (isSourceRevealed(from, to)) {
			pushLine(from, to, "cm-live-media-source-line");
			blockWidgets.push({
				from: to,
				to,
				deco: Decoration.widget({ widget, block: true, side: 1 }),
			});
			return true;
		}
		blockWidgets.push({
			from,
			to,
			deco: Decoration.replace({ widget }),
		});
		return true;
	}

	return false;
}

/**
 * Handles HorizontalRule nodes
 */
function handleHorizontalRule(
	node: AstNodeRef,
	ctx: LivePreviewContext,
): boolean {
	const { from, name } = node;
	const { state, lineTouches, inlineItems, pushLine } = ctx;

	if (name !== "HorizontalRule") return false;

	const line = state.doc.lineAt(from);
	if (!lineTouches(line.from, line.to)) {
		inlineItems.push({
			from: line.from,
			to: line.to,
			deco: Decoration.replace({
				widget: new HorizontalRuleWidget(),
			}),
		});
	} else {
		pushLine(line.from, line.to, "cm-live-hr-active");
	}
	return true;
}

/**
 * Handles inline HTML tag nodes (self-closing and matched pairs)
 */
function handleInlineHtmlTag(
	node: AstNodeRef,
	ctx: LivePreviewContext,
): boolean {
	const { from, to, name } = node;
	const { state, lineTouches, consumedHtml, inlineItems, resolveHtmlAssetSrc } =
		ctx;

	if (name !== "HTMLTag") return false;

	// Skip tags inside code spans or code blocks
	for (let p = node.node.parent; p; p = p.parent) {
		if (
			p.name === "InlineCode" ||
			p.name === "CodeText" ||
			p.name === "FencedCode" ||
			p.name === "CodeBlock" ||
			p.name === "HTMLBlock"
		) {
			return true;
		}
	}

	const tagText = state.doc.sliceString(from, to);
	const openMatch = tagText.match(/^<([a-zA-Z][\w-]*)[\s\S]*?\/?>$/);
	// Close tags / comments / declarations stay raw
	if (!openMatch || tagText.startsWith("</")) return true;
	const tagName = (openMatch[1] ?? "").toLowerCase();

	// Self-closing / void tags render standalone
	if (tagText.endsWith("/>") || isVoidHtmlTag(tagName)) {
		if (lineTouches(from, to)) return true;
		inlineItems.push({
			from,
			to,
			deco: Decoration.replace({
				widget: new InlineHtmlWidget(resolveHtmlAssetSrc(tagText), null),
			}),
		});
		return true;
	}

	// Pair with the matching close tag among following siblings
	let depth = 0;
	let closeFrom = -1;
	let closeTo = -1;
	for (let sib = node.node.nextSibling; sib; sib = sib.nextSibling) {
		if (sib.name !== "HTMLTag") continue;
		const sibText = state.doc.sliceString(sib.from, sib.to);
		const m = sibText.match(/^<(\/?)([a-zA-Z][\w-]*)/);
		if (!m || (m[2] ?? "").toLowerCase() !== tagName) continue;
		if (m[1] === "/") {
			if (depth === 0) {
				closeFrom = sib.from;
				closeTo = sib.to;
				break;
			}
			depth--;
		} else if (!sibText.endsWith("/>")) {
			depth++;
		}
	}
	if (closeTo < 0 || lineTouches(from, closeTo)) return true;

	consumedHtml.push({ from, to: closeTo });
	inlineItems.push({
		from,
		to: closeTo,
		deco: Decoration.replace({
			widget: new InlineHtmlWidget(
				resolveHtmlAssetSrc(tagText),
				state.doc.sliceString(to, closeFrom),
			),
		}),
	});
	return true;
}

/**
 * Traverses Lezer syntax tree and applies Markdown/GFM live preview decorations
 */
export function processLezerSyntaxTree(
	state: LivePreviewContext["state"],
	_options: LivePreviewContext["options"],
	ctx: LivePreviewContext,
) {
	syntaxTree(state).iterate({
		from: 0,
		to: state.doc.length,
		enter(node) {
			if (ctx.inReplacedBlock(node.from, node.to)) return false;
			if (ctx.consumedHtml.some((r) => node.from >= r.from && node.to <= r.to))
				return false;

			// 1. Block-level replacements (HTMLBlock, Table)
			const blockResult = handleBlockReplacements(node, ctx);
			if (blockResult !== undefined) return blockResult;

			// 2. Headings and header marks
			if (handleHeadings(node, ctx)) return;

			// 3. Lists and task markers
			if (handleListAndTasks(node, ctx)) return;

			// 4. Inlines (strong, em, strike, code, marks)
			if (handleEmphasisAndInlineCodes(node, ctx)) return;

			// 5. Code blocks (FencedCode, Dataview, Mermaid, CodeBlock)
			if (handleCodeBlocks(node, ctx)) return;

			// 6. Blockquote and Callouts
			if (handleBlockquote(node, ctx)) return;

			// 7. Links and Media
			if (handleLinksAndMedia(node, ctx)) return;

			// 8. Horizontal rules
			if (handleHorizontalRule(node, ctx)) return;

			// 9. Inline HTML tags
			if (handleInlineHtmlTag(node, ctx)) return;
		},
	});
}
