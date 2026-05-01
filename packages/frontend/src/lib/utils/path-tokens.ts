const PATH_TOKEN_REGEX = /@file\("([^"]*)"\)/g;

export interface ParsedToken {
	type: 'token';
	path: string;
	start: number;
	end: number;
}

export interface ParsedText {
	type: 'text';
	text: string;
	start: number;
	end: number;
}

export type ParsedSegment = ParsedToken | ParsedText;

export function parsePathTokens(text: string): ParsedSegment[] {
	const segments: ParsedSegment[] = [];
	let lastIndex = 0;
	let match: RegExpExecArray | null;

	PATH_TOKEN_REGEX.lastIndex = 0;

	while ((match = PATH_TOKEN_REGEX.exec(text)) !== null) {
		const start = match.index;
		const end = start + match[0].length;

		if (start > lastIndex) {
			segments.push({
				type: 'text',
				text: text.slice(lastIndex, start),
				start: lastIndex,
				end: start
			});
		}

		segments.push({
			type: 'token',
			path: match[1],
			start,
			end
		});

		lastIndex = end;
	}

	if (lastIndex < text.length) {
		segments.push({
			type: 'text',
			text: text.slice(lastIndex),
			start: lastIndex,
			end: text.length
		});
	}

	return segments;
}

export function extractPathTokens(text: string): string[] {
	const tokens = new Set<string>();
	let match: RegExpExecArray | null;

	PATH_TOKEN_REGEX.lastIndex = 0;

	while ((match = PATH_TOKEN_REGEX.exec(text)) !== null) {
		tokens.add(match[1]);
	}

	return Array.from(tokens);
}

export function hasPathTokens(text: string): boolean {
	PATH_TOKEN_REGEX.lastIndex = 0;
	return PATH_TOKEN_REGEX.test(text);
}

export function removePathTokens(text: string): string {
	return text.replace(PATH_TOKEN_REGEX, '');
}
