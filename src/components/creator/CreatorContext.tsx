import { createContext, useContext } from "react";
import type { NavLayoutEntry } from "../../modules/registry";
import type { Folder } from "../workbench/types";

export interface CreatorContextValue {
	folders: Folder[];
	unclassifiedCount: number;
	navLayout?: NavLayoutEntry[];
	materialsCount: number;
	setMaterialsCount: (count: number) => void;
}

const CreatorContext = createContext<CreatorContextValue | null>(null);

export const CreatorContextProvider = CreatorContext.Provider;

/**
 * Access shared Creator layout context (folders, unclassified count, etc.)
 */
export function useCreatorContext(): CreatorContextValue {
	const ctx = useContext(CreatorContext);
	if (!ctx) {
		throw new Error("useCreatorContext must be used within CreatorContextProvider");
	}
	return ctx;
}
