import type { ApiProcessingState, ChatMessagePromptProgress } from '$lib/types';
import type { ChatMessageTimings } from '$lib/types/chat';

export interface TimingData {
	prompt_n: number;
	prompt_ms?: number;
	predicted_n: number;
	predicted_per_second: number;
	cache_n: number;
	prompt_progress?: ChatMessagePromptProgress;
}

interface ParseTimingOptions {
	contextTotal?: number | null;
	outputTokensMax: number;
	temperature: number;
	topP: number;
}

export class ChatProcessingService {
	static parseTimingData(timingData: TimingData, options: ParseTimingOptions): ApiProcessingState {
		const { contextTotal, outputTokensMax, temperature, topP } = options;

		const promptTokens = timingData.prompt_n || 0;
		const promptMs = timingData.prompt_ms;
		const predictedTokens = timingData.predicted_n || 0;
		const tokensPerSecond = timingData.predicted_per_second || 0;
		const cacheTokens = timingData.cache_n || 0;
		const promptProgress = timingData.prompt_progress;

		const contextUsed = promptTokens + cacheTokens + predictedTokens;
		const outputTokensUsed = predictedTokens;

		const progressCache = promptProgress?.cache || 0;
		const progressActualDone = (promptProgress?.processed ?? 0) - progressCache;
		const progressActualTotal = (promptProgress?.total ?? 0) - progressCache;
		const progressPercent = promptProgress
			? Math.round((progressActualDone / progressActualTotal) * 100)
			: undefined;

		return {
			status: predictedTokens > 0 ? 'generating' : promptProgress ? 'preparing' : 'idle',
			tokensDecoded: predictedTokens,
			tokensRemaining: outputTokensMax - predictedTokens,
			contextUsed,
			contextTotal: contextTotal ?? null,
			outputTokensUsed,
			outputTokensMax,
			hasNextToken: predictedTokens > 0,
			tokensPerSecond,
			temperature,
			topP,
			speculative: false,
			progressPercent,
			promptProgress,
			promptTokens,
			promptMs,
			cacheTokens
		};
	}

	static buildTimingDataFromMessageTimings(
		timings: ChatMessageTimings | undefined,
		promptProgress: ChatMessagePromptProgress | undefined
	): TimingData {
		const tokensPerSecond =
			timings?.predicted_ms && timings?.predicted_n
				? (timings.predicted_n / timings.predicted_ms) * 1000
				: 0;

		return {
			prompt_n: timings?.prompt_n || 0,
			prompt_ms: timings?.prompt_ms,
			predicted_n: timings?.predicted_n || 0,
			predicted_per_second: tokensPerSecond,
			cache_n: timings?.cache_n || 0,
			prompt_progress: promptProgress
		};
	}

	static buildTimingDataFromMessage(message: { timings?: ChatMessageTimings }): TimingData {
		const t = message.timings;
		return {
			prompt_n: t?.prompt_n || 0,
			prompt_ms: t?.prompt_ms,
			predicted_n: t?.predicted_n || 0,
			predicted_per_second:
				t?.predicted_n && t?.predicted_ms ? (t.predicted_n / t.predicted_ms) * 1000 : 0,
			cache_n: t?.cache_n || 0
		};
	}
}
