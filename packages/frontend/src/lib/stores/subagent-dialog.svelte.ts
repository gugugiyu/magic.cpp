/**
 * subagentDialogStore - Simple reactive store for subagent dialog state.
 *
 * Avoids prop-drilling through ChatScreen → ChatMessages → ChatMessage →
 * ChatMessageAssistant → ChatMessageAgenticContent.
 */

class SubagentDialogStore {
	open = $state(false);
	conversationId = $state<string>('');
	initialSessionId = $state<string | undefined>(undefined);

	openDialog(params: { conversationId: string; sessionId?: string }) {
		this.conversationId = params.conversationId;
		this.initialSessionId = params.sessionId;
		this.open = true;
	}

	closeDialog() {
		this.open = false;
		this.initialSessionId = undefined;
	}
}

export const subagentDialogStore = new SubagentDialogStore();
