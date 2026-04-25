<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import XIcon from '@lucide/svelte/icons/x';
	import { onMount, onDestroy } from 'svelte';
	import { attachZoomPan } from '$lib/utils/zoom-pan';

	interface Props {
		open: boolean;
		svgHtml: string;
		onOpenChange?: (open: boolean) => void;
	}

	let { open = $bindable(), svgHtml, onOpenChange }: Props = $props();

	let contentRef = $state<HTMLDivElement | null>(null);
	let innerRef = $state<HTMLDivElement | null>(null);
	let zoomPanCleanup = $state<(() => void) | null>(null);

	function handleOpenChange(nextOpen: boolean) {
		open = nextOpen;
		onOpenChange?.(nextOpen);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) {
			handleOpenChange(false);
		}
	}

	function cleanupZoomPan() {
		if (zoomPanCleanup) {
			zoomPanCleanup();
			zoomPanCleanup = null;
		}
	}

	$effect(() => {
		if (open && innerRef) {
			// Reset transform from any previous state
			innerRef.style.transform = '';
			zoomPanCleanup = attachZoomPan(innerRef);
		} else {
			cleanupZoomPan();
		}
	});

	onMount(() => {
		window.addEventListener('keydown', handleKeydown);
		return () => window.removeEventListener('keydown', handleKeydown);
	});

	onDestroy(() => {
		cleanupZoomPan();
	});
</script>

<DialogPrimitive.Root {open} onOpenChange={handleOpenChange}>
	<DialogPrimitive.Portal>
		<DialogPrimitive.Overlay class="diagram-fullscreen-overlay" />

		<DialogPrimitive.Content class="diagram-fullscreen-content">
			<div class="diagram-fullscreen-header">
				<span class="diagram-fullscreen-title">Diagram</span>
				<DialogPrimitive.Close class="diagram-fullscreen-close-btn" aria-label="Close preview">
					<XIcon />
				</DialogPrimitive.Close>
			</div>
			<div bind:this={contentRef} class="diagram-fullscreen-body">
				<div bind:this={innerRef} class="diagram-fullscreen-inner">
					<!-- eslint-disable-next-line no-at-html-tags -->
					{@html svgHtml}
				</div>
			</div>
		</DialogPrimitive.Content>
	</DialogPrimitive.Portal>
</DialogPrimitive.Root>

<style lang="postcss">
	:global(.diagram-fullscreen-overlay) {
		position: fixed;
		inset: 0;
		background-color: rgb(0 0 0 / 0.75);
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
		z-index: 100000;
	}

	:global(.diagram-fullscreen-content) {
		position: fixed;
		inset: 1.5rem;
		margin: auto;
		max-width: 95dvw;
		max-height: 95dvh;
		border-radius: 0.75rem;
		background-color: hsl(var(--background));
		box-shadow: 0 20px 60px -15px rgb(0 0 0 / 0.3);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		z-index: 100001;
	}

	:global(.diagram-fullscreen-header) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		background: hsl(var(--muted) / 0.5);
		border-bottom: 1px solid hsl(var(--border));
		flex-shrink: 0;
	}

	:global(.diagram-fullscreen-title) {
		font-size: 0.875rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		font-family:
			ui-monospace, SFMono-Regular, 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono',
			'Liberation Mono', Menlo, monospace;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	:global(.diagram-fullscreen-close-btn) {
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

	:global(.diagram-fullscreen-close-btn:hover) {
		background: hsl(var(--muted));
	}

	:global(.diagram-fullscreen-body) {
		flex: 1;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		background: hsl(var(--background));
	}

	:global(.diagram-fullscreen-inner) {
		display: inline-block;
		max-width: 100%;
		max-height: 100%;
	}

	:global(.diagram-fullscreen-inner svg) {
		max-width: 100%;
		max-height: 100%;
		height: auto;
		width: auto;
	}
</style>
