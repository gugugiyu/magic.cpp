<script lang="ts">
	import { todoStore } from '$lib/stores/todos.svelte';
	import { slide } from 'svelte/transition';

	interface Props {
		convId: string;
		open?: boolean;
	}

	let { convId, open = true }: Props = $props();

	$effect(() => {
		if (convId) todoStore.loadTodos(convId);
	});

	let todos = $derived(todoStore.getTodos(convId));
	let completed = $derived(todos.filter((t) => t.done).length);
	let total = $derived(todos.length);
	let progress = $derived(total > 0 ? completed / total : 0);
	let firstUndoneIndex = $derived(todos.findIndex((t) => !t.done));

	let editingIndex = $state<number | null>(null);
	let editingText = $state('');
	let editInputRef: HTMLInputElement | undefined = $state(undefined);

	function startEdit(i: number, text: string) {
		editingIndex = i;
		editingText = text;
		requestAnimationFrame(() => editInputRef?.focus());
	}

	function commitEdit() {
		if (editingIndex !== null && convId) {
			const trimmed = editingText.trim();
			if (trimmed) {
				todoStore.editTodo(convId, editingIndex, trimmed);
			}
		}
		editingIndex = null;
		editingText = '';
	}

	function cancelEdit() {
		editingIndex = null;
		editingText = '';
	}

	function handleEditKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			commitEdit();
		} else if (e.key === 'Escape') {
			cancelEdit();
		}
	}
</script>

{#if open && total > 0}
	<div
		class="border-b border-border/40 px-5 pt-2 pb-0"
		transition:slide={{ duration: 200, axis: 'y' }}
	>
		<div class="flex items-start gap-3">
			<!-- Circular progress -->
			<div class="relative shrink-0 pt-0.5">
				<svg class="h-8 w-8 -rotate-90" viewBox="0 0 36 36">
					<circle
						cx="18"
						cy="18"
						r="15.9155"
						fill="none"
						stroke="currentColor"
						stroke-width="3"
						class="text-border/60"
					/>
					<circle
						cx="18"
						cy="18"
						r="15.9155"
						fill="none"
						stroke="currentColor"
						stroke-width="3"
						stroke-dasharray={`${progress * 100} 100`}
						stroke-linecap="round"
						class="text-primary transition-all duration-500"
					/>
				</svg>
				<span
					class="absolute inset-0 flex items-center justify-center text-[10px] font-semibold tabular-nums"
				>
					{completed}/{total}
				</span>
			</div>

			<!-- Todo list -->
			<ul class="flex min-w-0 flex-1 flex-col gap-1 pb-2">
				{#each todos as todo, i (i)}
					{@const isDone = todo.done}
					{@const isCurrent = i === firstUndoneIndex}
					{@const isUpcoming = !isDone && !isCurrent}
					<li class="text-sm leading-relaxed">
						{#if editingIndex === i}
							<input
								bind:this={editInputRef}
								bind:value={editingText}
								onkeydown={handleEditKeydown}
								onblur={commitEdit}
								class="w-full rounded-md bg-transparent px-1 py-0.5 text-sm ring-1 ring-primary/50 outline-none ring-inset"
							/>
						{:else}
							<button
								type="button"
								class="w-full text-left cursor-pointer {isDone ? 'line-through opacity-40' : ''} {isCurrent
									? 'font-medium text-foreground'
									: ''} {isUpcoming ? 'text-muted-foreground' : ''}"
								onclick={() => startEdit(i, todo.text)}
								title="Click to edit"
							>
								{todo.text}
							</button>
						{/if}
					</li>
				{/each}
			</ul>
		</div>
	</div>
{/if}
