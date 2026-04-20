import { createModuleLogger } from '$lib/utils/logger';

const logger = createModuleLogger('filters');

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

// Ported from openwebui filter called markdown normalizer
// Credit: https://github.com/Fu-Jie/openwebui-extensions/blob/main/plugins/filters/markdown_normalizer/test_markdown_normalizer.py
export function normalizeMarkdown(message: string): string {
	if (!message) return message;

	try {
		let content = message;

		const patterns = {
			codeBlockPrefix: /(\S[ \t]*)(```)/g,
			codeBlockSuffix: /(```[\w+\-.]*)[ \t]+([^\n\r])/g,
			thoughtStart: /<(thought|think|thinking)>/gi,
			thoughtEnd: /<\/(thought|think|thinking)>[ \t]*\n*/gi,
			detailsEnd: /<\/details>[ \t]*\n*/gi,
			detailsSelfClosing: /(<details[^>]*\/\s*>)(?!\n)/gi,
			latexBracket: /\\\[(.+?)\\\]/gs,
			latexParen: /\\\((.+?)\\\)/g,
			listItem: /([^\n])(\d+\. )/g,
			headingSpace: /^(#+)([^ \n#])/gm,
			tablePipe: /^(\|.*[^|\n])$/gm,
			xmlArtifacts: /<\/?(?:antArtifact|antThinking|artifact)[^>]*>/gi,
			emphasisSpacing: /(?<!\*|_)(\*{1,3}|_{1,3})(?:(?!\1)[^\n])*?(\1)(?!\*|_)/g
		};

		const FULLWIDTH_MAP: Record<string, string> = {
			'\uff0c': ',',
			'\uff0e': '.',
			'\uff08': '(',
			'\uff09': ')',
			'\uff3b': '[',
			'\uff3d': ']',
			'\uff1b': ';',
			'\uff1a': ':',
			'\uff1f': '?',
			'\uff01': '!',
			'\uff02': '"',
			'\uff07': "'",
			'\u201c': '"',
			'\u201d': '"',
			'\u2018': "'",
			'\u2019': "'"
		};

		const fixEscapeCharacters = (text: string): string => {
			return text
				.replace(/\\r\\n/g, '\n')
				.replace(/\\n/g, '\n')
				.replace(/\\\\/g, '\\');
		};

		const fixThoughtTags = (text: string): string => {
			return text
				.replace(patterns.thoughtStart, '<thought>')
				.replace(patterns.thoughtEnd, '</thought>\n\n');
		};

		const fixDetailsTags = (text: string): string => {
			const parts = text.split('```');

			for (let i = 0; i < parts.length; i += 2) {
				parts[i] = parts[i]
					.replace(patterns.detailsEnd, '</details>\n\n')
					.replace(patterns.detailsSelfClosing, '$1\n');
			}

			return parts.join('```');
		};

		const fixCodeBlocks = (text: string): string => {
			return text
				.replace(patterns.codeBlockPrefix, '\n$1')
				.replace(patterns.codeBlockSuffix, '$1\n$2');
		};

		const fixLatex = (text: string): string => {
			return text.replace(patterns.latexBracket, '$$$1$$').replace(patterns.latexParen, '$$$1$');
		};

		const fixLists = (text: string): string => {
			return text.replace(patterns.listItem, '$1\n$2');
		};

		const fixUnclosedCodeBlocks = (text: string): string => {
			const count = (text.match(/```/g) || []).length;

			if (count % 2 !== 0) {
				text += '\n```';
			}

			return text;
		};

		const fixFullwidthSymbolsInCode = (text: string): string => {
			const parts = text.split('```');

			for (let i = 1; i < parts.length; i += 2) {
				for (const [full, half] of Object.entries(FULLWIDTH_MAP)) {
					parts[i] = parts[i].split(full).join(half);
				}
			}

			return parts.join('```');
		};

		const fixMermaid = (text: string): string => {
			const parts = text.split('```');

			for (let i = 1; i < parts.length; i += 2) {
				const firstLine = parts[i].split('\n')[0].trim().toLowerCase();

				if (firstLine.includes('mermaid')) {
					let block = parts[i];

					block = block.replace(/(\w+)(\[[^\]"]+\])/g, (_, id, label) => {
						return `${id}["${label.slice(1, -1)}"]`;
					});

					const subgraphs = (block.match(/\bsubgraph\b/gi) || []).length;
					const ends = (block.match(/\bend\b/gi) || []).length;

					if (subgraphs > ends) {
						block += '\n' + 'end\n'.repeat(subgraphs - ends);
					}

					parts[i] = block;
				}
			}

			return parts.join('```');
		};

		const fixHeadings = (text: string): string => {
			const parts = text.split('```');

			for (let i = 0; i < parts.length; i += 2) {
				parts[i] = parts[i].replace(patterns.headingSpace, '$1 $2');
			}

			return parts.join('```');
		};

		const fixTables = (text: string): string => {
			const parts = text.split('```');

			for (let i = 0; i < parts.length; i += 2) {
				parts[i] = parts[i].replace(patterns.tablePipe, '$1|');
			}

			return parts.join('```');
		};

		const cleanupXmlTags = (text: string): string => {
			return text.replace(patterns.xmlArtifacts, '');
		};

		const fixEmphasisSpacing = (text: string): string => {
			const parts = text.split('```');

			for (let i = 0; i < parts.length; i += 2) {
				let changed = true;

				while (changed) {
					changed = false;

					parts[i] = parts[i].replace(
						/(\*{1,3}|_{1,3})\s+([^*_].*?[^*_])\s+(\1)/g,
						(_, open, inner, close) => {
							changed = true;
							return `${open}${inner.trim()}${close}`;
						}
					);
				}
			}

			return parts.join('```');
		};

		content = fixEscapeCharacters(content);
		content = fixThoughtTags(content);
		content = fixDetailsTags(content);
		content = fixCodeBlocks(content);
		content = fixLatex(content);
		content = fixLists(content);
		content = fixUnclosedCodeBlocks(content);
		content = fixFullwidthSymbolsInCode(content);
		content = fixMermaid(content);
		content = fixHeadings(content);
		content = fixTables(content);
		content = cleanupXmlTags(content);
		content = fixEmphasisSpacing(content);

		return content;
	} catch (err) {
		logger.error('Markdown normalization failed:', err);
		return message;
	}
}

export function detectLanguagePinner(text: string): string | null {
	const match = text.match(/!\[([a-zA-Z]{2,8})\]/);
	return match ? match[1] : null;
}

export interface ResponseFilterOptions {
	filterEmojiRemoval: boolean;
	filterCodeblockOnly: boolean;
	filterRawMode: boolean;
	filterNormalizeMarkdown: boolean;
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
	if (opts.filterNormalizeMarkdown) {
		result = normalizeMarkdown(result);
	}
	return result;
}

export function getActiveFilters(opts: ResponseFilterOptions): string[] {
	const filters: string[] = [];
	if (opts.filterEmojiRemoval) filters.push('Emoji Removal');
	if (opts.filterCodeblockOnly) filters.push('Codeblock Only');
	if (opts.filterRawMode) filters.push('Raw Mode');
	if (opts.filterNormalizeMarkdown) filters.push('Markdown Normalizer');
	return filters;
}
