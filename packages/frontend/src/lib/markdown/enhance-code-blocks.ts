/**
 * Rehype plugin to enhance code blocks with wrapper, header, and action buttons.
 *
 * Wraps <pre><code> elements with a container that includes:
 * - Language label
 * - Copy button
 * - Preview button (for HTML code blocks)
 *
 * This operates directly on the HAST tree for better performance,
 * avoiding the need to stringify and re-parse HTML.
 */

import type { Plugin } from 'unified';
import type { Root, Element, ElementContent } from 'hast';
import { visit } from 'unist-util-visit';
import {
	CODE_BLOCK_SCROLL_CONTAINER_CLASS,
	CODE_BLOCK_WRAPPER_CLASS,
	CODE_BLOCK_HEADER_CLASS,
	CODE_BLOCK_ACTIONS_CLASS,
	CODE_LANGUAGE_CLASS,
	COPY_CODE_BTN_CLASS,
	PREVIEW_CODE_BTN_CLASS,
	MERMAID_RENDER_BTN_CLASS,
	SVG_RENDER_BTN_CLASS,
	RELATIVE_CLASS
} from '$lib/constants';

const MERMAID_RENDER_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-play"><polygon points="6 3 20 12 6 21 6 3"/></svg>`;

const SVG_RENDER_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-image"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`;

declare global {
	interface Window {
		idxCodeBlock?: number;
	}
}

/**
 * Unique instance identifier for code block IDs.
 * Generated once per module load to avoid collisions across markdown renders.
 */
const INSTANCE_ID =
	typeof crypto !== 'undefined' && crypto.randomUUID
		? crypto.randomUUID().slice(0, 8)
		: Math.random().toString(36).slice(2, 10);

/** Module-local counter for code block IDs within a single render pass. */
let localCodeBlockIdx = 0;

const COPY_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-copy-icon lucide-copy"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;

const PREVIEW_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye lucide-eye-icon"><path d="M2.062 12.345a1 1 0 0 1 0-.69C3.5 7.73 7.36 5 12 5s8.5 2.73 9.938 6.655a1 1 0 0 1 0 .69C20.5 16.27 16.64 19 12 19s-8.5-2.73-9.938-6.655"/><circle cx="12" cy="12" r="3"/></svg>`;

/**
 * Creates an SVG element node from raw SVG string.
 * Since we can't parse HTML in HAST directly, we use the raw property.
 */
function createRawHtmlElement(html: string): Element {
	return {
		type: 'element',
		tagName: 'span',
		properties: {},
		children: [{ type: 'raw', value: html } as unknown as ElementContent]
	};
}

function createCopyButton(codeId: string): Element {
	return {
		type: 'element',
		tagName: 'button',
		properties: {
			className: [COPY_CODE_BTN_CLASS],
			'data-code-id': codeId,
			title: 'Copy code to clipboard',
			'aria-label': 'Copy code to clipboard',
			type: 'button'
		},
		children: [createRawHtmlElement(COPY_ICON_SVG)]
	};
}

function createPreviewButton(codeId: string): Element {
	return {
		type: 'element',
		tagName: 'button',
		properties: {
			className: [PREVIEW_CODE_BTN_CLASS],
			'data-code-id': codeId,
			title: 'Preview rendered HTML',
			'aria-label': 'Preview rendered HTML',
			type: 'button'
		},
		children: [createRawHtmlElement(PREVIEW_ICON_SVG)]
	};
}

function createMermaidRenderButton(codeId: string): Element {
	return {
		type: 'element',
		tagName: 'button',
		properties: {
			className: [MERMAID_RENDER_BTN_CLASS],
			'data-code-id': codeId,
			title: 'Render as interactive diagram',
			'aria-label': 'Render as interactive diagram',
			type: 'button'
		},
		children: [createRawHtmlElement(MERMAID_RENDER_ICON_SVG)]
	};
}

