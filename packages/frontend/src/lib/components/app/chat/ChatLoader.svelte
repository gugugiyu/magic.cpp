<script lang="ts">
	import { ACTIVITY_MESSAGES } from '$lib/enums/witty-messages';
	import { loadingContext, type LoadingActivity } from '$lib/stores/loading-context.svelte';

	interface Props {
		convId: string;
	}

	let { convId }: Props = $props();

	function getMessages(activity: LoadingActivity): string[] {
		if (activity.type === 'tool') {
			const key = `tool-${activity.name}`;
			return ACTIVITY_MESSAGES[key] ?? ACTIVITY_MESSAGES.generation;
		}
		if (activity.type === 'subagent') {
			if (activity.skillName) {
				return [
					`Running the ${activity.skillName} playbook…`,
					`Deploying ${activity.skillName} expertise…`,
					`The ${activity.skillName} specialist is on it…`,
					`Consulting the ${activity.skillName} manual…`
				];
			}
			return ACTIVITY_MESSAGES.subagent;
		}
		return ACTIVITY_MESSAGES[activity.type] ?? ACTIVITY_MESSAGES.generation;
	}

	const activity = $derived(loadingContext.getActivity(convId));
	const messages = $derived(getMessages(activity));

	let messageIndex = $state(0);
	let visible = $state(true);

	// Reset index when activity changes
	$effect(() => {
		void activity;
		messageIndex = 0;
		visible = true;
	});

	// Cycle through messages every 2.5s with a gentle cross-fade
	$effect(() => {
		if (messages.length <= 1) return;
		const interval = setInterval(() => {
			visible = false;
			const timeout = setTimeout(() => {
				messageIndex = (messageIndex + 1) % messages.length;
				visible = true;
			}, 250);
			return () => clearTimeout(timeout);
		}, 2800);
		return () => clearInterval(interval);
	});

	const currentMessage = $derived(messages[messageIndex] ?? 'Processing…');
</script>

<div class="chat-loader">
	<span class="chat-loader-spinner" aria-hidden="true"></span>
	<span class="chat-loader-message" class:visible>
		{currentMessage}
	</span>
</div>

<style>
	.chat-loader {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 500;
		font-size: 0.875rem;
		color: var(--muted-foreground);
	}

	.chat-loader-spinner::before {
		content: '⠋';
		display: inline-block;
		width: 1em;
		text-align: center;
		animation: braille-spin 0.8s linear infinite;
	}

	@keyframes braille-spin {
		0% {
			content: '⠋';
		}
		10% {
			content: '⠙';
		}
		20% {
			content: '⠹';
		}
		30% {
			content: '⠸';
		}
		40% {
			content: '⠼';
		}
		50% {
			content: '⠴';
		}
		60% {
			content: '⠦';
		}
		70% {
			content: '⠧';
		}
		80% {
			content: '⠇';
		}
		90% {
			content: '⠏';
		}
		100% {
			content: '⠋';
		}
	}

	.chat-loader-message {
		opacity: 0;
		transform: translateY(2px);
		transition:
			opacity 250ms ease-out,
			transform 250ms ease-out;
	}

	.chat-loader-message.visible {
		opacity: 1;
		transform: translateY(0);
	}
</style>
