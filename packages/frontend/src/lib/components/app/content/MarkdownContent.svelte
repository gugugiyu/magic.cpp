<script lang="ts">
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
	import { onDestroy, tick } from 'svelte';
	import { rehypeRestoreTableHtml } from '$lib/markdown/table-html-restorer';
	import { rehypeEnhanceLinks } from '$lib/markdown/enhance-links';
	import { rehypeEnhanceCodeBlocks } from '$lib/markdown/enhance-code-blocks';
	import { rehypeResolveAttachmentImages } from '$lib/markdown/resolve-attachment-images';
	import { rehypeRtlSupport } from '$lib/markdown/rehype-rtl-support';
	import { remarkLiteralHtml } from '$lib/markdown/literal-html';
	import { copyCodeToClipboard, preprocessLaTeX, getImageErrorFallbackHtml } from '$lib/utils';
	import { toast } from 'svelte-sonner';
	import {
		IMAGE_NOT_ERROR_BOUND_SELECTOR,
		DATA_ERROR_BOUND_ATTR,
		DATA_ERROR_HANDLED_ATTR,
		BOOL_TRUE_STRING,
		SETTINGS_KEYS
	} from '$lib/constants';
	import { ColorMode, UrlProtocol } from '$lib/enums';
	import { FileTypeText } from '$lib/enums/files';
	import { highlightCode, detectIncompleteCodeBlock, type IncompleteCodeBlock } from '$lib/utils';
	import '$styles/katex-custom.scss';
	import { mode } from 'mode-watcher';
	import {
		acquireHighlightTheme,
		releaseHighlightTheme,
		applyHighlightTheme
	} from '$lib/utils/highlight-theme';
	import { renderMermaidDiagram, renderSvgDiagram } from '$lib/utils/diagram-renderer';
	import { ActionIconsCodeBlock, DialogCodePreview } from '$lib/components/app';
	import { createAutoScrollController } from '$lib/hooks/use-auto-scroll.svelte';
	import { ArrowDown } from '@lucide/svelte';
	import type { DatabaseMessageExtra } from '$lib/types/database';
	import { config } from '$lib/stores/settings.svelte';
	import { fadeInView } from '$lib/actions/fade-in-view.svelte';

	interface Props {
		attachments?: DatabaseMessageExtra[];
		content: string;
		class?: string;
		disableMath?: boolean;
	}

	interface MarkdownBlock {
		id: string;
		html: string;
		contentHash?: string;
	}

	let { content, attachments, class: className = '', disableMath = false }: Props = $props();

	let containerRef = $state<HTMLDivElement>();
	let renderedBlocks = $state<MarkdownBlock[]>([]);
	let unstableBlockHtml = $state('');
	let incompleteCodeBlock = $state<IncompleteCodeBlock | null>(null);
	let previewDialogOpen = $state(false);
	let previewCode = $state('');
	let previewLanguage = $state('text');
	let streamingCodeScrollContainer = $state<HTMLDivElement>();
	let showScrollToBottom = $state(false);
	let isStreamingComplete = $state(false);

	// Auto-scroll controller for streaming code block content
	const streamingAutoScroll = createAutoScrollController();

	let pendingMarkdown: string | null = null;
	let isProcessing = false;

	// LRU cache for transformed MDAST nodes to avoid re-transforming stable blocks during streaming.
	// Max size prevents unbounded growth during long conversations with many messages.
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

	const transformCache = new LruCache();
	let previousContent = '';

	acquireHighlightTheme();

	let processor = $derived(() => {
		void attachments;
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
	});

	/**
	 * Removes click event listeners from copy and preview buttons.
	 * Called on component destroy.
	 */
	function cleanupEventListeners() {
		if (!containerRef) return;

		const copyButtons = containerRef.querySelectorAll<HTMLButtonElement>('.copy-code-btn');
		const previewButtons = containerRef.querySelectorAll<HTMLButtonElement>('.preview-code-btn');
		const mermaidButtons = containerRef.querySelectorAll<HTMLButtonElement>('.mermaid-render-btn');
		const svgButtons = containerRef.querySelectorAll<HTMLButtonElement>('.svg-render-btn');

		for (const button of copyButtons) {
			button.removeEventListener('click', handleCopyClick);
		}

		for (const button of previewButtons) {
			button.removeEventListener('click', handlePreviewClick);
		}

		for (const button of mermaidButtons) {
			button.removeEventListener('click', handleMermaidRenderClick);
		}

		for (const button of svgButtons) {
			button.removeEventListener('click', handleSvgRenderClick);
		}
	}

	/**
	 * Cleans up zoom-pan event listeners on all rendered diagrams.
	 * Prevents memory leaks when component is destroyed while diagrams are visible.
	 */
	function cleanupRenderedDiagrams() {
		if (!containerRef) return;

		const renderContainers = containerRef.querySelectorAll<
			HTMLElement & { _zoomPanCleanup?: () => void }
		>('.mermaid-render-container, .svg-render-container');

		for (const container of renderContainers) {
			container._zoomPanCleanup?.();
		}
	}

	/**
	 * Extracts code information from a button click target within a code block.
	 * @param target - The clicked button element
	 * @returns Object with rawCode and language, or null if extraction fails
	 */
	function getCodeInfoFromTarget(target: HTMLElement) {
		const wrapper = target.closest('.code-block-wrapper');

		if (!wrapper) {
			console.error('No wrapper found');
			return null;
		}

		const codeElement = wrapper.querySelector<HTMLElement>('code[data-code-id]');

		if (!codeElement) {
			console.error('No code element found in wrapper');
			return null;
		}

		const rawCode = codeElement.textContent ?? '';

		const languageLabel = wrapper.querySelector<HTMLElement>('.code-language');
		const language = languageLabel?.textContent?.trim() || 'text';

		return { rawCode, language };
	}

	/**
	 * Generates a unique identifier for a HAST node based on its position.
	 * Used for stable block identification during incremental rendering.
	 * @param node - The HAST root content node
	 * @param indexFallback - Fallback index if position is unavailable
	 * @returns Unique string identifier for the node
	 */
	function getHastNodeId(node: HastRootContent, indexFallback: number): string {
		const position = node.position;

		if (position?.start?.offset != null && position?.end?.offset != null) {
			return `hast-${position.start.offset}-${position.end.offset}`;
		}

		return `${node.type}-${indexFallback}`;
	}

	/**
	 * Generates a hash for MDAST node based on its position.
	 * Used for cache lookup during incremental rendering.
	 */
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

	/**
	 * Check if we're in append-only mode (streaming).
	 */
	function isAppendMode(newContent: string): boolean {
		return previousContent.length > 0 && newContent.startsWith(previousContent);
	}

	/**
	 * Transforms a single MDAST node to HTML string with caching.
	 * Runs the full remark/rehype plugin pipeline (GFM, math, syntax highlighting, etc.)
	 * on an isolated single-node tree, then stringifies the resulting HAST to HTML.
	 * Results are cached by node position hash for streaming performance.
	 * @param processorInstance - The remark/rehype processor instance
	 * @param node - The MDAST node to transform
	 * @param index - Node index for hash fallback
	 * @returns Object containing the HTML string and cache hash
	 */
	async function transformMdastNode(
		processorInstance: ReturnType<typeof processor>,
		node: unknown,
		index: number
	): Promise<{ html: string; hash: string }> {
		const hash = getMdastNodeHash(node, index);

		const cached = transformCache.get(hash);
		if (cached) {
			return { html: cached, hash };
		}

		const singleNodeRoot = { type: 'root', children: [node] };
		const transformedRoot = (await processorInstance.run(singleNodeRoot as MdastRoot)) as HastRoot;
		const html = processorInstance.stringify(transformedRoot);

		transformCache.set(hash, html);

		return { html, hash };
	}

	/**
	 * Handles click events on copy buttons within code blocks.
	 * Copies the raw code content to the clipboard.
	 * @param event - The click event from the copy button
	 */
	async function handleCopyClick(event: Event) {
		event.preventDefault();
		event.stopPropagation();

		const target = event.currentTarget as HTMLButtonElement | null;

		if (!target) {
			return;
		}

		const info = getCodeInfoFromTarget(target);

		if (!info) {
			return;
		}

		try {
			await copyCodeToClipboard(info.rawCode);
		} catch (error) {
			console.error('Failed to copy code:', error);
		}
	}

	/**
	 * Handles preview dialog open state changes.
	 * Clears preview content when dialog is closed.
	 * @param open - Whether the dialog is being opened or closed
	 */
	function handlePreviewDialogOpenChange(open: boolean) {
		previewDialogOpen = open;

		if (!open) {
			previewCode = '';
			previewLanguage = 'text';
		}
	}

	/**
	 * Handles click events on preview buttons within HTML code blocks.
	 * Opens a preview dialog with the rendered HTML content.
	 * @param event - The click event from the preview button
	 */
	function handlePreviewClick(event: Event) {
		event.preventDefault();
		event.stopPropagation();

		const target = event.currentTarget as HTMLButtonElement | null;

		if (!target) {
			return;
		}

		const info = getCodeInfoFromTarget(target);

		if (!info) {
			return;
		}

		previewCode = info.rawCode;
		previewLanguage = info.language;
		previewDialogOpen = true;
	}

	/**
	 * Handles click on "Render diagram" button for mermaid code blocks.
	 * Lazy-loads mermaid, renders the diagram as SVG, and replaces the code view.
	 */
	async function handleMermaidRenderClick(event: Event) {
		event.preventDefault();
		event.stopPropagation();

		const target = event.currentTarget as HTMLButtonElement | null;
		if (!target) return;

		const wrapper = target.closest<HTMLElement>('.code-block-wrapper');
		if (!wrapper) return;

		// Prevent race conditions: block rapid double-clicks
		if (wrapper.dataset.renderingInProgress === 'true') return;

		const scrollContainer =
			wrapper.querySelector<HTMLElement>('.code-block-scroll-container') ||
			wrapper.querySelector<HTMLElement>('.streaming-code-scroll-container');
		if (!scrollContainer) return;

		const info = getCodeInfoFromTarget(target);
		if (!info) return;

		// Toggle back to code view if already rendered
		const existing = wrapper.querySelector<HTMLElement>('.mermaid-render-container');
		if (existing) {
			const savedScrollTop = scrollContainer.scrollTop;
			(existing as HTMLElement & { _zoomPanCleanup?: () => void })._zoomPanCleanup?.();
			existing.remove();
			// Clean up any skeleton left behind
			wrapper.querySelector('.diagram-render-skeleton')?.remove();
			scrollContainer.style.display = '';
			scrollContainer.scrollTop = savedScrollTop;
			target.title = 'Render diagram';
			return;
		}

		wrapper.dataset.renderingInProgress = 'true';
		target.disabled = true;
		target.title = 'Rendering…';

		try {
			await renderMermaidDiagram(
				wrapper,
				scrollContainer,
				info.rawCode,
				mode.current === ColorMode.DARK
			);
			target.title = 'Show source';
		} catch (err) {
			console.error('Mermaid render failed:', err);
			toast.error('Mermaid render failed');
			target.title = 'Render diagram';
		} finally {
			target.disabled = false;
			delete wrapper.dataset.renderingInProgress;
		}
	}

	/**
	 * Handles click on "Render SVG" button for svg code blocks.
	 * Sanitizes with DOMPurify and injects the SVG inline, toggling code/render view.
	 */
	async function handleSvgRenderClick(event: Event) {
		event.preventDefault();
		event.stopPropagation();

		const target = event.currentTarget as HTMLButtonElement | null;
		if (!target) return;

		const wrapper = target.closest<HTMLElement>('.code-block-wrapper');
		if (!wrapper) return;

		// Prevent race conditions: block rapid double-clicks
		if (wrapper.dataset.renderingInProgress === 'true') return;

		const scrollContainer =
			wrapper.querySelector<HTMLElement>('.code-block-scroll-container') ||
			wrapper.querySelector<HTMLElement>('.streaming-code-scroll-container');
		if (!scrollContainer) return;

		const info = getCodeInfoFromTarget(target);
		if (!info) return;

		// Toggle back to code view if already rendered
		const existing = wrapper.querySelector<HTMLElement>('.svg-render-container');
		if (existing) {
			const savedScrollTop = scrollContainer.scrollTop;
			(existing as HTMLElement & { _zoomPanCleanup?: () => void })._zoomPanCleanup?.();
			existing.remove();
			// Clean up any skeleton left behind
			wrapper.querySelector('.diagram-render-skeleton')?.remove();
			scrollContainer.style.display = '';
			scrollContainer.scrollTop = savedScrollTop;
			target.title = 'Render SVG';
			return;
		}

		wrapper.dataset.renderingInProgress = 'true';
		target.disabled = true;
		target.title = 'Rendering…';

		try {
			await renderSvgDiagram(wrapper, scrollContainer, info.rawCode);
			target.title = 'Show source';
		} catch (err) {
			console.error('SVG render failed:', err);
			target.title = 'Render SVG';
		} finally {
			target.disabled = false;
			delete wrapper.dataset.renderingInProgress;
		}
	}

	/**
	 * Processes markdown content into stable and unstable HTML blocks.
	 * Uses incremental rendering: stable blocks are cached, unstable block is re-rendered.
	 * Incomplete code blocks are rendered using SyntaxHighlightedCode to maintain interactivity.
	 * @param markdown - The raw markdown string to process
	 */
	async function processMarkdown(markdown: string) {
		// Early exit if content unchanged (can happen with rapid coalescing)
		if (markdown === previousContent) {
			return;
		}

		if (!markdown) {
			renderedBlocks = [];
			unstableBlockHtml = '';
			incompleteCodeBlock = null;
			isStreamingComplete = false;
			previousContent = '';
			return;
		}

		// Check for incomplete code block at the end of content
		const incompleteBlock = detectIncompleteCodeBlock(markdown);

		if (incompleteBlock) {
			// Process only the prefix (content before the incomplete code block)
			const prefixMarkdown = markdown.slice(0, incompleteBlock.openingIndex);

			if (prefixMarkdown.trim()) {
				const normalizedPrefix = preprocessLaTeX(prefixMarkdown);
				const processorInstance = processor();
				const ast = processorInstance.parse(normalizedPrefix) as MdastRoot;
				const mdastChildren = (ast as { children?: unknown[] }).children ?? [];
				const nextBlocks: MarkdownBlock[] = [];

				// Check if we're in append mode for cache reuse
				const appendMode = isAppendMode(prefixMarkdown);
				const previousBlockCount = appendMode ? renderedBlocks.length : 0;

				// All prefix blocks are now stable since code block is separate
				for (let index = 0; index < mdastChildren.length; index++) {
					const child = mdastChildren[index];

					// In append mode, reuse previous blocks if unchanged
					if (appendMode && index < previousBlockCount) {
						const prevBlock = renderedBlocks[index];
						const currentHash = getMdastNodeHash(child, index);

						if (prevBlock?.contentHash === currentHash) {
							nextBlocks.push(prevBlock);

							continue;
						}
					}

					// Transform this block (with caching)
					const { html, hash } = await transformMdastNode(processorInstance, child, index);
					const id = getHastNodeId(
						{ position: (child as { position?: unknown }).position } as HastRootContent,
						index
					);

					nextBlocks.push({ id, html, contentHash: hash });
				}

				renderedBlocks = nextBlocks;
			} else {
				renderedBlocks = [];
			}

			previousContent = prefixMarkdown;
			unstableBlockHtml = '';
			incompleteCodeBlock = incompleteBlock;
			isStreamingComplete = false;

			return;
		}

		// No incomplete code block - use standard processing
		incompleteCodeBlock = null;
		isStreamingComplete = true;

		const normalized = preprocessLaTeX(markdown);
		const processorInstance = processor();
		const ast = processorInstance.parse(normalized) as MdastRoot;
		const mdastChildren = (ast as { children?: unknown[] }).children ?? [];
		const stableCount = Math.max(mdastChildren.length - 1, 0);
		const nextBlocks: MarkdownBlock[] = [];

		// Check if we're in append mode for cache reuse
		const appendMode = isAppendMode(markdown);
		const previousBlockCount = appendMode ? renderedBlocks.length : 0;

		for (let index = 0; index < stableCount; index++) {
			const child = mdastChildren[index];

			// In append mode, reuse previous blocks if unchanged
			if (appendMode && index < previousBlockCount) {
				const prevBlock = renderedBlocks[index];
				const currentHash = getMdastNodeHash(child, index);
				if (prevBlock?.contentHash === currentHash) {
					nextBlocks.push(prevBlock);

					continue;
				}
			}

			// Transform this block (with caching)
			const { html, hash } = await transformMdastNode(processorInstance, child, index);
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

		renderedBlocks = nextBlocks;
		previousContent = markdown;
		await tick(); // Force DOM sync before updating unstable HTML block
		unstableBlockHtml = unstableHtml;
	}

	/**
	 * Attaches click event listeners to copy and preview buttons in code blocks.
	 * Uses data-listener-bound attribute to prevent duplicate bindings.
	 */
	function setupCodeBlockActions() {
		if (!containerRef) return;

		const wrappers = containerRef.querySelectorAll<HTMLElement>('.code-block-wrapper');

		for (const wrapper of wrappers) {
			const copyButton = wrapper.querySelector<HTMLButtonElement>('.copy-code-btn');
			const previewButton = wrapper.querySelector<HTMLButtonElement>('.preview-code-btn');
			const mermaidButton = wrapper.querySelector<HTMLButtonElement>('.mermaid-render-btn');
			const svgButton = wrapper.querySelector<HTMLButtonElement>('.svg-render-btn');

			if (copyButton && copyButton.dataset.listenerBound !== 'true') {
				copyButton.dataset.listenerBound = 'true';
				copyButton.addEventListener('click', handleCopyClick);
			}

			if (previewButton && previewButton.dataset.listenerBound !== 'true') {
				previewButton.dataset.listenerBound = 'true';
				previewButton.addEventListener('click', handlePreviewClick);
			}

			if (mermaidButton && mermaidButton.dataset.listenerBound !== 'true') {
				mermaidButton.dataset.listenerBound = 'true';
				// Disable during streaming, enable only after streaming completes
				if (!isStreamingComplete) {
					mermaidButton.disabled = true;
					mermaidButton.title = 'Render diagram (after streaming completes)';
					mermaidButton.dataset.pendingEnable = 'true';
				}
				mermaidButton.addEventListener('click', handleMermaidRenderClick);
			}

			if (svgButton && svgButton.dataset.listenerBound !== 'true') {
				svgButton.dataset.listenerBound = 'true';
				// Disable during streaming, enable only after streaming completes
				if (!isStreamingComplete) {
					svgButton.disabled = true;
					svgButton.title = 'Render SVG (after streaming completes)';
					svgButton.dataset.pendingEnable = 'true';
				}
				svgButton.addEventListener('click', handleSvgRenderClick);
			}
		}
	}

	/**
	 * Enables diagram render buttons that were disabled during streaming.
	 * Called when streaming completes to allow users to render diagrams.
	 */
	function enableDiagramRenderButtons() {
		if (!containerRef) return;

		const mermaidButtons = containerRef.querySelectorAll<HTMLButtonElement>('.mermaid-render-btn');
		const svgButtons = containerRef.querySelectorAll<HTMLButtonElement>('.svg-render-btn');

		for (const button of mermaidButtons) {
			if (button.dataset.pendingEnable === 'true') {
				button.disabled = false;
				button.title = 'Render diagram';
				delete button.dataset.pendingEnable;
			}
		}

		for (const button of svgButtons) {
			if (button.dataset.pendingEnable === 'true') {
				button.disabled = false;
				button.title = 'Render SVG';
				delete button.dataset.pendingEnable;
			}
		}
	}

	/**
	 * Attaches error handlers to images to show fallback UI when loading fails (e.g., CORS).
	 * Uses data-error-bound attribute to prevent duplicate bindings.
	 */
	function setupImageErrorHandlers() {
		if (!containerRef) return;

		const images = containerRef.querySelectorAll<HTMLImageElement>(IMAGE_NOT_ERROR_BOUND_SELECTOR);

		for (const img of images) {
			img.dataset[DATA_ERROR_BOUND_ATTR] = BOOL_TRUE_STRING;
			img.addEventListener('error', handleImageError);
		}
	}

	/**
	 * Handles image load errors by replacing the image with a fallback UI.
	 * Shows a placeholder with a link to open the image in a new tab.
	 */
	function handleImageError(event: Event) {
		const img = event.target as HTMLImageElement;
		if (!img || !img.src) return;

		// Don't handle data URLs or already-handled images
		if (
			img.src.startsWith(UrlProtocol.DATA) ||
			img.dataset[DATA_ERROR_HANDLED_ATTR] === BOOL_TRUE_STRING
		)
			return;
		img.dataset[DATA_ERROR_HANDLED_ATTR] = BOOL_TRUE_STRING;

		const src = img.src;
		// Create fallback element
		const fallback = document.createElement('div');
		fallback.className = 'image-load-error';
		fallback.innerHTML = getImageErrorFallbackHtml(src);

		// Replace image with fallback
		img.parentNode?.replaceChild(fallback, img);
	}

	/**
	 * Queues markdown for processing with coalescing support.
	 * Only processes the latest markdown when multiple updates arrive quickly.
	 * Uses requestAnimationFrame to yield to browser paint between batches.
	 * @param markdown - The markdown content to render
	 */
	async function updateRenderedBlocks(markdown: string) {
		pendingMarkdown = markdown;

		if (isProcessing) {
			return;
		}

		isProcessing = true;

		try {
			while (pendingMarkdown !== null) {
				const nextMarkdown = pendingMarkdown;
				pendingMarkdown = null;

				await processMarkdown(nextMarkdown);

				// Yield to browser for paint. During this, new chunks coalesce
				// into pendingMarkdown, so we always render the latest state.
				if (pendingMarkdown !== null) {
					await new Promise((resolve) => requestAnimationFrame(resolve));
				}
			}
		} catch (error) {
			console.error('Failed to process markdown:', error);
			renderedBlocks = [];
			unstableBlockHtml = markdown.replace(/\n/g, '<br>');
		} finally {
			isProcessing = false;
		}
	}

	$effect(() => {
		const currentMode = mode.current;
		const isDark = currentMode === ColorMode.DARK;

		applyHighlightTheme(isDark);
	});

	$effect(() => {
		updateRenderedBlocks(content);
	});

	$effect(() => {
		const hasRenderedBlocks = renderedBlocks.length > 0;
		const hasUnstableBlock = Boolean(unstableBlockHtml);

		if ((hasRenderedBlocks || hasUnstableBlock) && containerRef) {
			setupCodeBlockActions();
			setupImageErrorHandlers();
		}
	});

	// Enable diagram render buttons when streaming completes
	$effect(() => {
		if (isStreamingComplete && containerRef) {
			enableDiagramRenderButtons();
		}
	});

	// Auto-scroll for streaming code block
	$effect(() => {
		streamingAutoScroll.setContainer(streamingCodeScrollContainer);
	});

	$effect(() => {
		if (incompleteCodeBlock !== null) {
			streamingAutoScroll.startObserving();
		} else {
			streamingAutoScroll.stopObserving();
		}
	});

	onDestroy(() => {
		cleanupEventListeners();
		cleanupRenderedDiagrams();
		releaseHighlightTheme();
		streamingAutoScroll.destroy();
	});
</script>

<div
	bind:this={containerRef}
	class="{className}{config()[SETTINGS_KEYS.FULL_HEIGHT_CODE_BLOCKS]
		? ' full-height-code-blocks'
		: ''}"
