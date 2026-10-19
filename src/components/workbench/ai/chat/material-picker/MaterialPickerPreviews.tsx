import { MaterialAudioModal } from "../../../../creator/materials/MaterialAudioModal";
import { MaterialDocModal } from "../../../../creator/materials/MaterialDocModal";
import { MaterialImageModal } from "../../../../creator/materials/MaterialImageModal";
import { MaterialVideoModal } from "../../../../creator/materials/MaterialVideoModal";
import type { PreviewState } from "./types";

export interface MaterialPickerPreviewsProps {
	preview: PreviewState;
	onClose: () => void;
}

export function MaterialPickerPreviews({
	preview,
	onClose,
}: MaterialPickerPreviewsProps) {
	return (
		<>
			<MaterialVideoModal
				isOpen={preview?.kind === "video"}
				material={preview?.kind === "video" ? preview.material : null}
				onClose={onClose}
			/>
			<MaterialImageModal
				isOpen={preview?.kind === "image"}
				material={preview?.kind === "image" ? preview.material : null}
				materials={preview?.kind === "image" ? [preview.material] : []}
				onClose={onClose}
			/>
			<MaterialAudioModal
				isOpen={preview?.kind === "audio"}
				material={preview?.kind === "audio" ? preview.material : null}
				onClose={onClose}
			/>
			<MaterialDocModal
				isOpen={preview?.kind === "doc"}
				material={preview?.kind === "doc" ? preview.material : null}
				onClose={onClose}
			/>
		</>
	);
}

