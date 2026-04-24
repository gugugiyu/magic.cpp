<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { ChatFormHelperText, ChatForm } from '$lib/components/app';
	import { modelsStore } from '$lib/stores/models.svelte';
	import { skillsStore } from '$lib/stores/skills.svelte';
	import { parseSkillInvocation, extractSkillContent, substituteSkillArguments } from '$lib/utils';
	import { onMount } from 'svelte';

	interface Props {
		class?: string;
		disabled?: boolean;
		initialMessage?: string;
		isLoading?: boolean;
		onFileRemove?: (fileId: string) => void;
		onFileUpload?: (files: File[]) => void;
		onSend?: (message: string, files?: ChatUploadedFile[]) => Promise<boolean>;
		onStop?: () => void;
		onSystemPromptAdd?: (draft: { message: string; files: ChatUploadedFile[] }) => void;
		showHelperText?: boolean;
		uploadedFiles?: ChatUploadedFile[];
	}

	let {
		class: className,
		disabled = false,
		initialMessage = '',
		isLoading = false,
		onFileRemove,
		onFileUpload,
		onSend,
		onStop,
		onSystemPromptAdd,
		showHelperText = true,
		uploadedFiles = $bindable([])
	}: Props = $props();

	let chatFormRef: ChatForm | undefined = $state(undefined);
	let message = $derived(initialMessage);
	let previousIsLoading = $derived(isLoading);
	let previousInitialMessage = $derived(initialMessage);

	// Sync message when initialMessage prop changes (e.g., after draft restoration)
	$effect(() => {
		if (initialMessage !== previousInitialMessage) {
			message = initialMessage;
			previousInitialMessage = initialMessage;
		}
	});

	function handleSystemPromptClick() {
		onSystemPromptAdd?.({ message, files: uploadedFiles });
	}

	let hasLoadingAttachments = $derived(uploadedFiles.some((f) => f.isLoading));

	async function handleSubmit() {
		if (
			(!message.trim() && uploadedFiles.length === 0) ||
			disabled ||
			isLoading ||
			hasLoadingAttachments
		)
			return;

		if (!chatFormRef?.checkModelSelected()) return;

		const originalMessage = message.trim();
		let messageToSend = originalMessage;

		// Expand /skills shorthand into full skill content before sending
		const skillInvocation = parseSkillInvocation(messageToSend);
		if (skillInvocation) {
			const skill = skillsStore.findSkill(skillInvocation.name);
			if (skill) {
				const body = extractSkillContent(skill.content);
				messageToSend = substituteSkillArguments(body, skillInvocation.args);
			}
		}

		const filesToSend = [...uploadedFiles];

		message = '';
		uploadedFiles = [];

		chatFormRef?.resetTextareaHeight();

		const success = await onSend?.(messageToSend, filesToSend);

		if (!success) {
			// Restore the shorthand, not the expanded content
			message = originalMessage;
			uploadedFiles = filesToSend;
		}
	}

	function handleFilesAdd(files: File[]) {
		onFileUpload?.(files);
	}

	function handleUploadedFileRemove(fileId: string) {
		onFileRemove?.(fileId);
	}

	onMount(() => {
		requestAnimationFrame(() => chatFormRef?.focus());
	});

	afterNavigate(() => {
		requestAnimationFrame(() => chatFormRef?.focus());
	});

	$effect(() => {
		if (previousIsLoading && !isLoading) {
			requestAnimationFrame(() => chatFormRef?.focus());
		}

		previousIsLoading = isLoading;
	});
</script>

<div class="relative mx-auto max-w-[48rem]">
	<ChatForm
		bind:this={chatFormRef}
		bind:value={message}
		bind:uploadedFiles
		class={className}
		disabled={disabled || modelsStore.models.length === 0}
		{isLoading}
		showMcpPromptButton
		onFilesAdd={handleFilesAdd}
		{onStop}
		onSubmit={handleSubmit}
		onSystemPromptClick={handleSystemPromptClick}
		onUploadedFileRemove={handleUploadedFileRemove}
	/>
</div>

<ChatFormHelperText show={showHelperText} />
