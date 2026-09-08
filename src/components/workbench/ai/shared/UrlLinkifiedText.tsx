import { ExternalLink } from "lucide-react";
import { memo, useMemo } from "react";

const URL_SPLIT_REGEX = /(https?:\/\/[^\s<>)\]}>"'“”‘’]+)/g;
const TRAILING_PUNCT_REGEX = /[.,;:!?，。！？；：、）)"“”'‘’\]]+$/;

/** Max display length for a link label before shortening kicks in */
const MAX_LABEL_LENGTH = 42;

/**
 * Shortens a long URL for display: keeps hostname + truncated path,
 * e.g. "mp.weixin.qq.com/s?__biz=MzIyMz…"
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

export interface UrlLinkifiedTextProps {
	text: string;
}

/**
 * Renders plain text with URLs converted into clickable links.
 * Long URLs are displayed in shortened form (hostname + truncated path)
 * while still linking to the full URL; hover shows the full address.
 */
export const UrlLinkifiedText = memo(function UrlLinkifiedText({
	text,
}: UrlLinkifiedTextProps) {
	const parts = useMemo(
		() => (text ? text.split(URL_SPLIT_REGEX) : []),
		[text],
	);

	if (parts.length <= 1) return <>{text}</>;

	return (
		<>
			{parts.map((part, index) => {
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
});
