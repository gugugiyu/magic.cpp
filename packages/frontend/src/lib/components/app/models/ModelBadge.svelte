<script lang="ts">
	import { Package, Filter } from '@lucide/svelte';
	import { BadgeInfo, ActionIconCopyToClipboard } from '$lib/components/app';
	import ModelId from './ModelId.svelte';
	import { modelsStore } from '$lib/stores/models.svelte';
	import { serverStore } from '$lib/stores/server.svelte';
	import { config } from '$lib/stores/settings.svelte';
	import { getActiveFilters } from '$lib/utils';
	import * as Tooltip from '$lib/components/ui/tooltip';

	interface Props {
		class?: string;
		model?: string;
		onclick?: () => void;
		showCopyIcon?: boolean;
		showTooltip?: boolean;
	}

	let {
		class: className = '',
		model: modelProp,
		onclick,
		showCopyIcon = false,
		showTooltip = false
	}: Props = $props();

	let model = $derived(modelProp || modelsStore.singleModelName);
	let isModelMode = $derived(serverStore.isModelMode);
	let shouldShow = $derived(model && (modelProp !== undefined || isModelMode));

	const filterOptions = $derived({
		filterEmojiRemoval: config().filterEmojiRemoval as boolean,
		filterCodeblockOnly: config().filterCodeblockOnly as boolean,
		filterRawMode: config().filterRawMode as boolean,
		filterNormalizeMarkdown: config().filterNormalizeMarkdown as boolean
	});
	const activeFilters = $derived(getActiveFilters(filterOptions));
	const filterCount = $derived(activeFilters.length);
</script>

{#snippet badgeContent()}
	<BadgeInfo class={className} {onclick}>
		{#snippet icon()}
			<Package class="h-3 w-3" />
		{/snippet}

		{#if model}
			<ModelId modelId={model} />
		{/if}

		{#if showCopyIcon}
			<ActionIconCopyToClipboard text={model || ''} ariaLabel="Copy model name" />
		{/if}
	</BadgeInfo>
{/snippet}

{#if shouldShow}
	<div class="inline-flex items-center gap-1">
		{#if showTooltip}
			<Tooltip.Root>
				<Tooltip.Trigger>
					{@render badgeContent()}
				</Tooltip.Trigger>

				<Tooltip.Content>
					{onclick ? 'Click for model details' : model}
				</Tooltip.Content>
			</Tooltip.Root>
		{:else}
			{@render badgeContent()}
		{/if}

		{#if filterCount > 0}
			{#if showTooltip}
				<Tooltip.Root>
					<Tooltip.Trigger>
						<div
							class="inline-flex cursor-default items-center gap-0.5 rounded-sm bg-primary/20 px-1.5 py-0.5 text-xs font-medium text-primary"
						>
							<Filter class="h-3 w-3" />
							<span>{filterCount}</span>
						</div>
					</Tooltip.Trigger>

					<Tooltip.Content>
						Active filters: {activeFilters.join(', ')}
					</Tooltip.Content>
				</Tooltip.Root>
			{:else}
				<div
					class="inline-flex cursor-default items-center gap-0.5 rounded-sm bg-primary/20 px-1.5 py-0.5 text-xs font-medium text-primary"
					title="Active filters: {activeFilters.join(', ')}"
				>
					<Filter class="h-3 w-3" />
					<span>{filterCount}</span>
				</div>
			{/if}
		{/if}
	</div>
{/if}
