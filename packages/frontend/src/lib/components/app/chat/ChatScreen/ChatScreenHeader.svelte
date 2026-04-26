<script lang="ts">
	import { Settings, FolderTree } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { useSidebar } from '$lib/components/ui/sidebar';
	import { filesystemStore } from '$lib/stores/filesystem.svelte.js';
	import { goto } from '$app/navigation';

	const sidebar = useSidebar();
</script>

<header
	class="pointer-events-none fixed top-0 right-0 left-0 z-50 flex items-center justify-end p-2 duration-200 ease-linear md:p-4 {sidebar.open
		? 'md:left-[var(--sidebar-width)]'
		: ''}"
>
	<div class="pointer-events-auto flex items-center space-x-2">
		<Button
			variant="ghost"
			size="icon-lg"
			onclick={() => (filesystemStore.sidebarOpen = !filesystemStore.sidebarOpen)}
			class="rounded-full backdrop-blur-lg"
			title="Toggle file tree (Ctrl+Shift+B)"
		>
			<FolderTree class="h-4 w-4 text-foreground" />
		</Button>
		<Button
			variant="ghost"
			size="icon-lg"
			onclick={() => goto('#/settings/general')}
			class="rounded-full backdrop-blur-lg"
		>
			<Settings class="h-4 w-4 text-foreground" />
		</Button>
	</div>
</header>
