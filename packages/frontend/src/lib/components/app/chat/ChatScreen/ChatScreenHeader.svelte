<script lang="ts">
	import { Settings, Brain } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { useSidebar } from '$lib/components/ui/sidebar';
	import { getChatSettingsDialogContext } from '$lib/contexts';
	import { config } from '$lib/stores/settings.svelte';
	import ChatThinkingDrawer from '$lib/components/app/chat/ChatThinkingDrawer.svelte';

	const sidebar = useSidebar();
	const chatSettingsDialog = getChatSettingsDialogContext();

	let isThinkingDrawerOpen = $state(false);
	let isSequentialThinkingEnabled = $derived(config().builtinToolSequentialThinking);
</script>

<header
	class="pointer-events-none fixed top-0 right-0 left-0 z-50 flex items-center justify-end p-2 duration-200 ease-linear md:p-4 {sidebar.open
		? 'md:left-[var(--sidebar-width)]'
		: ''}"
>
	<div class="pointer-events-auto flex items-center space-x-2">
		{#if isSequentialThinkingEnabled}
			<Button
				variant="ghost"
				size="icon-lg"
				onclick={() => (isThinkingDrawerOpen = true)}
				class="rounded-full backdrop-blur-lg"
				aria-label="Open reasoning history"
			>
				<Brain class="h-4 w-4" />
			</Button>
		{/if}

		<Button
			variant="ghost"
			size="icon-lg"
			onclick={() => chatSettingsDialog.open()}
			class="rounded-full backdrop-blur-lg"
		>
			<Settings class="h-4 w-4" />
		</Button>
	</div>
</header>

<ChatThinkingDrawer
	bind:open={isThinkingDrawerOpen}
	onClose={() => (isThinkingDrawerOpen = false)}
/>
