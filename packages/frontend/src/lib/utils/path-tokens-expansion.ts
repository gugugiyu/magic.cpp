import { readFileContent as fetchFileContent } from '$lib/services/filesystem.service.js';

const PATH_TOKEN_REGEX = /@([a-zA-Z0-9_./-]+(?:\/[a-zA-Z0-9_./-]+)*)/g;

export function extractPathTokens(text: string): string[] {
	const tokens = new Set<string>();
	let match: RegExpExecArray | null;

	PATH_TOKEN_REGEX.lastIndex = 0;

	while ((match = PATH_TOKEN_REGEX.exec(text)) !== null) {
		tokens.add(match[1]);
	}

	return Array.from(tokens);
}

export async function expandPathTokensInMessage(
	content: string,
	cache: Map<string, string>
): Promise<string> {
	const tokens = extractPathTokens(content);
	if (tokens.length === 0) return content;

	let expanded = content;

	for (const token of tokens) {
		let fileContent: string;

		if (cache.has(token)) {
			fileContent = cache.get(token)!;
		} else {
			try {
				fileContent = await fetchFileContent(token);
				cache.set(token, fileContent);
			} catch (_err) {
				fileContent = `[Error reading file: ${token}]`;
				cache.set(token, fileContent);
			}
		}

		const tokenRegex = new RegExp(`@${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
		expanded = expanded.replace(tokenRegex, `\n\`\`\`${token}\n${fileContent}\n\`\`\`\n`);
	}

	return expanded;
}

export async function expandPathTokensInMessages(
	messages: Array<{ role: string; content: string }>,
	cache: Map<string, string>
): Promise<Array<{ role: string; content: string }>> {
	const expanded: Array<{ role: string; content: string }> = [];

	for (const msg of messages) {
		if (msg.role === 'user' && msg.content) {
			const expandedContent = await expandPathTokensInMessage(msg.content, cache);
			expanded.push({ ...msg, content: expandedContent });
		} else {
			expanded.push(msg);
		}
	}

	return expanded;
}

export async function readFileContent(path: string): Promise<string> {
	return fetchFileContent(path);
}