>
	{#each renderedBlocks as block (block.id)}
		<div class="markdown-block" data-block-id={block.id} use:fadeInView={{ skipIfVisible: true }}>
			<!-- eslint-disable-next-line no-at-html-tags -->
			{@html block.html}
		</div>
	{/each}

	{#if unstableBlockHtml}
		<div class="markdown-block markdown-block--unstable" data-block-id="unstable">
			<!-- eslint-disable-next-line no-at-html-tags -->
			{@html unstableBlockHtml}
		</div>
	{/if}

	{#if incompleteCodeBlock}
		<div class="code-block-wrapper streaming-code-block relative">
			<div class="code-block-header">
				<span class="code-language">{incompleteCodeBlock.language || 'text'}</span>
				<ActionIconsCodeBlock
					code={incompleteCodeBlock.code}
					language={incompleteCodeBlock.language || 'text'}
					disabled
					onPreview={(code, lang) => {
						previewCode = code;
						previewLanguage = lang;
						previewDialogOpen = true;
					}}
				/>
			</div>
			<div
				bind:this={streamingCodeScrollContainer}
				class="streaming-code-scroll-container"
				onscroll={() => {
					streamingAutoScroll.handleScroll();
					showScrollToBottom = !streamingAutoScroll.autoScrollEnabled;
				}}
			>
				<pre class="streaming-code-pre"><code
						class="hljs language-{incompleteCodeBlock.language || 'text'}"
						>{@html highlightCode(
							incompleteCodeBlock.code,
							incompleteCodeBlock.language || 'text'
						)}</code
					></pre>
			</div>
			{#if showScrollToBottom}
				<button
					type="button"
					class="scroll-to-bottom-btn"
					onclick={() => {
						streamingAutoScroll.scrollToBottom('smooth');
						streamingAutoScroll.enable();
						showScrollToBottom = false;
					}}
					title="Scroll to bottom"
				>
					<ArrowDown class="h-4 w-4" />
				</button>
			{/if}
		</div>
	{/if}
</div>

<DialogCodePreview
	open={previewDialogOpen}
	code={previewCode}
	language={previewLanguage}
	onOpenChange={handlePreviewDialogOpenChange}
/>

<style>
	.markdown-block--unstable {
		display: contents;
	}

	/* Streaming code block uses .code-block-wrapper styles */
	.streaming-code-block .streaming-code-pre {
		background: transparent;
		padding: 0.5rem;
		margin: 0;
		overflow-x: visible;
		border-radius: 0;
		border: none;
		font-size: 0.875rem;
	}

	.scroll-to-bottom-btn {
		position: absolute;
		bottom: 0.75rem;
		right: 0.75rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: 9999px;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--background) / 0.9);
		color: hsl(var(--foreground));
		cursor: pointer;
		transition: all 0.15s ease;
		backdrop-filter: blur(8px);
		z-index: 10;
	}

	.scroll-to-bottom-btn:hover {
		background: hsl(var(--muted));
		transform: scale(1.05);
	}

	/* Base typography styles */
	div :global(p) {
		margin-block: 1rem;
		line-height: 1.75;
	}

	div :global(:is(h1, h2, h3, h4, h5, h6):first-child) {
		margin-top: 0;
	}

	/* Headers with consistent spacing */
	div :global(h1) {
		font-size: 1.875rem;
		font-weight: 700;
		line-height: 1.2;
		margin: 1.5rem 0 0.75rem 0;
	}

	div :global(h2) {
		font-size: 1.5rem;
		font-weight: 600;
		line-height: 1.3;
		margin: 1.25rem 0 0.5rem 0;
	}

	div :global(h3) {
		font-size: 1.25rem;
		font-weight: 600;
		margin: 1.5rem 0 0.5rem 0;
		line-height: 1.4;
	}

	div :global(h4) {
		font-size: 1.125rem;
		font-weight: 600;
		margin: 0.75rem 0 0.25rem 0;
	}

	div :global(h5) {
		font-size: 1rem;
		font-weight: 600;
		margin: 0.5rem 0 0.25rem 0;
	}

	div :global(h6) {
		font-size: 0.875rem;
		font-weight: 600;
		margin: 0.5rem 0 0.25rem 0;
	}

	/* Text formatting */
	div :global(strong) {
		font-weight: 600;
	}

	div :global(em) {
		font-style: italic;
	}

	div :global(del) {
		text-decoration: line-through;
		opacity: 0.7;
	}

	/* Inline code */
	div :global(code:not(pre code)) {
		background: var(--muted);
		color: var(--muted-foreground);
		padding: 0.125rem 0.375rem;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		font-family:
			ui-monospace, SFMono-Regular, 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas,
			'Liberation Mono', Menlo, monospace;
	}

	div :global(pre) {
		display: inline;
		margin: 0 !important;
		overflow: hidden !important;
		background: var(--muted);
		overflow-x: auto;
		border-radius: 1rem;
		border: none;
		line-height: 1 !important;
	}

	div :global(pre code) {
		padding: 0 !important;
		display: inline !important;
	}

	div :global(code) {
		background: transparent;
		color: var(--code-foreground);
	}

	/* Links */
	div :global(a) {
		color: var(--primary);
		text-decoration: underline;
		text-underline-offset: 2px;
		transition: color 0.2s ease;
		overflow-wrap: anywhere;
		word-break: break-all;
	}

	div :global(a:hover) {
		color: var(--primary);
	}

	/* Lists */
	div :global(ul) {
		list-style-type: disc;
		margin-inline-start: 1.5rem;
		margin-bottom: 1rem;
	}

	div :global(ol) {
		list-style-type: decimal;
		margin-inline-start: 1.5rem;
		margin-bottom: 1rem;
	}

	div :global(li) {
		margin-bottom: 0.25rem;
		padding-inline-start: 0.5rem;
	}

	div :global(li::marker) {
		color: var(--muted-foreground);
	}

	/* Nested lists */
	div :global(ul ul) {
		list-style-type: circle;
		margin-top: 0.25rem;
		margin-bottom: 0.25rem;
	}

	div :global(ol ol) {
		list-style-type: lower-alpha;
		margin-top: 0.25rem;
		margin-bottom: 0.25rem;
	}

	/* Task lists */
	div :global(.task-list-item) {
		list-style: none;
		margin-inline-start: 0;
		padding-inline-start: 0;
	}

	div :global(.task-list-item-checkbox) {
		margin-right: 0.5rem;
		margin-top: 0.125rem;
	}

	/* Blockquotes */
	div :global(blockquote) {
		border-left: 4px solid var(--border);
		padding: 0.5rem 1rem;
		margin: 1.5rem 0;
		font-style: italic;
		color: var(--muted-foreground);
		background: var(--muted);
		border-radius: 0 0.375rem 0.375rem 0;
	}

	/* Tables */
	div :global(table) {
		width: 100%;
		margin: 1.5rem 0;
		border-collapse: collapse;
		border: 1px solid var(--border);
		border-radius: 0.375rem;
		overflow: hidden;
	}

	div :global(th) {
		background: hsl(var(--muted) / 0.3);
		border: 1px solid var(--border);
		padding: 0.5rem 0.75rem;
		text-align: left;
		font-weight: 600;
	}

	div :global(td) {
		border: 1px solid var(--border);
		padding: 0.5rem 0.75rem;
	}

	div :global(tr:nth-child(even)) {
		background: hsl(var(--muted) / 0.1);
	}

	/* User message markdown should keep table borders visible on light primary backgrounds */
	div.markdown-user-content :global(table),
	div.markdown-user-content :global(th),
	div.markdown-user-content :global(td),
	div.markdown-user-content :global(.table-wrapper) {
		border-color: currentColor;
	}

	/* Horizontal rules */
	div :global(hr) {
		border: none;
		border-top: 1px solid var(--border);
		margin: 1.5rem 0;
	}

	/* Images */
	div :global(img) {
		border-radius: 0.5rem;
		box-shadow:
			0 1px 3px 0 rgb(0 0 0 / 0.1),
			0 1px 2px -1px rgb(0 0 0 / 0.1);
		margin: 1.5rem 0;
		max-width: 100%;
		height: auto;
	}

	/* Code blocks */

	div :global(.code-block-wrapper) {
		margin: 1.5rem 0;
		border-radius: 0.75rem;
		overflow: hidden;
		border: 1px solid color-mix(in oklch, var(--border) 30%, transparent);
		background: var(--code-background);
		box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
		min-height: var(--min-message-height);
		max-height: var(--max-message-height);
	}

	:global(.dark) div :global(.code-block-wrapper) {
		border-color: color-mix(in oklch, var(--border) 20%, transparent);
	}

	/* Scroll container for code blocks (both streaming and completed) */
	div :global(.code-block-scroll-container),
	.streaming-code-scroll-container {
		min-height: var(--min-message-height);
		max-height: var(--max-message-height);
		overflow-y: auto;
		overflow-x: auto;
		padding: 3rem 1rem 1rem;
		line-height: 1.3;
	}

	.full-height-code-blocks :global(.code-block-wrapper) {
		max-height: none;
	}

	.full-height-code-blocks :global(.code-block-scroll-container),
	.full-height-code-blocks .streaming-code-scroll-container {
		max-height: none;
		overflow-y: visible;
	}

	div :global(.code-block-header) {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem 1rem 0;
		font-size: 0.875rem;
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
	}

	div :global(.code-language) {
		color: var(--color-foreground);
		font-weight: 500;
		font-family:
			ui-monospace, SFMono-Regular, 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas,
			'Liberation Mono', Menlo, monospace;
		text-transform: uppercase;
		font-size: 0.75rem;
		letter-spacing: 0.05em;
	}

	div :global(.code-block-actions) {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	div :global(.copy-code-btn),
	div :global(.preview-code-btn) {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		background: transparent;
		color: var(--code-foreground);
		cursor: pointer;
		transition: all 0.2s ease;
	}

	div :global(.copy-code-btn:hover),
	div :global(.preview-code-btn:hover) {
		transform: scale(1.05);
	}

	div :global(.copy-code-btn:active),
	div :global(.preview-code-btn:active) {
		transform: scale(0.95);
	}

	div :global(.code-block-wrapper pre) {
		background: transparent;
		margin: 0;
		border-radius: 0;
		border: none;
		font-size: 0.875rem;
	}

	/* Mentions and hashtags */
	div :global(.mention) {
		color: hsl(var(--primary));
		font-weight: 500;
		text-decoration: none;
	}

	div :global(.mention:hover) {
		text-decoration: underline;
	}

	div :global(.hashtag) {
		color: hsl(var(--primary));
		font-weight: 500;
		text-decoration: none;
	}

	div :global(.hashtag:hover) {
		text-decoration: underline;
	}

	/* Advanced table enhancements */
	div :global(table) {
		transition: all 0.2s ease;
	}

	div :global(table:hover) {
		box-shadow:
			0 4px 6px -1px rgb(0 0 0 / 0.1),
			0 2px 4px -2px rgb(0 0 0 / 0.1);
	}

	div :global(th:hover),
	div :global(td:hover) {
		background: var(--muted);
	}

	/* Disable hover effects when rendering user messages */
	.markdown-user-content :global(a),
	.markdown-user-content :global(a:hover) {
		color: inherit;
	}

	.markdown-user-content :global(table:hover) {
		box-shadow: none;
	}

	.markdown-user-content :global(th:hover),
	.markdown-user-content :global(td:hover) {
		background: inherit;
	}

	/* Enhanced blockquotes */
	div :global(blockquote) {
		transition: all 0.2s ease;
		position: relative;
	}

	div :global(blockquote:hover) {
		border-left-width: 6px;
		background: var(--muted);
		transform: translateX(2px);
	}

	div :global(blockquote::before) {
		content: '"';
		position: absolute;
		top: -0.5rem;
		left: 0.5rem;
		font-size: 3rem;
		color: var(--muted-foreground);
		font-family: serif;
		line-height: 1;
	}

	/* Enhanced images */
	div :global(img) {
		transition: all 0.3s ease;
		cursor: pointer;
	}

	div :global(img:hover) {
		transform: scale(1.02);
		box-shadow:
			0 10px 15px -3px rgb(0 0 0 / 0.1),
			0 4px 6px -4px rgb(0 0 0 / 0.1);
	}

	/* Image zoom overlay */
	div :global(.image-zoom-overlay) {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.8);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		cursor: pointer;
	}

	div :global(.image-zoom-overlay img) {
		max-width: 90vw;
		max-height: 90vh;
		border-radius: 0.5rem;
		box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.25);
	}

	/* Enhanced horizontal rules */
	div :global(hr) {
		border: none;
		height: 2px;
		background: linear-gradient(to right, transparent, var(--border), transparent);
		margin: 2rem 0;
		position: relative;
	}

	div :global(hr::after) {
		content: '';
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 1rem;
		height: 1rem;
		background: var(--border);
		border-radius: 50%;
	}

	/* Scrollable tables */
	div :global(.table-wrapper) {
		overflow-x: auto;
		margin: 1.5rem 0;
		border-radius: 0.5rem;
		border: 1px solid var(--border);
	}

	div :global(.table-wrapper table) {
		margin: 0;
		border: none;
	}

	/* Responsive adjustments */
	@media (max-width: 640px) {
		div :global(h1) {
			font-size: 1.5rem;
		}

		div :global(h2) {
			font-size: 1.25rem;
		}

		div :global(h3) {
			font-size: 1.125rem;
		}

		div :global(table) {
			font-size: 0.875rem;
		}

		div :global(th),
		div :global(td) {
			padding: 0.375rem 0.5rem;
		}

		div :global(.table-wrapper) {
			margin: 0.5rem -1rem;
			border-radius: 0;
			border-left: none;
			border-right: none;
		}
	}

	/* Dark mode adjustments */
	@media (prefers-color-scheme: dark) {
		div :global(blockquote:hover) {
			background: var(--muted);
		}
	}

	/* Image load error fallback */
	div :global(.image-load-error) {
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 1.5rem 0;
		padding: 1.5rem;
		border-radius: 0.5rem;
		background: var(--muted);
		border: 1px dashed var(--border);
	}

	div :global(.image-error-content) {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		color: var(--muted-foreground);
		text-align: center;
	}

	div :global(.image-error-content svg) {
		opacity: 0.5;
	}

	div :global(.image-error-text) {
		font-size: 0.875rem;
	}

	div :global(.image-error-link) {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 1rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--primary);
		background: var(--background);
		border: 1px solid var(--border);
		border-radius: 0.375rem;
		text-decoration: none;
		transition: all 0.2s ease;
	}

	div :global(.image-error-link:hover) {
		background: var(--muted);
		border-color: var(--primary);
	}

	div :global(.diagram-render-skeleton) {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 120px;
		width: 100%;
	}

	div :global(.diagram-render-spinner) {
		width: 28px;
		height: 28px;
		border: 3px solid var(--border);
		border-top-color: var(--primary);
		border-radius: 50%;
		animation: diagram-spin 0.7s linear infinite;
	}

	@keyframes diagram-spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
