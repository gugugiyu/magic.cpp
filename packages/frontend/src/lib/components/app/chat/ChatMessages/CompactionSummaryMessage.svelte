<script lang="ts">
	import { ChevronDown, ChevronUp, Package, Copy, Check } from '@lucide/svelte';
	import { copyToClipboard } from '$lib/utils';

	interface Props {
		content: string;
		tokensSaved: number;
		class?: string;
	}

	let { content, tokensSaved, class: className = '' }: Props = $props();

	let collapsed = $state(true);
	let copied = $state(false);

	async function handleCopy() {
		await copyToClipboard(content, 'Summary copied to clipboard');
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

<div
	class="mx-auto w-full max-w-[48rem] {className}"
	role="region"
	aria-label="Session compaction summary"
>
	<!-- Separator line above -->
	<div class="relative flex items-center justify-center py-2">
		<div class="flex-1">
			<div class="h-px bg-border/50"></div>
		</div>
		<div class="mx-3 flex items-center gap-1.5 text-xs text-info/80">
			<Package class="h-3 w-3" />
			<span>Compacted session, ~{tokensSaved.toLocaleString()} tokens saved</span>
		</div>
		<div class="flex-1">
			<div class="h-px bg-border/50"></div>
		</div>
	</div>

	<!-- Summary card -->
	<div class="overflow-hidden rounded-lg border border-border/50 bg-info-bg/30">
		<!-- Header -->
		<div
			class="flex w-full cursor-pointer items-center justify-between px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted/50"
			onclick={() => (collapsed = !collapsed)}
			role="button"
			tabindex="0"
			aria-expanded={!collapsed}
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					collapsed = !collapsed;
				}
			}}
		>
			<span class="font-medium">Session summary</span>
			<div class="flex items-center gap-1">
				<button
					type="button"
					class="rounded p-1 transition-colors hover:bg-muted"
					onclick={(e) => {
						e.stopPropagation();
						handleCopy();
					}}
					aria-label="Copy summary"
				>
					{#if copied}
						<Check class="h-3.5 w-3.5 text-success" />
					{:else}
						<Copy class="h-3.5 w-3.5" />
					{/if}
				</button>
				{#if collapsed}
					<ChevronDown class="h-4 w-4" />
				{:else}
					<ChevronUp class="h-4 w-4" />
				{/if}
			</div>
		</div>

		<!-- Collapsible content -->
		{#if !collapsed}
			<div
				class="border-t border-border/30 px-4 pb-3 text-sm leading-relaxed text-muted-foreground"
			>
				<p class="whitespace-pre-wrap">{content}</p>
			</div>
		{/if}
	</div>
</div>
