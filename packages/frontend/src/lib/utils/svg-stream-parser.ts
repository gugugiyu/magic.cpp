/**
 * Incremental SVG parser for live-streaming SVG code blocks.
 *
 * Given a partial SVG string (streaming in), returns a valid SVG by:
 * 1. Extracting the `<svg …>` opening tag
 * 2. Committing all content up to the last *complete* tag
 * 3. Auto-closing any unclosed tags
 * 4. Appending `</svg>`
 *
 * This produces a well-formed SVG at every step so the browser can render it
 * incrementally, creating the illusion of the illustration being "drawn to life".
 */

interface TagToken {
	raw: string;
	index: number;
	length: number;
	type: 'open' | 'close' | 'self';
	tag: string;
}

function findCompleteTags(text: string): TagToken[] {
	const tags: TagToken[] = [];
	let i = 0;

	while (i < text.length) {
		const lt = text.indexOf('<', i);
		if (lt === -1) break;

		const gt = text.indexOf('>', lt);
		if (gt === -1) break;

		const raw = text.slice(lt, gt + 1);
		// Match: <tag>, </tag>, or <tag/>
		const m = raw.match(/^<(\/?)([a-zA-Z][a-zA-Z0-9]*)[^>]*?(\/?)>$/);
		if (m) {
			const isClose = m[1] === '/';
			const tagName = m[2];
			const isSelfClose = m[3] === '/' || isClose;
			tags.push({
				raw,
				index: lt,
				length: raw.length,
				type: isClose ? 'close' : isSelfClose ? 'self' : 'open',
				tag: tagName
			});
		}
		i = gt + 1;
	}

	return tags;
}

/**
 * Builds a renderable SVG string from a partial / streaming SVG source.
 * Returns an empty string if the opening `<svg>` tag has not yet arrived.
 */
export function buildIncrementalSvg(code: string): string {
	// 1. Extract the `<svg …>` opening tag
	const svgOpenMatch = code.match(/<svg\b[^>]*>/);
	if (!svgOpenMatch) {
		return '';
	}

	const svgOpen = svgOpenMatch[0];
	let rest = code.slice(svgOpenMatch.index! + svgOpen.length);

	// 2. Strip trailing `</svg>` if already present (block nearly complete)
	const closeMatch = rest.match(/<\/svg\s*>/);
	if (closeMatch) {
		rest = rest.slice(0, closeMatch.index);
	}

	// 3. Find all complete tags in the remaining body
	const tags = findCompleteTags(rest);
	if (tags.length === 0) {
		// Only have the opening tag so far – render an empty shell
		return svgOpen + '</svg>';
	}

	// 4. Commit everything up to the end of the last complete tag.
	//    Text between tags (whitespace, text nodes) is included automatically.
	const lastTag = tags[tags.length - 1];
	const committed = rest.slice(0, lastTag.index + lastTag.length);

	// 5. Build stack of currently-open tags
	const stack: string[] = [];
	for (const t of tags) {
		if (t.type === 'open') {
			stack.push(t.tag);
		} else if (t.type === 'close') {
			if (stack.length > 0 && stack[stack.length - 1] === t.tag) {
				stack.pop();
			}
		}
		// self-closing tags do not affect the stack
	}

	// 6. Auto-close any tags still open
	let autoClose = '';
	for (let i = stack.length - 1; i >= 0; i--) {
		autoClose += `</${stack[i]}>`;
	}

	return svgOpen + committed + autoClose + '</svg>';
}
