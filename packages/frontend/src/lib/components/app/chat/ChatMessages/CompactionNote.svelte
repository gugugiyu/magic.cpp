<script lang="ts">
	import { Package } from '@lucide/svelte';

	interface Props {
		tokensSaved: number;
	}

	let { tokensSaved }: Props = $props();
</script>

<div class="mx-auto w-full max-w-[48rem] py-4" role="status" aria-live="polite" aria-atomic="true">
	<div class="relative flex items-center justify-center">
		<!-- Left divider -->
		<div class="flex-1">
			<div class="h-px bg-border/50"></div>
		</div>

		<!-- Center note -->
		<div class="mx-3 flex items-center gap-1.5 text-xs text-muted-foreground/60">
			<Package class="h-3 w-3" />
			<span>Session compacted, ~{tokensSaved.toLocaleString()} estimated tokens saved</span>
		</div>

		<!-- Right divider -->
		<div class="flex-1">
			<div class="h-px bg-border/50"></div>
		</div>
	</div>
</div>
