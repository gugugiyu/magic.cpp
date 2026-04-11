<script lang="ts">
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import type { Component, Snippet } from 'svelte';
	import { KeyboardKey } from '$lib/enums';

	interface Props {
		open: boolean;
		title: string;
		description: string;
		confirmText?: string;
		cancelText?: string;
		variant?: 'default' | 'destructive';
		icon?: Component;
		disabled?: boolean;
		disabledCancel?: boolean;
		onConfirm: () => void;
		onCancel: () => void;
		onKeydown?: (event: KeyboardEvent) => void;
		children?: Snippet;
	}

	let {
		open = $bindable(),
		title,
		description,
		confirmText = 'Confirm',
		cancelText = 'Cancel',
		variant = 'default',
		icon,
		disabled = false,
		disabledCancel = false,
		onConfirm,
		onCancel,
		onKeydown,
		children
	}: Props = $props();

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === KeyboardKey.ENTER) {
			event.preventDefault();
			onConfirm();
		}
		onKeydown?.(event);
	}

	function handleOpenChange(newOpen: boolean) {
		if (!newOpen && !disabledCancel) {
			onCancel();
		}
	}
</script>

<AlertDialog.Root {open} onOpenChange={handleOpenChange}>
	<AlertDialog.Content onkeydown={handleKeydown}>
		<AlertDialog.Header>
			<AlertDialog.Title class="flex items-center gap-2">
				{#if icon}
					{@const IconComponent = icon}
					<IconComponent class="h-5 w-5 {variant === 'destructive' ? 'text-destructive' : ''}" />
				{/if}
				{title}
			</AlertDialog.Title>

			<AlertDialog.Description>
				{description}
			</AlertDialog.Description>
		</AlertDialog.Header>

		{#if children}
			{@render children()}
		{/if}

		<AlertDialog.Footer>
			<AlertDialog.Cancel
				onclick={disabledCancel ? undefined : onCancel}
				disabled={disabledCancel}
				class={disabledCancel ? 'cursor-not-allowed opacity-50' : ''}
				>{cancelText}</AlertDialog.Cancel
			>
			<AlertDialog.Action
				onclick={onConfirm}
				{disabled}
				class="{variant === 'destructive'
					? 'bg-destructive text-white hover:bg-destructive/80'
					: ''} {disabled ? 'cursor-not-allowed opacity-50' : ''}"
			>
				{confirmText}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
