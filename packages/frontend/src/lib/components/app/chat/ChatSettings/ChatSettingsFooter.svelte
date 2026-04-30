<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { settingsStore } from '$lib/stores/settings.svelte';
	import { RotateCcw } from '@lucide/svelte';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { goto } from '$app/navigation';
	import { is } from 'zod/locales';

	interface Props {
		onReset?: () => void;
		onSave?: () => boolean | void;
		isDirty?: boolean;
		closeOnSave?: boolean;
	}

	let { onReset, onSave, isDirty = false, closeOnSave = true }: Props = $props();

	let showResetDialog = $state(false);
	let showIndicator = $derived(isDirty);

	$inspect(isDirty)

	function handleResetClick() {
		showResetDialog = true;
	}

	function handleConfirmReset() {
		settingsStore.forceSyncWithServerDefaults();
		onReset?.();

		showResetDialog = false;
	}

	function handleSave() {
		// We capture wasDirty because onSave() will override localStorage defaults hence making the unsaved hook returns isDirty = false
		const wasDirty = isDirty;

		const saved = onSave?.();
		if (closeOnSave && saved !== false && wasDirty) {
			goto('#/');
		}
	}
</script>

<div
	class="footer sticky bottom-0 flex justify-between border-t border-border/30 p-6"
	style="background: var(--background)"
>
	<div class="flex items-center gap-3">
		<Button variant="outline" onclick={handleResetClick}>
			<RotateCcw class="h-3 w-3" />

			Reset to default
		</Button>

		{#if showIndicator}
			<span
				class="flex items-center gap-1.5 text-xs text-destructive"
				transition:fly={{ x: -10, duration: 250, easing: cubicOut }}
			>
				<span class="relative flex h-2 w-2">
					<span
						class="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive/75 opacity-75"
					></span>
					<span class="relative inline-flex h-2 w-2 rounded-full bg-destructive"></span>
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
