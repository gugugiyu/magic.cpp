<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { settingsStore } from '$lib/stores/settings.svelte';
	import { RotateCcw } from '@lucide/svelte';

	interface Props {
		onReset?: () => void;
		onSave?: () => void;
		isDirty?: boolean;
	}

	let { onReset, onSave, isDirty = false }: Props = $props();

	let showResetDialog = $state(false);
	let showIndicator = $state(false);

	$effect(() => {
		if (isDirty) {
			showIndicator = true;
		} else {
			const timer = setTimeout(() => {
				showIndicator = false;
			}, 300);
			return () => clearTimeout(timer);
		}
	});

	function handleResetClick() {
		showResetDialog = true;
	}

	function handleConfirmReset() {
		settingsStore.forceSyncWithServerDefaults();
		onReset?.();

		showResetDialog = false;
	}

	function handleSave() {
		onSave?.();
	}
</script>

<div class="flex justify-between border-t border-border/30 p-6">
	<div class="flex items-center gap-3">
		<Button variant="outline" onclick={handleResetClick}>
			<RotateCcw class="h-3 w-3" />

			Reset to default
		</Button>

		{#if showIndicator}
			<span
				class="flex items-center gap-1.5 text-xs text-amber-500 transition-all duration-300 {isDirty
					? 'translate-x-0 opacity-100'
					: 'translate-x-2 opacity-0'}"
			>
				<span class="relative flex h-2 w-2">
					<span
						class="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75"
					></span>
					<span class="relative inline-flex h-2 w-2 rounded-full bg-amber-500"></span>
				</span>
				You have unsaved changes
			</span>
		{/if}
	</div>

	<Button onclick={handleSave}>Save settings</Button>
</div>

<AlertDialog.Root bind:open={showResetDialog}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Reset Settings to Default</AlertDialog.Title>
			<AlertDialog.Description>
				Are you sure you want to reset all settings to their default values? This will reset all
				parameters to the values provided by the server's /props endpoint and remove all your custom
				configurations.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action onclick={handleConfirmReset}>Reset to Default</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
