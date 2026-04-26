<script lang="ts">
	import { filesystemStore } from '$lib/stores/filesystem.svelte.js';
	import FileTreeNode from './FileTreeNode.svelte';
	import { RefreshCw, X } from '@lucide/svelte';
	import { slide } from 'svelte/transition';

	interface Props {
		open: boolean;
		onOpenChange?: (open: boolean) => void;
	}

	let { open, onOpenChange }: Props = $props();

	$effect(() => {
		if (open && !filesystemStore.tree && !filesystemStore.loading) {
			filesystemStore.load();
		}
	});

	function handleClose() {
		onOpenChange?.(false);
	}
</script>

{#if open}
	<aside
		class="flex h-full w-72 flex-col border-l bg-background shadow-sm"
		transition:slide={{ duration: 200, axis: 'x' }}
	>
		<div class="flex items-center justify-between border-b px-4 py-3">
			<h2 class="text-sm font-semibold">File Explorer</h2>
			<div class="flex items-center gap-2">
				<button
					type="button"
					class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
					title="Refresh"
					onclick={() => filesystemStore.refresh()}
				>
					<RefreshCw class="h-4 w-4" />
				</button>
				<button
					type="button"
					class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
					title="Close"
					onclick={handleClose}
				>
					<X class="h-4 w-4" />
				</button>
			</div>
		</div>

		<div class="flex-1 overflow-y-auto p-2">
			{#if filesystemStore.loading}
				<div class="flex items-center justify-center py-8 text-sm text-muted-foreground">
					Loading...
				</div>
			{:else if filesystemStore.error}
				<div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
					{filesystemStore.error}
					<button
						type="button"
						class="mt-2 text-xs underline"
						onclick={() => filesystemStore.refresh()}
					>
						Retry
					</button>
				</div>
			{:else if filesystemStore.tree}
				<div class="px-2 pb-2 text-xs text-muted-foreground">
					{filesystemStore.fileCount} files
				</div>
				{#each filesystemStore.tree as node (node.path)}
					<FileTreeNode {node} />
				{/each}
			{:else}
				<div class="flex items-center justify-center py-8 text-sm text-muted-foreground">
					No files loaded
				</div>
			{/if}
		</div>
	</aside>
{/if}
