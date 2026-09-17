import { Box, ExternalLink, FileText } from "lucide-react";
import { memo, useMemo } from "react";

const TOKEN_SPLIT_REGEX = /(\[Skill:\s*[^\]]+\]|@\[[^\]]+\])/g;
const URL_SPLIT_REGEX = /(https?:\/\/[^\s<>)\]}>"'“”‘’]+)/g;
const TRAILING_PUNCT_REGEX = /[.,;:!?，。！？；：、）)"“”'‘’\]]+$/;

/** Max display length for a link label before shortening kicks in */
const MAX_LABEL_LENGTH = 42;

/** Format item name for clean display */
function formatItemName(name: string): string {
	if (!name) return "";
	if (name.includes(" ") && /[A-Z]/.test(name)) return name;
	return name.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Shortens a long URL for display: keeps hostname + truncated path
 */
function shortenUrlLabel(url: string): string {
	if (url.length <= MAX_LABEL_LENGTH) return url;
	try {
		const parsed = new URL(url);
		const path =
			parsed.pathname === "/" ? "" : `${parsed.pathname}${parsed.search}`;
		const budget = Math.max(MAX_LABEL_LENGTH - parsed.hostname.length - 1, 8);
		const shortPath = path.length > budget ? `${path.slice(0, budget)}…` : path;
		return `${parsed.hostname}${shortPath}`;
	} catch {
		return `${url.slice(0, MAX_LABEL_LENGTH)}…`;
	}
}

/**
 * Sub-renderer for text with clickable URLs
 */
function LinkifiedPlainPart({ text }: { text: string }) {
	const urlParts = useMemo(
		() => (text ? text.split(URL_SPLIT_REGEX) : []),
		[text],
	);

	if (urlParts.length <= 1) return <>{text}</>;

	return (
		<>
			{urlParts.map((part, index) => {
				if (!/^https?:\/\//i.test(part)) return part;
				const cleanUrl = part.replace(TRAILING_PUNCT_REGEX, "");
				const trailing = part.slice(cleanUrl.length);
				return (
					// biome-ignore lint/suspicious/noArrayIndexKey: parts derived from static text splitting
					<span key={`${cleanUrl}_${index}`}>
						<a
							href={cleanUrl}
							target="_blank"
							rel="noopener noreferrer"
							title={cleanUrl}
							onClick={(e) => e.stopPropagation()}
							className="inline-flex items-baseline gap-0.5 text-blue-600 dark:text-blue-400 hover:underline decoration-blue-400/60 underline-offset-2 break-all cursor-pointer"
						>
							<span>{shortenUrlLabel(cleanUrl)}</span>
							<ExternalLink className="w-3 h-3 shrink-0 self-center opacity-70" />
						</a>
						{trailing}
					</span>
				);
			})}
		</>
	);
}

export interface UrlLinkifiedTextProps {
	text: string;
}

/**
 * Renders message text with:
 * 1. Inline Skill Badges ([Skill: Gzh Design]) matching user reference 图一.
 * 2. Inline Mention Badges (@[Documents]).
 * 3. Clickable URLs.
 */
export const UrlLinkifiedText = memo(function UrlLinkifiedText({
	text,
}: UrlLinkifiedTextProps) {
	const tokenParts = useMemo(
		() => (text ? text.split(TOKEN_SPLIT_REGEX) : []),
		[text],
	);

	if (tokenParts.length <= 1) {
		return <LinkifiedPlainPart text={text} />;
	}

	let offset = 0;
	return (
		<>
			{tokenParts.map((part) => {
				const currentOffset = offset;
				offset += part.length;

				// 1. Skill inline token: [Skill: Name]
				if (part.startsWith("[Skill:") && part.endsWith("]")) {
					const rawSkillName = part.slice(7, -1).trim();
					const displayName = formatItemName(rawSkillName);
					return (
						<span
							key={`skill_${currentOffset}_${rawSkillName}`}
							className="inline-flex items-center align-middle h-5 gap-1 text-blue-600 dark:text-blue-400 font-medium text-xs shrink-0 select-none mx-0.5 -translate-y-px"
						>
							<Box className="w-3.5 h-3.5 shrink-0 text-blue-500 dark:text-blue-400" />
							<span className="tracking-tight leading-none">{displayName}</span>
						</span>
					);
				}

				// 2. Mention inline token: @[Title]
				if (part.startsWith("@[") && part.endsWith("]")) {
					const title = part.slice(2, -1).trim();
					return (
						<span
							key={`mention_${currentOffset}_${title}`}
							className="inline-flex items-center align-middle h-5 gap-1 text-blue-600 dark:text-blue-400 font-medium text-xs shrink-0 select-none mx-0.5 -translate-y-px"
						>
							<FileText className="w-3.5 h-3.5 shrink-0 text-blue-500 dark:text-blue-400" />
							<span className="tracking-tight leading-none">{title}</span>
						</span>
					);
				}

				// 3. Normal plain text with URL linkification
				return <LinkifiedPlainPart key={`text_${currentOffset}`} text={part} />;
			})}
		</>
	);
});
