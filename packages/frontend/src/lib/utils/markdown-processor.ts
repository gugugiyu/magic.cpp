import { remark } from 'remark';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import { all as lowlightAll } from 'lowlight';
import remarkRehype from 'remark-rehype';
import rehypeKatex from 'rehype-katex';
import rehypeStringify from 'rehype-stringify';
import type { Root as HastRoot, RootContent as HastRootContent } from 'hast';
import type { Root as MdastRoot } from 'mdast';
import { rehypeRestoreTableHtml } from '$lib/markdown/table-html-restorer';
import { rehypeEnhanceLinks } from '$lib/markdown/enhance-links';
import { rehypeEnhanceCodeBlocks } from '$lib/markdown/enhance-code-blocks';
import { rehypeResolveAttachmentImages } from '$lib/markdown/resolve-attachment-images';
import { rehypeRtlSupport } from '$lib/markdown/rehype-rtl-support';
import { remarkLiteralHtml } from '$lib/markdown/literal-html';
import { preprocessLaTeX } from '$lib/utils/latex-protection';
import { FileTypeText } from '$lib/enums/files';
import { detectIncompleteCodeBlock, type IncompleteCodeBlock } from '$lib/utils/code';

export interface MarkdownBlock {
	id: string;
	html: string;
	contentHash?: string;
}

const TRANSFORM_CACHE_MAX_SIZE = 500;

class LruCache {
	private map = new Map<string, string>();

	get(key: string): string | undefined {
		const val = this.map.get(key);
		if (val !== undefined) {
			// Re-insert to mark as most recently used
			this.map.delete(key);
			this.map.set(key, val);
		}
		return val;
	}

	set(key: string, value: string): void {
		if (this.map.has(key)) {
			this.map.delete(key);
		} else if (this.map.size >= TRANSFORM_CACHE_MAX_SIZE) {
			// Evict least recently used entry (first in Map insertion order)
			const firstKey = this.map.keys().next().value;
			if (firstKey !== undefined) this.map.delete(firstKey);
		}
		this.map.set(key, value);
	}

	clear(): void {
		this.map.clear();
	}
}

function getHastNodeId(node: HastRootContent, indexFallback: number): string {
	const position = node.position;

	if (position?.start?.offset != null && position?.end?.offset != null) {
		return `hast-${position.start.offset}-${position.end.offset}`;
	}

	return `${node.type}-${indexFallback}`;
}

function getMdastNodeHash(node: unknown, index: number): string {
	const n = node as {
		type?: string;
		position?: { start?: { offset?: number }; end?: { offset?: number } };
	};

	if (n.position?.start?.offset != null && n.position?.end?.offset != null) {
		return `${n.type}-${n.position.start.offset}-${n.position.end.offset}`;
	}

	return `${n.type}-idx${index}`;
}

export interface ProcessResult {
	renderedBlocks: MarkdownBlock[];
	unstableBlockHtml: string;
	incompleteCodeBlock: IncompleteCodeBlock | null;
	isStreamingComplete: boolean;
	changed: boolean;
}

export interface MarkdownProcessorOptions {
	disableMath?: boolean;
	attachments?: unknown[];
}

export class MarkdownProcessor {
	private transformCache = new LruCache();
	private previousContent = '';
	private previousBlocks: MarkdownBlock[] = [];
	private _options: MarkdownProcessorOptions;

	constructor(options: MarkdownProcessorOptions = {}) {
		this._options = options;
	}

	updateOptions(options: Partial<MarkdownProcessorOptions>): void {
		this._options = { ...this._options, ...options };
	}

	private createProcessor() {
		const { disableMath, attachments } = this._options;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let proc: any = remark().use(remarkGfm); // GitHub Flavored Markdown

		if (!disableMath) {
			proc = proc.use(remarkMath); // Parse $inline$ and $$block$$ math
		}

		proc = proc
			.use(remarkBreaks) // Convert line breaks to <br>
			.use(remarkLiteralHtml) // Treat raw HTML as literal text with preserved indentation
			.use(remarkRehype); // Convert Markdown AST to rehype

		if (!disableMath) {
			proc = proc.use(rehypeKatex); // Render math using KaTeX
		}

		return proc
			.use(rehypeHighlight, {
				languages: lowlightAll,
				aliases: { [FileTypeText.XML]: [FileTypeText.SVELTE, FileTypeText.VUE] }
			}) // Add syntax highlighting
			.use(rehypeRestoreTableHtml) // Restore limited HTML (e.g., <br>, <ul>) inside Markdown tables
			.use(rehypeEnhanceLinks) // Add target="_blank" to links
			.use(rehypeEnhanceCodeBlocks) // Wrap code blocks with header and actions
			.use(rehypeResolveAttachmentImages, { attachments })
			.use(rehypeRtlSupport) // Add bidirectional text support
			.use(rehypeStringify, { allowDangerousHtml: true }); // Convert to HTML string
	}

	private isAppendMode(newContent: string): boolean {
		return this.previousContent.length > 0 && newContent.startsWith(this.previousContent);
	}

