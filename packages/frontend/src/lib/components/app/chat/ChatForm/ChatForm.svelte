<script lang="ts">
	import {
		ChatAttachmentsList,
		ChatAttachmentMcpResources,
		ChatFormActions,
		ChatFormFileInputInvisible,
		ChatFormPromptPicker,
		ChatFormResourcePicker,
		ChatFormTextarea,
		ChatFormSkillPicker,
		FilePocket,
		TodoPocket
	} from '$lib/components/app';
	import { DialogMcpResources } from '$lib/components/app/dialogs';
	import {
		CLIPBOARD_CONTENT_QUOTE_PREFIX,
		INPUT_CLASSES,
		SETTING_CONFIG_DEFAULT,
		INITIAL_FILE_SIZE,
		PROMPT_CONTENT_SEPARATOR,
		PROMPT_TRIGGER_PREFIX,
		RESOURCE_TRIGGER_PREFIX
	} from '$lib/constants';
	import {
		ContentPartType,
		FileExtensionText,
		KeyboardKey,
		MimeTypeText,
		SpecialFileType
	} from '$lib/enums';
	import { config } from '$lib/stores/settings.svelte';
	import { selectedModelId, modelsStore } from '$lib/stores/models.svelte';
	import { isRouterMode } from '$lib/stores/server.svelte';
	import { chatStore } from '$lib/stores/chat.svelte';
	import { agenticStore } from '$lib/stores/agentic.svelte';
	import { mcpStore } from '$lib/stores/mcp.svelte';
	import { mcpHasResourceAttachments } from '$lib/stores/mcp-resources.svelte';
	import { conversationsStore, activeMessages } from '$lib/stores/conversations.svelte';
	import type { GetPromptResult, MCPPromptInfo, MCPResourceInfo, PromptMessage } from '$lib/types';
	import type { SkillDefinition } from '@shared/types/skills';
	import { isIMEComposing, parseClipboardContent, uuid } from '$lib/utils';
	import {
		AudioRecorder,
		convertToWav,
		createAudioFile,
		isAudioRecordingSupported
	} from '$lib/utils/browser-only';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { presetsStore } from '$lib/stores/presets.svelte';
	import { filesystemStore } from '$lib/stores/filesystem.svelte';
	import type { FileSystemNode } from '$lib/services/filesystem.service';

	interface Props {
		// Data
		attachments?: DatabaseMessageExtra[];
		uploadedFiles?: ChatUploadedFile[];
		value?: string;

		// UI State
		class?: string;
		disabled?: boolean;
		isLoading?: boolean;
		placeholder?: string;
		showMcpPromptButton?: boolean;

		// Event Handlers
		onAttachmentRemove?: (index: number) => void;
		onFilesAdd?: (files: File[]) => void;
		onStop?: () => void;
		onSubmit?: (mode?: 'followup' | 'steering') => void;
		onSystemPromptClick?: (draft: { message: string; files: ChatUploadedFile[] }) => void;
		onUploadedFileRemove?: (fileId: string) => void;
		onUploadedFilesChange?: (files: ChatUploadedFile[]) => void;
		onValueChange?: (value: string) => void;
	}

	let {
		attachments = [],
		class: className = '',
		disabled = false,
		isLoading = false,
		placeholder = 'Type a message' +
			(presetsStore.activePreset ? ` to ${presetsStore.activePreset?.name}` : '...'),
		showMcpPromptButton = false,
		uploadedFiles = $bindable([]),
		value = $bindable(''),
		onAttachmentRemove,
		onFilesAdd,
		onStop,
		onSubmit,
		onSystemPromptClick,
		onUploadedFileRemove,
		onUploadedFilesChange,
		onValueChange
	}: Props = $props();

	/**
	 *
	 *
	 * STATE
	 *
	 *
	 */

	// Component References
	let audioRecorder: AudioRecorder | undefined;
	let chatFormActionsRef: ChatFormActions | undefined = $state(undefined);
	let fileInputRef: ChatFormFileInputInvisible | undefined = $state(undefined);
	let promptPickerRef: ChatFormPromptPicker | undefined = $state(undefined);
	let resourcePickerRef: ChatFormResourcePicker | undefined = $state(undefined);
	let skillPickerRef: ChatFormSkillPicker | undefined = $state(undefined);
	let textareaRef: ChatFormTextarea | undefined = $state(undefined);

	// Audio Recording State
	let isRecording = $state(false);
	let recordingSupported = $state(false);

	// Prompt Picker State
	let isPromptPickerOpen = $state(false);
	let promptSearchQuery = $state('');

	// Inline Resource Picker State (triggered by @)
	let isInlineResourcePickerOpen = $state(false);
	let resourceSearchQuery = $state('');

	// Resource Dialog State
	let isResourceDialogOpen = $state(false);
	let preSelectedResourceUri = $state<string | undefined>(undefined);

	// Skill Picker State
	let isSkillPickerOpen = $state(false);
	let skillSearchQuery = $state('');

	// Todo Pocket State
	let isTodoPocketOpen = $state(false);

	// File Pocket State
	let isFilePocketOpen = $state(false);
	let filePocketQuery = $state('');

	let _filePocketSetIdx = $state(0);
	let filePocketTokenStart = $state(0);
	let filePocketTokenEnd = $state(0);
	let filePocketRef: FilePocket | undefined = $state(undefined);

	/**
	 *
	 *
	 * DERIVED STATE
	 *
	 *
	 */

	// Configuration
	let currentConfig = $derived(config());
	let pasteLongTextToFileLength = $derived.by(() => {
		const n = Number(currentConfig.pasteLongTextToFileLen);
		return Number.isNaN(n) ? Number(SETTING_CONFIG_DEFAULT.pasteLongTextToFileLen) : n;
	});

	// Model Selection Logic
	let isRouter = $derived(isRouterMode());
	let conversationModel = $derived(
		chatStore.getConversationModel(activeMessages() as DatabaseMessage[])
	);
	let activeModelId = $derived.by(() => modelsStore.resolveActiveModelId(conversationModel));

	// Form Validation State
	let hasModelSelected = $derived(!isRouter || !!conversationModel || !!selectedModelId());
	let hasLoadingAttachments = $derived(uploadedFiles.some((f) => f.isLoading));
	let hasAttachments = $derived(
		(attachments && attachments.length > 0) || (uploadedFiles && uploadedFiles.length > 0)
	);
	let canSubmit = $derived(value.trim().length > 0 || hasAttachments);

	// Dynamic placeholder based on steering availability
	let displayPlaceholder = $derived.by(() => {
		if (!isLoading) return placeholder;
		const currentCfg = config();
		const perChatOverrides = conversationsStore.getAllMcpServerOverrides();
		const agenticConfig = agenticStore.getConfig(currentCfg, perChatOverrides);
		if (agenticConfig.enabled) {
			const base =
				'Type a message' +
				(presetsStore.activePreset ? ` to ${presetsStore.activePreset?.name}` : '');
			return `${base} (Alt+Enter to steer)`;
		}
		return placeholder;
	});

	let allFileNodes = $derived(filesystemStore.tree ? flattenFileTree(filesystemStore.tree) : []);

	let filePocketItems = $derived.by(() => {
		const q = filePocketQuery.toLowerCase().trim();
		return allFileNodes
			.map((n) => ({ n, score: scorePathMatch(n, q) }))
			.filter((x) => x.score > 0)
			.sort((a, b) => b.score - a.score)
			.map((x) => x.n)
			.slice(0, 50);
	});

	/**
	 *
	 *
	 * LIFECYCLE
	 *
	 *
	 */

	onMount(() => {
		recordingSupported = isAudioRecordingSupported();
		audioRecorder = new AudioRecorder();
	});

	/**
	 *
	 *
	 * PUBLIC API
	 *
	 *
	 */

	export function focus() {
		textareaRef?.focus();
	}

	export function resetTextareaHeight() {
		textareaRef?.resetHeight();
	}

	export function setValue(text: string) {
		value = text;
		onValueChange?.(text);
		requestAnimationFrame(() => textareaRef?.focus());
	}

	export function openModelSelector() {
		chatFormActionsRef?.openModelSelector();
	}

	/**
	 * Check if a model is selected, open selector if not
	 * @returns true if model is selected, false otherwise
	 */
	export function checkModelSelected(): boolean {
		if (!hasModelSelected) {
			chatFormActionsRef?.openModelSelector();
			return false;
		}
		return true;
	}

	/**
	 *
	 *
	 * EVENT HANDLERS - File Management
	 *
	 *
	 */

	function handleFileSelect(files: File[]) {
		onFilesAdd?.(files);
	}

	function handleFileUpload() {
		fileInputRef?.click();
	}

	function handleFileRemove(fileId: string) {
		const ATT_PREFIX = '__att__';
		if (fileId.startsWith(ATT_PREFIX)) {
			const index = parseInt(fileId.slice(ATT_PREFIX.length), 10);
			if (!isNaN(index) && index >= 0 && index < attachments.length) {
				onAttachmentRemove?.(index);
			}
		} else {
			onUploadedFileRemove?.(fileId);
		}
	}

	/**
	 *
	 *
	 * EVENT HANDLERS - Input & Keyboard
	 *
	 *
	 */

	function getActiveAtToken(
		text: string,
		cursorPos: number
	): { start: number; end: number; query: string } | null {
		if (!text || cursorPos <= 0) return null;

		// First, check if we're in an existing @file("...") pattern
		const prefix = '@file("';
		const tokenStart = text.lastIndexOf(prefix, cursorPos - 1);

		let searchStart = 0;

		if (tokenStart !== -1) {
			const quoteEnd = text.indexOf('"', tokenStart + prefix.length);
			const closingParen = text.indexOf(')', quoteEnd);

			if (quoteEnd !== -1 && closingParen !== -1) {
				const tokenEnd = closingParen + 1;
				if (cursorPos < tokenEnd) {
					return {
						start: tokenStart,
						end: tokenEnd,
						query: text.slice(tokenStart + prefix.length, quoteEnd)
					};
				}
				// Cursor is after a complete @file("...") token
				// Search for bare @ only after this token
				searchStart = tokenEnd;
			}
		}

		// Second, check if we're typing a bare @path (for conversion to new syntax)
		// Find the most recent @ before cursor, starting from searchStart
		const atIndex = text.lastIndexOf('@', cursorPos - 1);
		if (atIndex === -1 || atIndex < searchStart) return null;

		// Make sure there's no whitespace between @ and cursor
		const textBetween = text.slice(atIndex + 1, cursorPos);
		if (/\s/.test(textBetween)) return null;

		// Make sure we're not inside an existing @file("...") that wasn't caught above
		// (e.g., cursor is before the opening quote)
		const afterAt = text.slice(atIndex + 1, atIndex + 6);
		if (afterAt === 'file("') return null;

		// Extract the query (everything after @ up to cursor)
		const query = textBetween;

		return {
			start: atIndex,
			end: cursorPos,
			query
		};
	}

	function flattenFileTree(nodes: FileSystemNode[]): FileSystemNode[] {
		const result: FileSystemNode[] = [];
		const stack = [...nodes];
		while (stack.length > 0) {
			const node = stack.pop()!;
			result.push(node);
			if (node.children) {
				stack.push(...node.children);
			}
		}
		return result;
	}

	function scorePathMatch(node: FileSystemNode, query: string): number {
		const q = query.toLowerCase();
		if (!q) return 50;

		const pathLower = node.path.toLowerCase();
		const nameLower = node.name.toLowerCase();

		if (pathLower === q) return 1000;
		if (nameLower === q) return 900;
		if (pathLower.startsWith(q)) return 500;
		if (nameLower.startsWith(q)) return 400;
		if (pathLower.includes(q)) return 200;
		if (nameLower.includes(q)) return 150;

		let qi = 0;
		for (let i = 0; i < pathLower.length && qi < q.length; i++) {
			if (pathLower[i] === q[qi]) qi++;
		}
		if (qi === q.length) return 50;

		return 0;
	}

	function handleInput() {
		const perChatOverrides = conversationsStore.getAllMcpServerOverrides();
		const hasServers = mcpStore.hasEnabledServers(perChatOverrides);
		const hasResources = mcpStore.hasResourcesCapability(perChatOverrides);

		// Check for /skills trigger first (handles "/skills", "/skills " and "/skills <query>")
		const skillTriggerMatch = value.match(/^\/skills(?:\s(.*))?$/);
		if (skillTriggerMatch !== null) {
			// Show skill picker with search query (empty for "/skills", trimmed query for "/skills <query>")
			skillSearchQuery = skillTriggerMatch[1] ?? '';
			isSkillPickerOpen = true;
			isPromptPickerOpen = false;
			promptSearchQuery = '';
			isInlineResourcePickerOpen = false;
			resourceSearchQuery = '';
			isFilePocketOpen = false;
			filePocketQuery = '';
			return;
		}

		const cursorPos = textareaRef?.getElement()?.selectionStart ?? value.length;
		const token = getActiveAtToken(value, cursorPos);

		if (token) {
			const query = token.query;
			const isAtStart = token.start === 0;
			const isPathLike = query.includes('/');

			if (isPathLike || !isAtStart || !hasServers || !hasResources) {
				filePocketQuery = query;
				filePocketTokenStart = token.start;
				filePocketTokenEnd = token.end;
				isFilePocketOpen = true;
				_filePocketSetIdx = 0;
				isPromptPickerOpen = false;
				promptSearchQuery = '';
				isInlineResourcePickerOpen = false;
				resourceSearchQuery = '';
				isSkillPickerOpen = false;
				skillSearchQuery = '';
				if (!filesystemStore.tree) filesystemStore.load();
			} else {
				isInlineResourcePickerOpen = true;
				resourceSearchQuery = query;
				isPromptPickerOpen = false;
				promptSearchQuery = '';
				isSkillPickerOpen = false;
				skillSearchQuery = '';
				isFilePocketOpen = false;
				filePocketQuery = '';
			}
			return;
		}

		if (value.startsWith(PROMPT_TRIGGER_PREFIX) && hasServers) {
			isPromptPickerOpen = true;
			promptSearchQuery = value.slice(1);
			isInlineResourcePickerOpen = false;
			resourceSearchQuery = '';
			isSkillPickerOpen = false;
			skillSearchQuery = '';
			isFilePocketOpen = false;
			filePocketQuery = '';
			return;
		}

		isPromptPickerOpen = false;
		promptSearchQuery = '';
		isInlineResourcePickerOpen = false;
		resourceSearchQuery = '';
		isSkillPickerOpen = false;
		skillSearchQuery = '';
		isFilePocketOpen = false;
		filePocketQuery = '';
	}

	function handleKeydown(event: KeyboardEvent) {
		if (isFilePocketOpen && filePocketRef?.handleKeydown(event)) {
			return;
		}

		if (isPromptPickerOpen && promptPickerRef?.handleKeydown(event)) {
			return;
		}

		if (isInlineResourcePickerOpen && resourcePickerRef?.handleKeydown(event)) {
			return;
		}

		// Handle skill picker keyboard navigation
		if (isSkillPickerOpen && skillPickerRef?.handleKeydown(event)) {
			return;
		}

		if (event.key === KeyboardKey.ESCAPE && isPromptPickerOpen) {
			isPromptPickerOpen = false;
			promptSearchQuery = '';
			return;
		}

		if (event.key === KeyboardKey.ESCAPE && isInlineResourcePickerOpen) {
			isInlineResourcePickerOpen = false;
			resourceSearchQuery = '';
			return;
		}

		if (event.key === KeyboardKey.ESCAPE && isSkillPickerOpen) {
			isSkillPickerOpen = false;
			skillSearchQuery = '';
			return;
		}

		if (event.key === KeyboardKey.ESCAPE && isFilePocketOpen) {
			isFilePocketOpen = false;
			filePocketQuery = '';
			return;
		}

		if (event.key === KeyboardKey.ENTER && !event.shiftKey && !isIMEComposing(event)) {
			event.preventDefault();

			if (!canSubmit || disabled || isLoading || hasLoadingAttachments) return;

			const mode = event.altKey ? 'steering' : 'followup';
			onSubmit?.(mode);
		}
	}

	function handlePaste(event: ClipboardEvent) {
		if (!event.clipboardData) return;

		const files = Array.from(event.clipboardData.items)
			.filter((item) => item.kind === 'file')
			.map((item) => item.getAsFile())
			.filter((file): file is File => file !== null);

		if (files.length > 0) {
			event.preventDefault();
			onFilesAdd?.(files);
			return;
		}

		const text = event.clipboardData.getData(MimeTypeText.PLAIN);

		if (text.startsWith(CLIPBOARD_CONTENT_QUOTE_PREFIX)) {
			const parsed = parseClipboardContent(text);

			if (parsed.textAttachments.length > 0 || parsed.mcpPromptAttachments.length > 0) {
				event.preventDefault();
				value = parsed.message;
				onValueChange?.(parsed.message);

				// Handle text attachments as files
				if (parsed.textAttachments.length > 0) {
					const attachmentFiles = parsed.textAttachments.map(
						(att) =>
							new File([att.content], att.name, {
								type: MimeTypeText.PLAIN
							})
					);
					onFilesAdd?.(attachmentFiles);
				}

				// Handle MCP prompt attachments as ChatUploadedFile with mcpPrompt data
				if (parsed.mcpPromptAttachments.length > 0) {
					const mcpPromptFiles: ChatUploadedFile[] = parsed.mcpPromptAttachments.map((att) => ({
						id: uuid(),
						name: att.name,
						size: att.content.length,
						type: SpecialFileType.MCP_PROMPT,
						file: new File([att.content], `${att.name}${FileExtensionText.TXT}`, {
							type: MimeTypeText.PLAIN
						}),
						isLoading: false,
						textContent: att.content,
						mcpPrompt: {
							serverName: att.serverName,
							promptName: att.promptName,
							arguments: att.arguments
						}
					}));

					uploadedFiles = [...uploadedFiles, ...mcpPromptFiles];
					onUploadedFilesChange?.(uploadedFiles);
				}

				requestAnimationFrame(() => {
					textareaRef?.focus();
				});

				return;
			}
		}

		if (
			text.length > 0 &&
			pasteLongTextToFileLength > 0 &&
			text.length > pasteLongTextToFileLength
		) {
			event.preventDefault();

			const textFile = new File([text], 'Pasted', {
				type: MimeTypeText.PLAIN
			});

			onFilesAdd?.([textFile]);
		}
	}

	/**
	 *
	 *
	 * EVENT HANDLERS - File Pocket
	 *
	 *
	 */

	function handleFilePocketSelect(path: string) {
		const before = value.slice(0, filePocketTokenStart);
		const after = value.slice(filePocketTokenEnd);

		// Check if this is an old-style @path token (needs conversion)
		const tokenText = value.slice(filePocketTokenStart, filePocketTokenEnd);
		const isNewSyntax = tokenText.startsWith('@file("');

		if (isNewSyntax) {
			value = `${before}@file("${path}")${after}`;
		} else {
			// Convert old @path to new @file("path") syntax
			value = `${before}@file("${path}")${after}`;
		}
		onValueChange?.(value);

		isFilePocketOpen = false;
		filePocketQuery = '';

		const pos = filePocketTokenStart + `@file("${path}")`.length;
		requestAnimationFrame(() => {
			const el = textareaRef?.getElement();
			if (el) {
				el.selectionStart = el.selectionEnd = pos;
				el.focus();
			}
		});
	}

	function handleFilePocketClose() {
		isFilePocketOpen = false;
		filePocketQuery = '';
		textareaRef?.focus();
	}

	/**
	 *
	 *
	 * EVENT HANDLERS - Prompt Picker
	 *
	 *
	 */

	function handlePromptLoadStart(
		placeholderId: string,
		promptInfo: MCPPromptInfo,
		args?: Record<string, string>
	) {
		// Only clear the value if the prompt was triggered by typing '/'
		if (value.startsWith(PROMPT_TRIGGER_PREFIX)) {
			value = '';
			onValueChange?.('');
		}
		isPromptPickerOpen = false;
		promptSearchQuery = '';

		const promptName = promptInfo.title || promptInfo.name;
		const placeholder: ChatUploadedFile = {
			id: placeholderId,
			name: promptName,
			size: INITIAL_FILE_SIZE,
			type: SpecialFileType.MCP_PROMPT,
			file: new File([], 'loading'),
			isLoading: true,
			mcpPrompt: {
				serverName: promptInfo.serverName,
				promptName: promptInfo.name,
				arguments: args ? { ...args } : undefined
			}
		};

		uploadedFiles = [...uploadedFiles, placeholder];
		onUploadedFilesChange?.(uploadedFiles);
		textareaRef?.focus();
	}

	function handlePromptLoadComplete(placeholderId: string, result: GetPromptResult) {
		const promptText = result.messages
			?.map((msg: PromptMessage) => {
				if (typeof msg.content === 'string') {
					return msg.content;
				}

				if (msg.content.type === ContentPartType.TEXT) {
					return msg.content.text;
				}

				return '';
			})
			.filter(Boolean)
			.join(PROMPT_CONTENT_SEPARATOR);

		uploadedFiles = uploadedFiles.map((f) =>
			f.id === placeholderId
				? {
						...f,
						isLoading: false,
						textContent: promptText,
						size: promptText.length,
						file: new File([promptText], `${f.name}${FileExtensionText.TXT}`, {
							type: MimeTypeText.PLAIN
						})
					}
				: f
		);
		onUploadedFilesChange?.(uploadedFiles);
	}

	function handlePromptLoadError(placeholderId: string, error: string) {
		uploadedFiles = uploadedFiles.map((f) =>
			f.id === placeholderId ? { ...f, isLoading: false, loadError: error } : f
		);
		onUploadedFilesChange?.(uploadedFiles);
	}

	function handlePromptPickerClose() {
		isPromptPickerOpen = false;
		promptSearchQuery = '';
		textareaRef?.focus();
	}

	/**
	 *
	 *
	 * EVENT HANDLERS - Skill Picker
	 *
	 *
	 */

	function handleSkillSelect(skill: SkillDefinition) {
		// Write the clean shorthand into the textarea; content expands at send time
		const display = `/skills ${skill.name}`;
		value = display;
		onValueChange?.(display);
		isSkillPickerOpen = false;
		skillSearchQuery = '';
		textareaRef?.focus();
	}

	function handleSkillPickerClose() {
		isSkillPickerOpen = false;
		skillSearchQuery = '';
		textareaRef?.focus();
	}

	/**
	 *
	 *
	 * EVENT HANDLERS - Inline Resource Picker
	 *
	 *
	 */

	function handleInlineResourcePickerClose() {
		isInlineResourcePickerOpen = false;
		resourceSearchQuery = '';
		textareaRef?.focus();
	}

	function handleInlineResourceSelect() {
		// Clear the @query from input after resource is attached
		if (value.startsWith(RESOURCE_TRIGGER_PREFIX)) {
			value = '';
			onValueChange?.('');
		}

		isInlineResourcePickerOpen = false;
		resourceSearchQuery = '';
		textareaRef?.focus();
	}

	function handleBrowseResources() {
		isInlineResourcePickerOpen = false;
		resourceSearchQuery = '';

		if (value.startsWith(RESOURCE_TRIGGER_PREFIX)) {
			value = '';
			onValueChange?.('');
		}

		isResourceDialogOpen = true;
	}

	/**
	 *
	 *
	 * EVENT HANDLERS - Audio Recording
	 *
	 *
	 */

	async function handleMicClick() {
		if (!audioRecorder || !recordingSupported) {
			console.warn('Audio recording not supported');
			return;
		}

		if (isRecording) {
			isRecording = false;
			try {
				const audioBlob = await audioRecorder.stopRecording();
				const wavBlob = await convertToWav(audioBlob);
				const audioFile = createAudioFile(wavBlob);

				onFilesAdd?.([audioFile]);
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Unknown error';
				toast.error(`Failed to stop recording: ${message}`);
				console.error('Failed to stop recording:', error);
			}
		} else {
			try {
				await audioRecorder.startRecording();
				isRecording = true;
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Unknown error';
				toast.error(`Microphone access failed: ${message}`);
				console.error('Failed to start recording:', error);
			}
		}
	}
