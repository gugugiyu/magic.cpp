import { NEWLINE_SEPARATOR } from '$lib/constants';

/**
 * Returns a shortened preview of the provided content capped at the given length.
 * Appends an ellipsis when the content exceeds the maximum.
 */
export function getPreviewText(content: string, max = 150): string {
	return content.length > max ? content.slice(0, max) + '...' : content;
}

export function generateConversationTitle(content: string, useFirstLine: boolean = false): string {
	if (useFirstLine) {
		const firstLine = content.split(NEWLINE_SEPARATOR).find((line) => line.trim().length > 0);
		return firstLine ? firstLine.trim() : content.trim();
	}

	return content.trim();
}

/** Returns the number of whitespace-delimited words in a string. */
export function countWords(text: string): number {
	return text.trim().split(/\s+/).length;
}

/**
 * Truncates text to at most `maxWords` words, appending '…' when trimmed.
 * Returns the original trimmed text when it is already within the limit.
 */
export function truncateToWords(text: string, maxWords: number): string {
	const words = text.trim().split(/\s+/);
	if (words.length <= maxWords) return text.trim();
	return words.slice(0, maxWords).join(' ') + '…';
}
