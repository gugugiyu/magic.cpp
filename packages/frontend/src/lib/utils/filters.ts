export function applyEmojiRemoval(text: string): string {
	return text.replace(
		/\p{Extended_Pictographic}(?:[\uFE00-\uFE0F]|[\u{1F3FB}-\u{1F3FF}]|\u{20E3}|\u{200D}\p{Extended_Pictographic}(?:[\uFE00-\uFE0F]|[\u{1F3FB}-\u{1F3FF}]|\u{20E3})?)*/gu,
		''
	);
}

export function applyCodeblockOnly(text: string): string {
	const match = text.match(/```[\s\S]*?```/);
	return match ? match[0] : text;
}

export function applyRawMode(text: string): string {
	let result = text;
	result = result.replace(/^#{1,6}\s+/gm, '');
	result = result.replace(/\*\*([^*]+)\*\*/g, '$1');
	result = result.replace(/\*([^*]+)\*/g, '$1');
	result = result.replace(/__([^_]+)__/g, '$1');
	result = result.replace(/_([^_]+)_/g, '$1');
	result = result.replace(/`([^`]+)`/g, '$1');
	result = result.replace(/```[\s\S]*?```/g, '');
	result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
	result = result.replace(/^[-*+]\s+/gm, '');
	result = result.replace(/^\d+\.\s+/gm, '');
	result = result.replace(/^>\s+/gm, '');
	result = result.replace(/^---+$/gm, '');
	return result;
}

export function detectLanguagePinner(text: string): string | null {
	const match = text.match(/!\[([a-zA-Z]{2,8})\]/);
	return match ? match[1] : null;
}

export interface ResponseFilterOptions {
	filterEmojiRemoval: boolean;
	filterCodeblockOnly: boolean;
	filterRawMode: boolean;
}

export function applyResponseFilters(text: string, opts: ResponseFilterOptions): string {
	let result = text;
	if (opts.filterCodeblockOnly) {
		result = applyCodeblockOnly(result);
	}
	if (opts.filterEmojiRemoval) {
		result = applyEmojiRemoval(result);
	}
	if (opts.filterRawMode) {
		result = applyRawMode(result);
	}
	return result;
}

export function getActiveFilters(opts: ResponseFilterOptions): string[] {
	const filters: string[] = [];
	if (opts.filterEmojiRemoval) filters.push('Emoji Removal');
	if (opts.filterCodeblockOnly) filters.push('Codeblock Only');
	if (opts.filterRawMode) filters.push('Raw Mode');
	return filters;
}
