<script lang="ts">
	import { KeyboardKey } from '$lib/enums';
	import { File, Folder } from '@lucide/svelte';
	import type { FileSystemNode } from '$lib/services/filesystem.service';

	interface Props {
		class?: string;
		isOpen?: boolean;
		items?: FileSystemNode[];
		query?: string;
		isLoading?: boolean;
		onSelect?: (path: string) => void;
		onClose?: () => void;
	}

	let {
		class: className = '',
		isOpen = false,
		items = [],
		query = '',
		isLoading = false,
		onSelect,
		onClose
	}: Props = $props();

	let selectedIndex = $state(0);
	let listContainer = $state<HTMLDivElement | null>(null);

	$effect(() => {
		if (isOpen) {
			selectedIndex = 0;
		}
	});

	$effect(() => {
		if (items.length > 0 && selectedIndex >= items.length) {
			selectedIndex = 0;
		}
	});

	$effect(() => {
		if (listContainer && selectedIndex >= 0 && selectedIndex < items.length) {
			const selectedElement = listContainer.querySelector(
				`[data-picker-index="${selectedIndex}"]`
			) as HTMLElement | null;

			if (selectedElement) {
				selectedElement.scrollIntoView({
					behavior: 'smooth',
					block: 'nearest',
					inline: 'nearest'
				});
			}
		}
	});

	export function handleKeydown(event: KeyboardEvent): boolean {
		if (!isOpen) return false;

		if (items.length === 0) {
			if (event.key === KeyboardKey.ESCAPE) {
				event.preventDefault();
				onClose?.();
				return true;
			}
			return false;
		}

		if (event.key === KeyboardKey.ARROW_DOWN) {
			event.preventDefault();
			selectedIndex = (selectedIndex + 1) % items.length;
			return true;
		}

		if (event.key === KeyboardKey.ARROW_UP) {
			event.preventDefault();
			selectedIndex = (selectedIndex - 1 + items.length) % items.length;
			return true;
		}

		if (event.key === KeyboardKey.ENTER) {
			event.preventDefault();
			selectItem(items[selectedIndex]);
			return true;
		}

		if (event.key === KeyboardKey.ESCAPE) {
			event.preventDefault();
			onClose?.();
			return true;
		}

		return false;
	}

	function selectItem(node: FileSystemNode) {
		onSelect?.(node.path);
		onClose?.();
	}
</script>

{#if isOpen}
	<div
		class="absolute right-0 bottom-full left-0 z-50 mb-2 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-lg {className}"
		role="listbox"
		tabindex="0"
		aria-label="Select a file or directory"
		aria-activedescendant={selectedIndex >= 0 && items[selectedIndex]
			? `file-option-${selectedIndex}`
			: undefined}
	>
		{#if isLoading}
			<div class="flex items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
				<span class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
				></span>
				Loading files...
			</div>
		{:else if items.length === 0}
			<div class="p-4 text-center text-sm text-muted-foreground">
				{query.trim() ? 'No matching files or directories' : 'No files available'}
			</div>
		{:else}
			<div class="max-h-[210px] overflow-y-auto py-1">
				{#each items as node, index (node.path)}
					<button
						type="button"
						id="file-option-{index}"
						class="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted-foreground/20 {index ===
						selectedIndex
							? 'bg-muted-foreground/20'
							: ''}"
						role="option"
						aria-selected={index === selectedIndex}
						data-picker-index={index}
						onclick={() => selectItem(node)}
						onmouseenter={() => (selectedIndex = index)}
					>
						{#if node.type === 'directory'}
							<Folder class="h-4 w-4 shrink-0 text-muted-foreground" />
						{:else}
							<File class="h-4 w-4 shrink-0 text-muted-foreground" />
						{/if}
						<span class="truncate text-sm">{node.path}</span>
					</button>
				{/each}
			</div>
		{/if}

		<div class="border-t border-border/50 px-3 py-1.5 text-[10px] text-muted-foreground">
			<span class="mr-2">↑↓ navigate</span>
			<span class="mr-2">↵ select</span>
			<span>esc close</span>
		</div>
	</div>
{/if}
