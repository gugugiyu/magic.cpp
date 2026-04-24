<script lang="ts">
	import { Pencil, Trash2, Copy, Wrench, Sparkles } from '@lucide/svelte';
	import { Badge } from '$lib/components/ui/badge';
	import type { PresetView } from '@shared/types/presets';
	import { builtinToolFields } from '$lib/enums/builtin-tools';

	interface Props {
		preset: PresetView;
		isActive?: boolean;
		isOperating?: boolean;
		onEdit?: () => void;
		onDelete?: () => void;
		onDuplicate?: () => void;
		onActivate?: () => void;
		onDeactivate?: () => void;
	}

	let {
		preset,
		isActive = false,
		isOperating = false,
		onEdit,
		onDelete,
		onDuplicate,
		onActivate,
		onDeactivate
	}: Props = $props();

	const toolCount = $derived(preset.enabledTools.length);
	const promptCount = $derived(preset.commonPrompts.length);

	const toolLabels = $derived.by(() => {
		return preset.enabledTools
			.map((key) => builtinToolFields.find((t) => t.key === key)?.label)
			.filter(Boolean) as string[];
	});
</script>

<div
	class="group relative flex flex-col rounded-lg border p-4 backdrop-blur-sm transition-all {isActive
		? 'border-primary/60 bg-primary/5'
		: 'border-border/40 bg-card/60 hover:border-border hover:bg-card/80'} {isOperating
		? 'pointer-events-none opacity-50'
		: ''}"
	aria-busy={isOperating}
>
	<!-- Header: Title + Actions -->
	<div class="mb-2 flex items-start justify-between gap-2">
		<div class="flex items-center gap-2">
			<Sparkles class="h-4 w-4 text-muted-foreground" />
			<h3 class="text-sm leading-tight font-semibold">{preset.name}</h3>
		</div>

		<div class="flex shrink-0 items-center gap-0.5 sm:gap-1">
			{#if onDuplicate}
				<button
					type="button"
					class="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:p-1"
					onclick={onDuplicate}
					disabled={isOperating}
					title="Duplicate preset"
					aria-label="Duplicate preset"
				>
					<Copy class="h-3.5 w-3.5" />
				</button>
			{/if}
			{#if onEdit}
				<button
					type="button"
					class="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:p-1"
					onclick={onEdit}
					disabled={isOperating}
					title="Edit preset"
					aria-label="Edit preset"
				>
					<Pencil class="h-3.5 w-3.5" />
				</button>
			{/if}
			{#if onDelete}
				<button
					type="button"
					class="rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:p-1"
					onclick={onDelete}
					disabled={isOperating}
					title="Delete preset"
					aria-label="Delete preset"
				>
					<Trash2 class="h-3.5 w-3.5" />
				</button>
			{/if}
		</div>
	</div>

	<!-- System prompt preview -->
	<p class="mb-3 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
		{preset.systemPrompt || 'No system prompt'}
	</p>

	<!-- Tools badges -->
	{#if toolLabels.length > 0}
		<div class="mb-2 flex flex-wrap items-center gap-1">
			<Wrench class="mr-1 h-3 w-3 text-muted-foreground" />
			{#each toolLabels.slice(0, 4) as label, i (i)}
				<Badge variant="outline" class="text-[10px]">{label}</Badge>
			{/each}
			{#if toolLabels.length > 4}
				<Badge variant="secondary" class="text-[10px]">+{toolLabels.length - 4}</Badge>
			{/if}
		</div>
	{/if}

	<!-- Footer -->
	<div class="mt-auto flex items-center justify-between gap-2 pt-2">
		<div class="flex items-center gap-1.5">
			<Badge variant="tertiary" class="text-[10px]"
				>{toolCount} tool{toolCount !== 1 ? 's' : ''}</Badge
			>
			<Badge variant="tertiary" class="text-[10px]"
				>{promptCount} prompt{promptCount !== 1 ? 's' : ''}</Badge
			>
		</div>

		{#if onActivate}
			<button
				type="button"
				class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none {isActive
					? 'bg-primary text-primary-foreground hover:bg-primary/90'
					: 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'}"
				onclick={isActive && onDeactivate ? onDeactivate : onActivate}
			>
				{isActive && onDeactivate ? 'Deactivate' : isActive ? 'Active' : 'Activate'}
			</button>
		{/if}
	</div>
</div>