</script>

<ChatFormFileInputInvisible bind:this={fileInputRef} onFileSelect={handleFileSelect} />

<form
	class="relative {className}"
	onsubmit={(e) => {
		e.preventDefault();
		if (!canSubmit || disabled || isLoading || hasLoadingAttachments) return;
		onSubmit?.('followup');
	}}
>
	<ChatFormPromptPicker
		bind:this={promptPickerRef}
		isOpen={isPromptPickerOpen}
		searchQuery={promptSearchQuery}
		onClose={handlePromptPickerClose}
		onPromptLoadStart={handlePromptLoadStart}
		onPromptLoadComplete={handlePromptLoadComplete}
		onPromptLoadError={handlePromptLoadError}
	/>

	<ChatFormResourcePicker
		bind:this={resourcePickerRef}
		isOpen={isInlineResourcePickerOpen}
		searchQuery={resourceSearchQuery}
		onClose={handleInlineResourcePickerClose}
		onResourceSelect={handleInlineResourceSelect}
		onBrowse={handleBrowseResources}
	/>

	<ChatFormSkillPicker
		bind:this={skillPickerRef}
		isOpen={isSkillPickerOpen}
		searchQuery={skillSearchQuery}
		onSkillSelect={handleSkillSelect}
		onClose={handleSkillPickerClose}
	/>

	<FilePocket
		bind:this={filePocketRef}
		isOpen={isFilePocketOpen}
		items={filePocketItems}
		query={filePocketQuery}
		isLoading={filesystemStore.loading}
		onSelect={handleFilePocketSelect}
		onClose={handleFilePocketClose}
	/>

	<div
		class="{INPUT_CLASSES} rounded-3xl backdrop-blur-md {disabled
			? 'cursor-not-allowed opacity-60'
			: ''}"
		data-slot="input-area"
	>
		<ChatAttachmentsList
			{attachments}
			bind:uploadedFiles
			onFileRemove={handleFileRemove}
			limitToSingleRow
			class="py-5"
			style="scroll-padding: 1rem;"
			activeModelId={activeModelId ?? undefined}
		/>

		<TodoPocket convId={conversationsStore.activeConversation?.id ?? ''} open={isTodoPocketOpen} />

		<div
			class="relative flex flex-col items-center rounded-3xl py-2 pb-2.5 shadow-sm transition-shadow duration-150 focus-within:shadow-md md:!py-3"
		>
			<ChatFormTextarea
				class="px-5 py-1.5 md:pt-0	"
				bind:this={textareaRef}
				bind:value
				onKeydown={handleKeydown}
				onPaste={handlePaste}
				onInput={() => {
					handleInput();
					onValueChange?.(value);
				}}
				{disabled}
				placeholder={displayPlaceholder}
			/>

			{#if mcpHasResourceAttachments()}
				<ChatAttachmentMcpResources
					class="mb-3"
					onResourceClick={(uri) => {
						preSelectedResourceUri = uri;
						isResourceDialogOpen = true;
					}}
				/>
			{/if}

			<ChatFormActions
				class="px-3"
				bind:this={chatFormActionsRef}
				canSend={canSubmit}
				hasText={value.trim().length > 0}
				{disabled}
				{hasLoadingAttachments}
				{isLoading}
				{isRecording}
				{uploadedFiles}
				onFileUpload={handleFileUpload}
				onMicClick={handleMicClick}
				{onStop}
				onSystemPromptClick={() => onSystemPromptClick?.({ message: value, files: uploadedFiles })}
				onMcpPromptClick={showMcpPromptButton ? () => (isPromptPickerOpen = true) : undefined}
				onMcpResourcesClick={() => (isResourceDialogOpen = true)}
				onTodoPocketToggle={() => (isTodoPocketOpen = !isTodoPocketOpen)}
			/>
		</div>
	</div>
</form>

<DialogMcpResources
	bind:open={isResourceDialogOpen}
	preSelectedUri={preSelectedResourceUri}
	onAttach={(resource: MCPResourceInfo) => {
		mcpStore.attachResource(resource.uri);
	}}
	onOpenChange={(newOpen: boolean) => {
		if (!newOpen) {
			preSelectedResourceUri = undefined;
		}
	}}
/>
