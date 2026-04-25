<script lang="ts">
	import { Download, Upload, Trash2 } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { DialogConversationSelection, DialogConfirmation } from '$lib/components/app';
	import { createMessageCountMap } from '$lib/utils';
	import { conversationsStore, conversations } from '$lib/stores/conversations.svelte';
	import { toast } from 'svelte-sonner';

	let exportedConversations = $state<DatabaseConversation[]>([]);
	let importedConversations = $state<DatabaseConversation[]>([]);
	let showExportSummary = $state(false);
	let showImportSummary = $state(false);

	let showImportDialog = $state(false);
	let availableConversations = $state<DatabaseConversation[]>([]);
	let messageCountMap = $state<Map<string, number>>(new Map());
	let fullImportData = $state<Array<{ conv: DatabaseConversation; messages: DatabaseMessage[] }>>(
		[]
	);

	// Export limit state
	let exportLimit = $state<string>('');
	let isExporting = $state(false);

	// Delete functionality state
	let showDeleteDialog = $state(false);
	let deleteWithForks = $state(true);

	async function handleExportClick() {
		try {
			const allConversations = conversations();
			if (allConversations.length === 0) {
				toast.info('No conversations to export');
				return;
			}

			isExporting = true;
			const limit = exportLimit ? parseInt(exportLimit, 10) : undefined;
			await conversationsStore.exportAllConversations(limit);

			const count =
				limit && limit > 0 ? Math.min(limit, allConversations.length) : allConversations.length;
			exportedConversations = allConversations.slice(0, count);
			showExportSummary = true;
			showImportSummary = false;
		} catch (err) {
			console.error('Failed to export conversations:', err);
			toast.error('Failed to export conversations');
		} finally {
			isExporting = false;
		}
	}

	async function handleImportClick() {
		try {
			const input = document.createElement('input');

			input.type = 'file';
			input.accept = '.json';

			input.onchange = async (e) => {
				const file = (e.target as HTMLInputElement)?.files?.[0];
				if (!file) return;

				try {
					const text = await file.text();
					const parsedData = JSON.parse(text);
					let importedData: ExportedConversations;

					if (Array.isArray(parsedData)) {
						importedData = parsedData;
					} else if (
						parsedData &&
						typeof parsedData === 'object' &&
						'conv' in parsedData &&
						'messages' in parsedData
					) {
						// Single conversation object
						importedData = [parsedData];
					} else {
						throw new Error(
							'Invalid file format: expected array of conversations or single conversation object'
						);
					}

					fullImportData = importedData;
					availableConversations = importedData.map(
						(item: { conv: DatabaseConversation; messages: DatabaseMessage[] }) => item.conv
					);
					messageCountMap = createMessageCountMap(importedData);
					showImportDialog = true;
				} catch (err: unknown) {
					const message = err instanceof Error ? err.message : 'Unknown error';

					console.error('Failed to parse file:', err);
					alert(`Failed to parse file: ${message}`);
				}
			};

			input.click();
		} catch (err) {
			console.error('Import failed:', err);
			alert('Failed to import conversations');
		}
	}

	async function handleImportConfirm(selectedConversations: DatabaseConversation[]) {
		try {
			const selectedIds = new Set(selectedConversations.map((c) => c.id));
			const selectedData = $state
				.snapshot(fullImportData)
				.filter((item) => selectedIds.has(item.conv.id));

			await conversationsStore.importConversationsData(selectedData);

			importedConversations = selectedConversations;
			showImportSummary = true;
			showExportSummary = false;
			showImportDialog = false;
		} catch (err) {
			console.error('Import failed:', err);
			alert('Failed to import conversations. Please check the file format.');
		}
	}

	async function handleDeleteAllClick() {
		try {
			const allConversations = conversations();

			if (allConversations.length === 0) {
				toast.info('No conversations to delete');
				return;
			}

			showDeleteDialog = true;
		} catch (err) {
			console.error('Failed to load conversations for deletion:', err);
			toast.error('Failed to load conversations');
		}
	}

	async function handleDeleteAllConfirm() {
		try {
			await conversationsStore.deleteAll(deleteWithForks);

			showDeleteDialog = false;
		} catch (err) {
			console.error('Failed to delete conversations:', err);
		}
	}

	function handleDeleteAllCancel() {
		showDeleteDialog = false;
	}
</script>

