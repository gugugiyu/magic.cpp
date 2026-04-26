import type { ChatMessageAgenticTimings, ChatMessageTimings } from '$lib/types/chat';

export class AgenticTimingService {
	static buildFinalTimings(
		capturedTimings: ChatMessageTimings | undefined,
		agenticTimings: ChatMessageAgenticTimings
	): ChatMessageTimings | undefined {
		if (agenticTimings.toolCallsCount === 0) return capturedTimings;
		return {
			predicted_n: agenticTimings.llm.predicted_n,
			prompt_n: agenticTimings.llm.prompt_n,
			predicted_ms: capturedTimings?.predicted_ms,
			prompt_ms: capturedTimings?.prompt_ms,
			cache_n: capturedTimings?.cache_n,
			agentic: agenticTimings
		};
	}
}
