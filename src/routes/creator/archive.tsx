import { createFileRoute } from "@tanstack/react-router";
import { ArchiveTab } from "../../components/creator/ArchiveTab";

export const Route = createFileRoute("/creator/archive")({
	component: ArchivePage,
});

/**
 * Creator Archive page:
 * Archive storage for finalized documents and inactive materials, with restore and re-creation capabilities.
 */
function ArchivePage() {
	return <ArchiveTab />;
}
