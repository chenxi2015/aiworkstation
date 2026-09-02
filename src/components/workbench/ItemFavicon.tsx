import { useState } from "react";
import { ItemIcon } from "./Icons";
import type { ItemType } from "./types";

interface ItemFaviconProps {
	url?: string;
	favicon?: string;
	type?: ItemType;
	name?: string;
	size?: "xs" | "sm" | "md" | "lg";
	className?: string;
	iconClassName?: string;
}

/**
 * Safely extract hostname from URL string
 */
function getHostname(url?: string): string | null {
	if (!url) return null;
	try {
		const parsed = new URL(url);
		if (parsed.protocol === "http:" || parsed.protocol === "https:") {
			return parsed.hostname;
		}
		return null;
	} catch {
		return null;
	}
}

/**
 * Displays website favicon with high-res Google S2 service and graceful fallback to ItemIcon
 */
export function ItemFavicon({
	url,
	favicon,
	type = "link",
	name,
	size = "sm",
	className = "",
	iconClassName = "",
}: ItemFaviconProps) {
	const [hasError, setHasError] = useState(false);
	const hostname = getHostname(url);

	// Image source: custom favicon first, fallback to Google S2 favicon service
	const imageSrc =
		favicon ||
		(hostname
			? `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`
			: null);

	const sizeClasses = {
		xs: "w-3.5 h-3.5",
		sm: "w-4 h-4",
		md: "w-5 h-5",
		lg: "w-6 h-6",
	}[size];

	if (!imageSrc || hasError) {
		return (
			<ItemIcon type={type} className={`${sizeClasses} ${iconClassName}`} />
		);
	}

	return (
		<img
			src={imageSrc}
			alt={name ? `${name} icon` : "fav"}
			className={`${sizeClasses} rounded-[4px] shrink-0 object-contain ${className}`}
			loading="lazy"
			onError={() => setHasError(true)}
		/>
	);
}
