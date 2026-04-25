<script lang="ts">
	import { Collapsible as CollapsiblePrimitive } from 'bits-ui';
	import { slide } from 'svelte/transition';
	import { motionStore } from '$lib/stores/motion.svelte';

	let { ref = $bindable(null), ...restProps }: CollapsiblePrimitive.ContentProps = $props();
</script>

<CollapsiblePrimitive.Content bind:ref data-slot="collapsible-content" {...restProps} forceMount>
	{#snippet child({ props, open })}
		{#if open}
			<div {...props} transition:slide={motionStore.slide()}>
				{@render restProps.children?.()}
			</div>
		{/if}
	{/snippet}
</CollapsiblePrimitive.Content>