	private async transformMdastNode(
		processorInstance: ReturnType<typeof this.createProcessor>,
		node: unknown,
		index: number
	): Promise<{ html: string; hash: string }> {
		const hash = getMdastNodeHash(node, index);

		const cached = this.transformCache.get(hash);
		if (cached) {
			return { html: cached, hash };
		}

		const singleNodeRoot = { type: 'root', children: [node] };
		const transformedRoot = (await processorInstance.run(singleNodeRoot as MdastRoot)) as HastRoot;
		const html = processorInstance.stringify(transformedRoot);

		this.transformCache.set(hash, html);

		return { html, hash };
	}

	async process(markdown: string): Promise<ProcessResult> {
		// Early exit if content unchanged (can happen with rapid coalescing)
		if (markdown === this.previousContent) {
			return {
				renderedBlocks: this.previousBlocks,
				unstableBlockHtml: '',
				incompleteCodeBlock: null,
				isStreamingComplete: false,
				changed: false
			};
		}

		if (!markdown) {
			this.previousContent = '';
			this.previousBlocks = [];
			this.transformCache.clear();
			return {
				renderedBlocks: [],
				unstableBlockHtml: '',
				incompleteCodeBlock: null,
				isStreamingComplete: false,
				changed: true
			};
		}

		// Check for incomplete code block at the end of content
		const incompleteBlock = detectIncompleteCodeBlock(markdown);

		if (incompleteBlock) {
			// Process only the prefix (content before the incomplete code block)
			const prefixMarkdown = markdown.slice(0, incompleteBlock.openingIndex);
			const nextBlocks: MarkdownBlock[] = [];

			if (prefixMarkdown.trim()) {
				const normalizedPrefix = preprocessLaTeX(prefixMarkdown);
				const processorInstance = this.createProcessor();
				const ast = processorInstance.parse(normalizedPrefix) as MdastRoot;
				const mdastChildren = (ast as { children?: unknown[] }).children ?? [];

				// Check if we're in append mode for cache reuse
				const appendMode = this.isAppendMode(prefixMarkdown);
				const previousBlockCount = appendMode ? this.previousBlocks.length : 0;

				// All prefix blocks are now stable since code block is separate
				for (let index = 0; index < mdastChildren.length; index++) {
					const child = mdastChildren[index];

					// In append mode, reuse previous blocks if unchanged
					if (appendMode && index < previousBlockCount) {
						const prevBlock = this.previousBlocks[index];
						const currentHash = getMdastNodeHash(child, index);

						if (prevBlock?.contentHash === currentHash) {
							nextBlocks.push(prevBlock);
							continue;
						}
					}

					// Transform this block (with caching)
					const { html, hash } = await this.transformMdastNode(processorInstance, child, index);
					const id = getHastNodeId(
						{ position: (child as { position?: unknown }).position } as HastRootContent,
						index
					);

					nextBlocks.push({ id, html, contentHash: hash });
				}
			}

			this.previousContent = prefixMarkdown;
			this.previousBlocks = nextBlocks;
			return {
				renderedBlocks: nextBlocks,
				unstableBlockHtml: '',
				incompleteCodeBlock: incompleteBlock,
				isStreamingComplete: false,
				changed: true
			};
		}

		// No incomplete code block - use standard processing
		const normalized = preprocessLaTeX(markdown);
		const processorInstance = this.createProcessor();
		const ast = processorInstance.parse(normalized) as MdastRoot;
		const mdastChildren = (ast as { children?: unknown[] }).children ?? [];
		const stableCount = Math.max(mdastChildren.length - 1, 0);
		const nextBlocks: MarkdownBlock[] = [];

		// Check if we're in append mode for cache reuse
		const appendMode = this.isAppendMode(markdown);
		const previousBlockCount = appendMode ? this.previousBlocks.length : 0;

		for (let index = 0; index < stableCount; index++) {
			const child = mdastChildren[index];

			// In append mode, reuse previous blocks if unchanged
			if (appendMode && index < previousBlockCount) {
				const prevBlock = this.previousBlocks[index];
				const currentHash = getMdastNodeHash(child, index);
				if (prevBlock?.contentHash === currentHash) {
					nextBlocks.push(prevBlock);
					continue;
				}
			}

			// Transform this block (with caching)
			const { html, hash } = await this.transformMdastNode(processorInstance, child, index);
			const id = getHastNodeId(
				{ position: (child as { position?: unknown }).position } as HastRootContent,
				index
			);

			nextBlocks.push({ id, html, contentHash: hash });
		}

		let unstableHtml = '';

		if (mdastChildren.length > stableCount) {
			const unstableChild = mdastChildren[stableCount];
			const singleNodeRoot = { type: 'root', children: [unstableChild] };
			const transformedRoot = (await processorInstance.run(
				singleNodeRoot as MdastRoot
			)) as HastRoot;

			unstableHtml = processorInstance.stringify(transformedRoot);
		}

		this.previousContent = markdown;
		this.previousBlocks = nextBlocks;
		return {
			renderedBlocks: nextBlocks,
			unstableBlockHtml: unstableHtml,
			incompleteCodeBlock: null,
			isStreamingComplete: true,
			changed: true
		};
	}
}
