import { agenticStore } from '$lib/stores/agentic.svelte';

export type LoadingActivity =
	| { type: 'compaction' }
	| { type: 'generation' }
	| { type: 'tool'; name: string }
	| { type: 'subagent'; skillName?: string }
	| { type: 'reasoning' };

/**
 * loadingContextStore — Derives what the chat is currently doing so the UI
 * can show contextual, playful loader messages.
 *
 * It reads from existing reactive stores (agenticStore) and also accepts
 * manual overrides (e.g. compaction) from chatStore.
 */
class LoadingContextStore {
	#compactionActive = $state(false);

	setCompaction(active: boolean): void {
		this.#compactionActive = active;
	}

	getActivity(convId: string): LoadingActivity {
		if (this.#compactionActive) {
			return { type: 'compaction' };
		}

		const streamingTool = agenticStore.streamingToolCall(convId);
		if (streamingTool) {
			if (streamingTool.name === 'sequential_thinking') {
				return { type: 'reasoning' };
			}
			return { type: 'tool', name: streamingTool.name };
		}

		const subagentProgress = agenticStore.subagentProgress(convId);
		if (subagentProgress) {
			return { type: 'subagent', skillName: subagentProgress.originSkill };
		}

		return { type: 'generation' };
	}
}

export const loadingContext = new LoadingContextStore();
