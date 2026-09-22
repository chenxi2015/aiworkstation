import { memo } from "react";
import { vaultAssetUrl } from "../../utils/vaultFileUtils";
import { cardClass } from "./cardShared";

export interface ImageCardBodyProps {
	file: string;
	borderStyle: React.CSSProperties;
}

export const ImageCardBody = memo(function ImageCardBody({
	file,
	borderStyle,
}: ImageCardBodyProps) {
	const name = file.split("/").pop() ?? file;
	const src = vaultAssetUrl(file);

	return (
		<div className="relative w-full h-full flex flex-col">
			{/* Top image title bar */}
			<div
				className="absolute -top-5 left-1 text-[11px] text-muted truncate max-w-[95%] select-none pointer-events-none font-medium"
				title={name}
			>
				{name}
			</div>
			<div
				className={`${cardClass} p-1.5 flex items-center justify-center bg-surface select-none overflow-hidden`}
				style={borderStyle}
			>
				<img
					src={src}
					alt={name}
					loading="lazy"
					decoding="async"
					className="max-w-full max-h-full w-auto h-auto object-contain pointer-events-none select-none"
					draggable={false}
				/>
			</div>
		</div>
	);
});
