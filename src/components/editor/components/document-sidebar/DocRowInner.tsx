import dayjs from "dayjs";
import { FileAudio, FileVideo, Pin } from "lucide-react";
import { memo, useMemo } from "react";
import { detectDocumentMediaInfo } from "../../utils/documentMediaKind";
import { DocRowMenu } from "./DocRowMenu";
import { type DocRowCommonProps, STATUS_LABELS } from "./types";

export const DocRowInner = memo(function DocRowInner({
	doc,
	active,
	folderName,
	folders,
	onSelect,
	onDuplicate,
	onTogglePin,
	onMoveDocument,
	onArchive,
	onRequestDelete,
}: DocRowCommonProps) {
	const mediaKind = useMemo(() => detectDocumentMediaInfo(doc).kind, [doc]);

	return (
		// biome-ignore lint/a11y/useSemanticElements: nested action buttons preclude native button element
		<div
			role="button"
			tabIndex={0}
			className={`group w-full text-left px-3 py-2 rounded-lg transition-colors cursor-pointer ${
				active
					? "bg-accent/10 border border-accent/30"
					: "hover:bg-muted/10 border border-transparent"
			}`}
			onClick={(e) => {
				e.stopPropagation();
				onSelect(doc.id);
			}}
			onKeyDown={(e) => {
				if (e.key === "Enter") onSelect(doc.id);
			}}
		>
			<div className="flex items-center gap-1.5">
				{doc.pinned && (
					<Pin className="w-3 h-3 text-accent shrink-0 rotate-45" />
				)}
				<span className="text-[11px] font-mono font-medium text-muted/60 shrink-0 select-none">
					#{doc.id}
				</span>
				{mediaKind === "audio" && (
					<FileAudio className="w-3.5 h-3.5 text-accent shrink-0" />
				)}
				{mediaKind === "video" && (
					<FileVideo className="w-3.5 h-3.5 text-purple-500 shrink-0" />
				)}
				<span className="text-xs font-medium truncate flex-1 select-none">
					{doc.title}
				</span>
				<DocRowMenu
					doc={doc}
					folders={folders}
					folderName={folderName}
					onDuplicate={onDuplicate}
					onTogglePin={onTogglePin}
					onMoveDocument={onMoveDocument}
					onArchive={onArchive}
					onRequestDelete={onRequestDelete}
				/>
			</div>
			<div className="flex items-center gap-1.5 mt-1">
				{folderName && (
					<span className="text-[10px] leading-none px-1.5 py-[3px] rounded-full bg-accent/10 text-accent truncate max-w-[80px]">
						{folderName}
					</span>
				)}
				{doc.updatedAt && (
					<span className="text-[10px] leading-none text-muted/70 tabular-nums shrink-0">
						{dayjs(doc.updatedAt).format("MM-DD HH:mm")}
					</span>
				)}
				<span
					className={`ml-auto text-[10px] leading-none px-1.5 py-[3px] rounded-full shrink-0 ${
						doc.status === "finalized"
							? "bg-success/15 text-success"
							: "bg-muted/10 text-muted"
					}`}
				>
					{STATUS_LABELS[doc.status]}
				</span>
			</div>
		</div>
	);
});

