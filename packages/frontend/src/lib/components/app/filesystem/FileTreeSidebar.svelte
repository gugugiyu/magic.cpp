<script lang="ts">
	import { filesystemStore } from '$lib/stores/filesystem.svelte.js';
	import FileTreeNode from './FileTreeNode.svelte';
	import SearchInput from '$lib/components/app/forms/SearchInput.svelte';
	import { RefreshCw, X } from '@lucide/svelte';
	import { slide } from 'svelte/transition';

	interface Props {
		open: boolean;
		onOpenChange?: (open: boolean) => void;
	}

	let { open, onOpenChange }: Props = $props();

	$effect(() => {
		if (open && !filesystemStore.tree && !filesystemStore.loading && !filesystemStore.error) {
			filesystemStore.load();
		}
	});

	function handleClose() {
		onOpenChange?.(false);
	}

	function handleSearch(value: string) {
		filesystemStore.searchQuery = value;
	}

	let displayTree = $derived(filesystemStore.filteredTree);
	let hasSearch = $derived(!!filesystemStore.searchQuery.trim());
</script>

{#if open}
	<aside
		class="z-999 flex h-full w-72 flex-col border-l bg-background shadow-sm"
		transition:slide={{ duration: 200, axis: 'x' }}
	>
		<div class="flex items-center justify-between border-b px-4 py-3">
			<h2 class="text-sm font-semibold">File Explorer</h2>
			<div class="flex items-center gap-2">
				<button
					type="button"
					class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-accent-foreground"
					title="Refresh"
					onclick={() => filesystemStore.refresh()}
				>
					<RefreshCw class="h-4 w-4" />
				</button>
				<button
					type="button"
					class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-accent-foreground"
					title="Close"
					onclick={handleClose}
				>
					<X class="h-4 w-4" />
				</button>
			</div>
		</div>

		<div class="px-2 py-2">
			<SearchInput
				placeholder="Search files..."
				bind:value={filesystemStore.searchQuery}
				onInput={handleSearch}
			/>
		</div>

		<div class="flex-1 overflow-y-auto p-2">
			{#if filesystemStore.loading}
				<div class="flex items-center justify-center py-8 text-sm text-muted-foreground">
					Loading...
				</div>
			{:else if filesystemStore.error}
				<div class="rounded-md p-3 text-sm text-destructive">
					{filesystemStore.error}
					<button
						type="button"
						class="mt-2 text-xs underline"
						onclick={() => filesystemStore.refresh()}
					>
						Retry
					</button>
				</div>
			{:else if displayTree}
				<div class="px-2 pb-2 text-xs text-muted-foreground">
					{#if hasSearch}
						Found {filesystemStore.fileCount} files
					{:else}
						{filesystemStore.fileCount} files
					{/if}
				</div>
				{#each displayTree as node (node.path)}
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
