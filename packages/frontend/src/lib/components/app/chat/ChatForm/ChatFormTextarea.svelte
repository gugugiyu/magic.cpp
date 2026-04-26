<script lang="ts">
	import { autoResizeTextarea } from '$lib/utils';
	import { onMount, tick } from 'svelte';
	import { parsePathTokens } from '$lib/utils/path-tokens.js';

	interface Props {
		class?: string;
		disabled?: boolean;
		onInput?: () => void;
		onKeydown?: (event: KeyboardEvent) => void;
		onPaste?: (event: ClipboardEvent) => void;
		placeholder?: string;
		value?: string;
		onFileSelect?: (path: string) => void;
	}

	let {
		class: className = '',
		disabled = false,
		onInput,
		onKeydown,
		onPaste,
		placeholder = 'Ask anything...',
		value = $bindable(''),
		onFileSelect: _onFileSelect
	}: Props = $props();

	let textareaElement: HTMLTextAreaElement | undefined;
	let overlayElement: HTMLDivElement | undefined;
	let segments = $derived.by(() => parsePathTokens(value || ''));

	onMount(() => {
		if (textareaElement) {
			autoResizeTextarea(textareaElement);
			textareaElement.focus();
		}
	});

	$effect(() => {
		tick().then(() => {
			if (overlayElement && textareaElement) {
				overlayElement.scrollTop = textareaElement.scrollTop;
			}
		});
	});

	function syncScroll() {
		if (overlayElement && textareaElement) {
			overlayElement.scrollTop = textareaElement.scrollTop;
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (onKeydown) {
			onKeydown(event);
		}
	}

	function handleInput(event: Event) {
		autoResizeTextarea(event.currentTarget as HTMLTextAreaElement);
		onInput?.();
	}

	function handleScroll() {
		syncScroll();
	}

	export function getElement() {
		return textareaElement;
	}

	export function focus() {
		textareaElement?.focus();
	}

	export function resetHeight() {
		if (textareaElement) {
			textareaElement.style.height = '1rem';
		}
	}
</script>

<div class="grid flex-1 {className}" style="width: 100%; grid-template-columns: 1fr;">
	<!-- Overlay layer -->
	<div
		bind:this={overlayElement}
		class="pointer-events-none col-start-1 row-start-1 overflow-hidden"
		aria-hidden="true"
	>
		<div
			class="min-h-12 w-full text-base leading-6 break-words whitespace-pre-wrap text-transparent"
		>
			{#each segments as segment (segment.start)}
				{#if segment.type === 'text'}
					<span>{segment.text}</span>
				{:else}
					<span
						class="inline-flex items-center rounded bg-primary/10 px-1 py-0.5 font-mono text-sm text-primary"
					>
						@{segment.path}
					</span>
				{/if}
			{/each}
			{#if !value}
				<span class="text-muted-foreground">{placeholder}</span>
			{/if}
		</div>
	</div>

	<!-- Textarea layer -->
	<textarea
		bind:this={textareaElement}
		bind:value
		class="col-start-1 row-start-1 min-h-12 w-full resize-none border-0 bg-transparent text-base leading-6 text-transparent outline-none placeholder:text-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
		style="caret-color: var(--foreground); max-height: var(--max-message-height);"
		aria-label="Message input"
		class:cursor-not-allowed={disabled}
		{disabled}
		placeholder=" "
		onkeydown={handleKeydown}
		oninput={handleInput}
		onpaste={onPaste}
		onscroll={handleScroll}
	></textarea>
</div>
