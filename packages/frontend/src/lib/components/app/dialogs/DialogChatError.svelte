<script lang="ts">
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { AlertTriangle, TimerOff, Timer, Lock, FileWarning } from '@lucide/svelte';
	import { ErrorDialogType } from '$lib/enums';

	interface Props {
		open: boolean;
		type: ErrorDialogType;
		message: string;
		contextInfo?: { n_prompt_tokens: number; n_ctx: number };
		retryAfter?: number;
		onOpenChange?: (open: boolean) => void;
	}

	let {
		open = $bindable(),
		type,
		message,
		contextInfo,
		retryAfter,
		onOpenChange
	}: Props = $props();

	const config = $derived.by(() => {
		switch (type) {
			case ErrorDialogType.TIMEOUT:
				return {
					title: 'TCP Timeout',
					description: 'The request did not receive a response from the server before timing out.',
					icon: TimerOff,
					iconClass: 'text-destructive',
					badgeClass: 'border-destructive/40 bg-destructive/10 text-destructive'
				};
			case ErrorDialogType.UNAUTHORIZED:
				return {
					title: 'Unauthorized',
					description: 'The API key is invalid or has expired. Please check your credentials.',
					icon: Lock,
					iconClass: 'text-destructive',
					badgeClass: 'border-destructive/40 bg-destructive/10 text-destructive'
				};
			case ErrorDialogType.RATE_LIMIT:
				return {
					title: 'Rate Limited',
					description: retryAfter
						? `Too many requests. Please try again in ${retryAfter} second${retryAfter === 1 ? '' : 's'}.`
						: 'Too many requests. Please try again later.',
					icon: Timer,
					iconClass: 'text-warning',
					badgeClass: 'border-warning/40 bg-warning-bg text-warning'
				};
			case ErrorDialogType.PAYLOAD_TOO_LARGE:
				return {
					title: 'Payload Too Large',
					description:
						'The request was too large for the server to process. Try reducing message length or attachments.',
					icon: FileWarning,
					iconClass: 'text-warning',
					badgeClass: 'border-warning/40 bg-warning-bg text-warning'
				};
			default:
				return {
					title: 'Server Error',
					description: 'The server responded with an error message. Review the details below.',
					icon: AlertTriangle,
					iconClass: 'text-warning',
					badgeClass: 'border-warning/40 bg-warning-bg text-warning'
				};
		}
	});

	function handleOpenChange(newOpen: boolean) {
		open = newOpen;
		onOpenChange?.(newOpen);
	}
</script>

<AlertDialog.Root {open} onOpenChange={handleOpenChange}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title class="flex items-center gap-2">
				<config.icon class={`h-5 w-5 ${config.iconClass}`} />
				{config.title}
			</AlertDialog.Title>

			<AlertDialog.Description>
				{config.description}
			</AlertDialog.Description>
		</AlertDialog.Header>

		<div class={`rounded-lg border px-4 py-3 text-sm ${config.badgeClass}`}>
			<p class="font-medium">{message}</p>
			{#if contextInfo}
				<div class="mt-2 space-y-1 text-xs opacity-80">
					<p>
						<span class="font-medium">Prompt tokens:</span>
						{contextInfo.n_prompt_tokens.toLocaleString()}
					</p>
					{#if contextInfo.n_ctx}
						<p>
							<span class="font-medium">Context size:</span>
							{contextInfo.n_ctx.toLocaleString()}
						</p>
					{/if}
				</div>
			{/if}
		</div>

		<AlertDialog.Footer>
			<AlertDialog.Action onclick={() => handleOpenChange(false)}>Close</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
