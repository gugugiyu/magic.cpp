<script lang="ts">
	import { ArrowUp } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { cn } from '$lib/components/ui/utils';

	interface Props {
		canSend?: boolean;
		disabled?: boolean;
		isLoading?: boolean;
		showErrorState?: boolean;
		tooltipLabel?: string;
	}

	let {
		canSend = false,
		disabled = false,
		isLoading = false,
		showErrorState = false,
		tooltipLabel
	}: Props = $props();

	let isDisabled = $derived(!canSend || disabled || isLoading);
</script>

{#snippet submitButton(props = {})}
	<Button
		type="submit"
		disabled={isDisabled}
		class={cn(
			'h-8 w-8 rounded-full p-0 transition-transform duration-75 active:scale-[0.97]',
			showErrorState
				? 'bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive disabled:opacity-100'
				: ''
		)}
		{...props}
	>
		<span class="sr-only">Send</span>
		<ArrowUp class="h-5 w-5" />
	</Button>
{/snippet}

{#if tooltipLabel}
	<Tooltip.Root>
		<Tooltip.Trigger>
			{@render submitButton()}
		</Tooltip.Trigger>

		<Tooltip.Content>
			<p>{tooltipLabel}</p>
		</Tooltip.Content>
	</Tooltip.Root>
{:else}
	{@render submitButton()}
{/if}