function createSvgRenderButton(codeId: string): Element {
	return {
		type: 'element',
		tagName: 'button',
		properties: {
			className: [SVG_RENDER_BTN_CLASS],
			'data-code-id': codeId,
			title: 'Render SVG image',
			'aria-label': 'Render SVG image',
			type: 'button'
		},
		children: [createRawHtmlElement(SVG_RENDER_ICON_SVG)]
	};
}

function extractNodeText(node: ElementContent): string {
	if (node.type === 'text') return node.value;
	if (node.type === 'element') return node.children.map(extractNodeText).join('');
	return '';
}

function extractCodeText(codeElement: Element): string {
	return codeElement.children.map(extractNodeText).join('');
}

function createHeader(language: string, codeId: string, codeText = ''): Element {
	const actions: Element[] = [createCopyButton(codeId)];
	const lang = language.toLowerCase();
	// Use regex for more tolerant SVG detection in xml blocks
	const isSvgContent = lang === 'svg' || (lang === 'xml' && /<svg[\s>]/.test(codeText));

	if (lang === 'html') {
		actions.push(createPreviewButton(codeId));
	} else if (lang === 'mermaid') {
		actions.push(createMermaidRenderButton(codeId));
	} else if (isSvgContent) {
		actions.push(createSvgRenderButton(codeId));
	}

	return {
		type: 'element',
		tagName: 'div',
		properties: { className: [CODE_BLOCK_HEADER_CLASS] },
		children: [
			{
				type: 'element',
				tagName: 'span',
				properties: { className: [CODE_LANGUAGE_CLASS] },
				children: [{ type: 'text', value: language }]
			},
			{
				type: 'element',
				tagName: 'div',
				properties: { className: [CODE_BLOCK_ACTIONS_CLASS] },
				children: actions
			}
		]
	};
}

function createScrollContainer(preElement: Element): Element {
	return {
		type: 'element',
		tagName: 'div',
		properties: { className: [CODE_BLOCK_SCROLL_CONTAINER_CLASS] },
		children: [preElement]
	};
}

function createWrapper(header: Element, preElement: Element): Element {
	return {
		type: 'element',
		tagName: 'div',
		properties: { className: [CODE_BLOCK_WRAPPER_CLASS, RELATIVE_CLASS] },
		children: [header, createScrollContainer(preElement)]
	};
}

function extractLanguage(codeElement: Element): string {
	const className = codeElement.properties?.className;
	if (!Array.isArray(className)) return 'text';

	for (const cls of className) {
		if (typeof cls === 'string' && cls.startsWith('language-')) {
			return cls.replace('language-', '');
		}
	}

	return 'text';
}

/**
 * Generates a unique code block ID using a per-instance counter.
 * Includes an instance ID prefix to avoid collisions across multiple markdown renders.
 */
function generateCodeId(): string {
	return `code-${INSTANCE_ID}-${localCodeBlockIdx++}`;
}

/**
 * Rehype plugin to enhance code blocks with wrapper, header, and action buttons.
 * This plugin wraps <pre><code> elements with a container that includes:
 * - Language label
 * - Copy button
 * - Preview button (for HTML code blocks)
 */
export const rehypeEnhanceCodeBlocks: Plugin<[], Root> = () => {
	return (tree: Root) => {
		visit(tree, 'element', (node: Element, index, parent) => {
			if (node.tagName !== 'pre' || !parent || index === undefined) return;

			const codeElement = node.children.find(
				(child: ElementContent): child is Element =>
					child.type === 'element' && (child as Element).tagName === 'code'
			);

			if (!codeElement) return;

			const language = extractLanguage(codeElement);
			const codeText = extractCodeText(codeElement);
			const codeId = generateCodeId();

			codeElement.properties = {
				...codeElement.properties,
				'data-code-id': codeId
			};

			const header = createHeader(language, codeId, codeText);
			const wrapper = createWrapper(header, node);

			// Replace pre with wrapper in parent
			(parent.children as ElementContent[])[index] = wrapper;
		});
	};
};
