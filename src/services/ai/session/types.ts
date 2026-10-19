import type { ChatItem } from "../../../hooks/ai/useChatMessages";
import type { AgentStepNavigation } from "../../../types/agent";
import type { ChatContextItem } from "../../../types/chatContext";

/**
 * Callbacks surfaced to UI components when agent events or tool actions occur
 */
export interface AgentSessionCallbacks {
	onMessageSent?: () => void;
	onResponseReceived?: () => void;
	onDataMutated?: () => void;
	onTriggerRewritePipeline?: (instruction?: string) => void;
	onCanvasAction?: (
		toolName: string,
		args: any,
		navigation?: AgentStepNavigation,
	) => void;
}

/**
 * Options supplied when dispatching a prompt to an agent session
 */
export interface SendPromptOptions {
	newChat?: boolean;
	folderId?: number | null;
	folderName?: string;
	baseMessages?: ChatItem[];
	contextItems?: ChatContextItem[];
	module?: string;
	activeDocumentId?: number | null;
	activeMaterialId?: number | null;
	activeNotePath?: string | null;
}

