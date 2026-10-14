import { useStore } from "@tanstack/react-store";
import { Store } from "@tanstack/store";
import { useEffect } from "react";

export interface ImmersiveState {
	isImmersive: boolean;
}

const initialState: ImmersiveState = {
	isImmersive: false,
};

export const immersiveStore = new Store<ImmersiveState>(initialState);

export const immersiveActions = {
	enter: () => {
		immersiveStore.setState(() => ({ isImmersive: true }));
	},
	exit: () => {
		immersiveStore.setState(() => ({ isImmersive: false }));
	},
	toggle: () => {
		immersiveStore.setState((prev) => ({ isImmersive: !prev.isImmersive }));
	},
};

/**
 * Hook to consume and control immersive writing mode.
 * Supports automatic ESC key handler to exit immersive mode.
 */
export function useImmersiveMode() {
	const isImmersive = useStore(immersiveStore, (s) => s.isImmersive);

	useEffect(() => {
		if (!isImmersive) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				// Don't trigger if inside an open dialog or modal
				const hasOpenDialog = document.querySelector('[role="dialog"]');
				if (!hasOpenDialog) {
					immersiveActions.exit();
				}
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [isImmersive]);

	return {
		isImmersive,
		enter: immersiveActions.enter,
		exit: immersiveActions.exit,
		toggle: immersiveActions.toggle,
	};
}
