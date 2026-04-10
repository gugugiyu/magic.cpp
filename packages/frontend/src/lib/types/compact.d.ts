/**
 * Types for compact session feature
 */

export interface CompactSessionRequest {
	/** Array of messages to compact */
	messages: Array<{
		role: string;
		content: string;
		[key: string]: unknown;
	}>;
	/** Number of recent messages to keep as anchor */
	anchorMessagesCount: number;
	/** Optional model ID to use for summarization */
	model?: string;
	/** Summary from a previous compaction, to preserve chained context */
	previousSummary?: string;
}

export interface CompactSessionResponse {
	/** Generated summary of compacted messages */
	summary: string;
	/** Token count before compaction */
	tokensBefore: number;
	/** Token count after compaction */
	tokensAfter: number;
	/** Tokens saved by compaction */
	tokensSaved: number;
}
