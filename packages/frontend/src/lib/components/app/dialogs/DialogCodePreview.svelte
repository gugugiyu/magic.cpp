<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import XIcon from '@lucide/svelte/icons/x';
	import { onMount } from 'svelte';

	interface Props {
		open: boolean;
		code: string;
		language: string;
		onOpenChange?: (open: boolean) => void;
	}

	let { open = $bindable(), code, language, onOpenChange }: Props = $props();

	let iframeRef = $state<HTMLIFrameElement | null>(null);
	let previousCode = $state<string | null>(null);
	let showKeyboardHint = $state(false);

	$effect(() => {
		if (!iframeRef) return;

		if (open && code !== previousCode) {
			iframeRef.srcdoc = code;
			previousCode = code;
			// Show keyboard hint briefly when dialog opens
			showKeyboardHint = true;
			setTimeout(() => (showKeyboardHint = false), 3000);
		} else if (!open) {
			iframeRef.srcdoc = '';
			previousCode = null; // Reset so srcdoc is set again on next open
		}
	});

	function handleOpenChange(nextOpen: boolean) {
		open = nextOpen;
		onOpenChange?.(nextOpen);
	}

	// Handle escape key
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) {
			handleOpenChange(false);
		}
	}

	onMount(() => {
		window.addEventListener('keydown', handleKeydown);
		return () => window.removeEventListener('keydown', handleKeydown);
	});
</script>

<DialogPrimitive.Root {open} onOpenChange={handleOpenChange}>
	<DialogPrimitive.Portal>
		<DialogPrimitive.Overlay class="code-preview-overlay" />

		<DialogPrimitive.Content class="code-preview-content">
			<div class="code-preview-header">
				<span class="code-preview-language">{language}</span>
				<div class="code-preview-header-actions">
					{#if showKeyboardHint}
						<span class="code-preview-keyboard-hint">Press Escape to close</span>
					{/if}
					<DialogPrimitive.Close class="code-preview-close-btn" aria-label="Close preview">
						<XIcon />
					</DialogPrimitive.Close>
				</div>
			</div>
			<iframe
				bind:this={iframeRef}
				title="Preview {language}"
				sandbox="allow-scripts"
				class="code-preview-iframe"
			></iframe>
		</DialogPrimitive.Content>
	</DialogPrimitive.Portal>
</DialogPrimitive.Root>

<style lang="postcss">
	:global(.code-preview-overlay) {
		position: fixed;
		inset: 0;
		background-color: rgb(0 0 0 / 0.5);
		z-index: 100000;
	}

	:global(.code-preview-content) {
		position: fixed;
		inset: 2rem;
		margin: auto;
		max-width: 90dvw;
		max-height: 90dvh;
		border-radius: 0.75rem;
		background-color: hsl(var(--background));
		box-shadow: 0 20px 60px -15px rgb(0 0 0 / 0.3);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		z-index: 100001;
	}

	:global(.code-preview-header) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		background: hsl(var(--muted) / 0.5);
		border-bottom: 1px solid hsl(var(--border));
		flex-shrink: 0;
	}

	:global(.code-preview-language) {
		font-size: 0.875rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		font-family:
			ui-monospace, SFMono-Regular, 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono',
			'Liberation Mono', Menlo, monospace;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	:global(.code-preview-header-actions) {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	:global(.code-preview-keyboard-hint) {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		animation: hint-fade-out 3s ease-in forwards;
	}

	@keyframes hint-fade-out {
		0%,
		70% {
			opacity: 1;
		}
		100% {
			opacity: 0;
		}
	}

	:global(.code-preview-close-btn) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: 0.375rem;
		border: none;
		background: transparent;
		color: hsl(var(--foreground));
		cursor: pointer;
		transition: background 0.15s;
	}

	:global(.code-preview-close-btn:hover) {
		background: hsl(var(--muted));
	}

	:global(.code-preview-iframe) {
		display: block;
		width: 100%;
		flex: 1;
		border: 0;
	}
</style>
