<script lang="ts">
	import type { FileSystemNode } from '$lib/services/filesystem.service.js';
	import { filesystemStore } from '$lib/stores/filesystem.svelte.js';
	import FileTreeNode from './FileTreeNode.svelte';
	import { slide } from 'svelte/transition';
	import { ChevronRight, Folder, File } from '@lucide/svelte';

	interface Props {
		node: FileSystemNode;
		depth?: number;
	}

	let { node, depth = 0 }: Props = $props();

	let indent = $derived(depth * 12);
	let isNodeExpanded = $derived(filesystemStore.expanded.has(node.path));

	function handleClick() {
		if (node.type === 'directory') {
			if (node.children === undefined) {
				filesystemStore.load(node.path);
			} else {
				filesystemStore.toggle(node.path);
			}
		}
	}
</script>

<div class="select-none">
	<button
		type="button"
		class="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-sm hover:bg-muted"
		style="padding-left: {indent + 8}px"
		onclick={handleClick}
	>
		{#if node.type === 'directory'}
			<ChevronRight
				class={`h-4 w-4 shrink-0 transition-transform ${isNodeExpanded ? 'rotate-90' : ''}`}
			/>
			<Folder class="h-4 w-4 shrink-0 text-yellow-500" />
			<span class="truncate font-medium">{node.name}</span>
		{:else}
			<span class="ml-5.5 h-4 w-4 shrink-0"></span>
			<File class="h-4 w-4 shrink-0 text-gray-400" />
			<span class="truncate text-gray-600 dark:text-gray-300">{node.name}</span>
		{/if}
	</button>

	{#if node.type === 'directory' && node.children && isNodeExpanded}
		<div transition:slide={{ duration: 150 }}>
			{#each node.children as child (child.path)}
				<FileTreeNode node={child} depth={depth + 1} />
			{/each}
		</div>
	{/if}
</div>