<div class="space-y-6">
	<div class="space-y-4">
		<div class="grid">
			<h4 class="mb-2 text-sm font-medium">Export Conversations</h4>

			<p class="mb-4 text-sm text-muted-foreground">
				Download all your conversations as a JSON file. This includes all messages, attachments, and
				conversation history.
			</p>

			<div class="flex flex-col gap-2 md:flex-row md:items-end">
				<div class="flex-1">
					<label class="mb-1 block text-xs text-muted-foreground" for="export-limit">
						Number of conversations (leave empty for all)
					</label>
					<Input
						id="export-limit"
						type="number"
						min="1"
						placeholder="All"
						bind:value={exportLimit}
						class="w-full md:w-32"
					/>
				</div>

				<Button
					class="justify-start justify-self-start md:w-auto"
					onclick={handleExportClick}
					variant="outline"
					disabled={isExporting}
				>
					<Download class="mr-2 h-4 w-4" />
					{isExporting ? 'Exporting...' : 'Export conversations'}
				</Button>
			</div>

			{#if showExportSummary && exportedConversations.length > 0}
				<div class="mt-4 grid overflow-x-auto rounded-lg border border-border/50 bg-muted/30 p-4">
					<h5 class="mb-2 text-sm font-medium">
						Exported {exportedConversations.length} conversation{exportedConversations.length === 1
							? ''
							: 's'}
					</h5>

					<ul class="space-y-1 text-sm text-muted-foreground">
						{#each exportedConversations.slice(0, 10) as conv (conv.id)}
							<li class="truncate">• {conv.name || 'Untitled conversation'}</li>
						{/each}

						{#if exportedConversations.length > 10}
							<li class="italic">
								... and {exportedConversations.length - 10} more
							</li>
						{/if}
					</ul>
				</div>
			{/if}
		</div>

		<div class="grid border-t border-border/30 pt-4">
			<h4 class="mb-2 text-sm font-medium">Import Conversations</h4>

			<p class="mb-4 text-sm text-muted-foreground">
				Import one or more conversations from a previously exported JSON file. This will merge with
				your existing conversations.
			</p>

			<Button
				class="w-full justify-start justify-self-start md:w-auto"
				onclick={handleImportClick}
				variant="outline"
			>
				<Upload class="mr-2 h-4 w-4" />
				Import conversations
			</Button>

			{#if showImportSummary && importedConversations.length > 0}
				<div class="mt-4 grid overflow-x-auto rounded-lg border border-border/50 bg-muted/30 p-4">
					<h5 class="mb-2 text-sm font-medium">
						Imported {importedConversations.length} conversation{importedConversations.length === 1
							? ''
							: 's'}
					</h5>

					<ul class="space-y-1 text-sm text-muted-foreground">
						{#each importedConversations.slice(0, 10) as conv (conv.id)}
							<li class="truncate">• {conv.name || 'Untitled conversation'}</li>
						{/each}

						{#if importedConversations.length > 10}
							<li class="italic">
								... and {importedConversations.length - 10} more
							</li>
						{/if}
					</ul>
				</div>
			{/if}
		</div>

		<div class="grid border-t border-border/30 pt-4">
			<h4 class="mb-2 text-sm font-medium text-destructive">Delete All Conversations</h4>

			<p class="mb-4 text-sm text-muted-foreground">
				Permanently delete all conversations and their messages. This action cannot be undone.
				Consider exporting your conversations first if you want to keep a backup.
			</p>

			<Button
				class="w-full justify-start justify-self-start bg-destructive text-destructive-foreground hover:bg-destructive/80 md:w-auto"
				onclick={handleDeleteAllClick}
				variant="destructive"
			>
				<Trash2 class="mr-2 h-4 w-4" />

				Delete all conversations
			</Button>
		</div>
	</div>
</div>

<DialogConversationSelection
	conversations={availableConversations}
	{messageCountMap}
	mode="import"
	bind:open={showImportDialog}
	onCancel={() => (showImportDialog = false)}
	onConfirm={handleImportConfirm}
/>

<DialogConfirmation
	bind:open={showDeleteDialog}
	title="Delete all conversations"
	description={`Are you sure you want to delete all conversations${deleteWithForks ? ' including all forked conversations' : ''}? This action cannot be undone and will permanently remove all your conversations and messages.`}
	confirmText="Delete All"
	cancelText="Cancel"
	variant="destructive"
	icon={Trash2}
	onConfirm={handleDeleteAllConfirm}
	onCancel={handleDeleteAllCancel}
>
	<!-- {#snippet children()}
		<label class="mt-4 flex items-center gap-2 text-sm">
			<input
				type="checkbox"
				bind:checked={deleteWithForks}
				class="rounded border-border accent-destructive"
			/>
			<span class="text-muted-foreground">Also delete forked conversations</span>
		</label>
	{/snippet} -->
</DialogConfirmation>
