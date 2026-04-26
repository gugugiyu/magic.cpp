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

<div class="grid flex-1 {className} max-h-50" style="width: 100%; grid-template-columns: 1fr;">
	<!-- Overlay layer -->
	<div
		bind:this={overlayElement}
		class="pointer-events-none col-start-1 row-start-1 overflow-hidden"
		aria-hidden="true"
	>
		<div class="min-h-12 w-full text-base break-words text-transparent">
			{#each segments as segment (segment.start)}
				{#if segment.type === 'text'}
					<span class="text-foreground">{segment.text}</span>
				{:else}
					<span class="items-center rounded bg-primary/20 text-foreground">
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
		class="text-transparentmin-h-12 col-start-1 row-start-1 max-h-46 w-full resize-none border-0 bg-transparent text-base break-words outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
		style="caret-color: var(--foreground);"
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
