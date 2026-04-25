<script lang="ts">
	import { tick, onDestroy } from 'svelte';
	import { mode } from 'mode-watcher';
	import { ColorMode } from '$lib/enums';
	import { config } from '$lib/stores/settings.svelte';
	import { SETTINGS_KEYS } from '$lib/constants';
	import { fadeInView } from '$lib/actions/fade-in-view.svelte';
	import { ArrowDown } from '@lucide/svelte';
	import {
		ActionIconsCodeBlock,
		DialogCodePreview,
		DialogDiagramFullscreen
	} from '$lib/components/app';
	import { createAutoScrollController } from '$lib/hooks/use-auto-scroll.svelte';
	import {
		acquireHighlightTheme,
		releaseHighlightTheme,
		applyHighlightTheme
	} from '$lib/utils/highlight-theme';
	import { buildIncrementalSvg } from '$lib/utils/svg-stream-parser';
	import { MarkdownProcessor } from '$lib/utils/markdown-processor';
	import { CodeBlockActionManager } from '$lib/utils/code-block-actions';
	import { ImageErrorHandler } from '$lib/utils/image-error-handler';
	import { highlightCode } from '$lib/utils/code';
	import { createModuleLogger } from '$lib/utils/logger';
	import MarkdownContentStyle from './MarkdownContentStyle.svelte';
	import type { DatabaseMessageExtra } from '$lib/types/database';
	import type { MarkdownBlock } from '$lib/utils/markdown-processor';
	import type { IncompleteCodeBlock } from '$lib/utils/code';

	const logger = createModuleLogger('MarkdownContent');

	interface Props {
		attachments?: DatabaseMessageExtra[];
		content: string;
		class?: string;
		disableMath?: boolean;
	}

	let { content, attachments, class: className = '', disableMath = false }: Props = $props();

	let containerRef = $state<HTMLDivElement>();
	let renderedBlocks = $state<MarkdownBlock[]>([]);
	let unstableBlockHtml = $state('');
	let incompleteCodeBlock = $state<IncompleteCodeBlock | null>(null);
	let previewDialogOpen = $state(false);
	let previewCode = $state('');
	let previewLanguage = $state('text');
	let fullscreenDialogOpen = $state(false);
	let fullscreenSvgHtml = $state('');
	let streamingCodeScrollContainer = $state<HTMLDivElement>();
	let showScrollToBottom = $state(false);
	let isStreamingComplete = $state(false);

	// Streaming SVG live-render state
	let isStreamingSvg = $derived(
		incompleteCodeBlock !== null &&
			(incompleteCodeBlock.language === 'svg' ||
				(incompleteCodeBlock.language === 'xml' && /<svg[\s>]/.test(incompleteCodeBlock.code)))
	);
	let liveSvgHtml = $derived(
		isStreamingSvg && incompleteCodeBlock ? buildIncrementalSvg(incompleteCodeBlock.code) : ''
	);

	// Auto-scroll controller for streaming code block content
	const streamingAutoScroll = createAutoScrollController();

	const markdownProcessor = new MarkdownProcessor();
	let pendingMarkdown: string | null = null;
	let isProcessing = false;

	// Update processor options when props change
	$effect(() => {
		markdownProcessor.updateOptions({ disableMath, attachments });
	});

	acquireHighlightTheme();

	function handlePreviewDialogOpenChange(open: boolean) {
		previewDialogOpen = open;

		if (!open) {
			previewCode = '';
			previewLanguage = 'text';
		}
	}

	function handleFullscreenDialogOpenChange(open: boolean) {
		fullscreenDialogOpen = open;

		if (!open) {
			fullscreenSvgHtml = '';
		}
	}

	const codeBlockManager = new CodeBlockActionManager({
		onPreview: (code, language) => {
			previewCode = code;
			previewLanguage = language;
			previewDialogOpen = true;
		},
		onCopyError: (error) => {
			logger.error('Failed to copy code:', error);
		},
		onFullscreen: (svgHtml) => {
			fullscreenSvgHtml = svgHtml;
			fullscreenDialogOpen = true;
		}
	});

	const imageErrorHandler = new ImageErrorHandler();

	/**
	 * Queues markdown for processing with coalescing support.
	 * Only processes the latest markdown when multiple updates arrive quickly.
	 * Uses requestAnimationFrame to yield to browser paint between batches.
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

				try {
					const result = await markdownProcessor.process(nextMarkdown);
					if (!result.changed) continue;

					renderedBlocks = result.renderedBlocks;
					incompleteCodeBlock = result.incompleteCodeBlock;
					isStreamingComplete = result.isStreamingComplete;

					if (result.unstableBlockHtml) {
						await tick(); // Force DOM sync before updating unstable HTML block
						unstableBlockHtml = result.unstableBlockHtml;
					} else {
						unstableBlockHtml = '';
					}
				} catch (error) {
					logger.error('Failed to process markdown:', error);
					renderedBlocks = [];
					unstableBlockHtml = nextMarkdown.replace(/\n/g, '<br>');
					incompleteCodeBlock = null;
					isStreamingComplete = false;
				}

				// Yield to browser for paint. During this, new chunks coalesce
				// into pendingMarkdown, so we always render the latest state.
				if (pendingMarkdown !== null) {
					await new Promise((resolve) => requestAnimationFrame(resolve));
				}
			}
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
			codeBlockManager.bind(containerRef, isStreamingComplete);
			imageErrorHandler.bind(containerRef);
		}
	});

	// Enable diagram render buttons when streaming completes
	$effect(() => {
		if (isStreamingComplete && containerRef) {
			codeBlockManager.enableDiagramButtons(containerRef);
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
		if (containerRef) {
			codeBlockManager.unbind(containerRef);
			imageErrorHandler.unbind(containerRef);
		}
		releaseHighlightTheme();
		streamingAutoScroll.destroy();
	});
</script>

<MarkdownContentStyle />

<div
	bind:this={containerRef}
	class="markdown-content-root {className}{config()[SETTINGS_KEYS.FULL_HEIGHT_CODE_BLOCKS]
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
				{#if isStreamingSvg}
					<div class="code-block-actions">
						<span class="streaming-svg-badge">Drawing SVG…</span>
					</div>
				{:else}
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
				{/if}
			</div>
			<div
				bind:this={streamingCodeScrollContainer}
				class="streaming-code-scroll-container"
				onscroll={() => {
					streamingAutoScroll.handleScroll();
					showScrollToBottom = !streamingAutoScroll.autoScrollEnabled;
				}}
			>
				{#if isStreamingSvg}
					<div class="svg-stream-container">
						{#if liveSvgHtml}
							<!-- eslint-disable-next-line no-at-html-tags -->
							{@html liveSvgHtml}
						{:else}
							<div class="svg-stream-placeholder">Waiting for SVG…</div>
						{/if}
					</div>
				{:else}
					<pre class="streaming-code-pre"><code
							class="hljs language-{incompleteCodeBlock.language || 'text'}"
							>{@html highlightCode(
								incompleteCodeBlock.code,
								incompleteCodeBlock.language || 'text'
							)}</code
						></pre>
				{/if}
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

<DialogDiagramFullscreen
	open={fullscreenDialogOpen}
	svgHtml={fullscreenSvgHtml}
	onOpenChange={handleFullscreenDialogOpenChange}
/>
