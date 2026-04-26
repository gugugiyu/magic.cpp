<script lang="ts">
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
	import { presetsStore } from '$lib/stores/presets.svelte';
	import { builtinToolFields } from '$lib/enums/builtin-tools';
	import { PresetCard } from '$lib/components/app';
	import {
		Sparkles,
		Plus,
		Search,
		Loader2,
		X,
		FileText,
		ArrowUpDown,
		RefreshCw
	} from '@lucide/svelte';
	import { fade } from 'svelte/transition';
	import { SvelteSet } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';
	import type { PresetView, PresetInput } from '@shared/types/presets';

	// View modes
	let searchQuery = $state('');
	let showNewModal = $state(false);

	// New/Edit modal state
	let editingPreset = $state<PresetView | null>(null);
	let formName = $state('');
	let formSystemPrompt = $state('');
	let formEnabledTools = new SvelteSet<string>();
	let formCommonPrompts = $state<string[]>([]);
	let isSaving = $state(false);

	// Delete confirmation
	let deletingPreset = $state<PresetView | null>(null);

	// In-progress feedback for async card operations
	let busyPresetId = $state<string | null>(null);

	// Sort mode
	type SortMode = 'default' | 'nameAsc';
	let sortMode = $state<SortMode>('default');

	// Mobile search collapse
	let searchExpanded = $state(false);

	const sortLabels: Record<SortMode, string> = {
		default: 'Default',
		nameAsc: 'Name (A-Z)'
	};

	// Loading state
	let isLoading = $derived(presetsStore.isLoading);

	// Load presets on mount (with TTL caching)
	let hasLoadedForSession = $state(false);

	$effect(() => {
		if (hasLoadedForSession) return;
		void presetsStore.loadPresetsIfStale(30_000).then(() => {
			hasLoadedForSession = true;
		});
	});

	// Filtered and sorted presets
	const filteredPresets = $derived.by(() => {
		const query = searchQuery.toLowerCase();
		let result = presetsStore.presets.filter(
			(p) => p.name.toLowerCase().includes(query) || p.systemPrompt.toLowerCase().includes(query)
		);

		if (sortMode === 'nameAsc') {
			result.sort((a, b) => a.name.localeCompare(b.name));
		}

		return result;
	});

	// ─── Modal helpers ─────────────────────────────────────────────────

	function openNewModal() {
		editingPreset = null;
		formName = '';
		formSystemPrompt = '';
		formEnabledTools = new SvelteSet();
		formCommonPrompts = [];
		showNewModal = true;
	}

	function openEditModal(preset: PresetView) {
		editingPreset = preset;
		formName = preset.name;
		formSystemPrompt = preset.systemPrompt;
		formEnabledTools = new SvelteSet(preset.enabledTools);
		formCommonPrompts = [...preset.commonPrompts];
		showNewModal = true;
	}

	function closeModal() {
		showNewModal = false;
		editingPreset = null;
	}

	function validateForm(): boolean {
		if (!formName.trim()) {
			toast.error('Name is required');
			return false;
		}
		return true;
	}

	function buildInput(): PresetInput {
		return {
			name: formName.trim(),
			systemPrompt: formSystemPrompt.trim(),
			enabledTools: Array.from(formEnabledTools),
			commonPrompts: formCommonPrompts.filter((p) => p.trim().length > 0)
		};
	}

	async function handleSave() {
		if (!validateForm()) return;

		isSaving = true;
		try {
			const input = buildInput();
			if (editingPreset) {
				await presetsStore.updatePreset(editingPreset.id, input);
				toast.success(`Preset "${input.name}" updated`);
			} else {
				await presetsStore.createPreset(input);
				toast.success(`Preset "${input.name}" created`);
			}
			closeModal();
		} catch (err) {
			toast.error(`Failed to save: ${(err as Error).message}`);
		} finally {
			isSaving = false;
		}
	}

	// ─── Delete ────────────────────────────────────────────────────────

	function confirmDelete(preset: PresetView) {
		deletingPreset = preset;
	}

	async function handleDelete() {
		if (!deletingPreset) return;

		const presetToDelete = deletingPreset;
		deletingPreset = null;
		busyPresetId = presetToDelete.id;
		try {
			await presetsStore.deletePreset(presetToDelete.id);
			toast.success(`Preset "${presetToDelete.name}" deleted`);
		} catch (err) {
			toast.error(`Failed to delete: ${(err as Error).message}`);
		} finally {
			busyPresetId = null;
		}
	}

	// ─── Duplicate ─────────────────────────────────────────────────────

	function generateDuplicateName(baseName: string, existingNames: Set<string>): string {
		let candidate = `${baseName} (copy)`;
		let suffix = 2;
		while (existingNames.has(candidate)) {
			candidate = `${baseName} (copy ${suffix})`;
			suffix++;
		}
		return candidate;
	}

	async function handleDuplicate(preset: PresetView) {
		const existingNames = new Set(presetsStore.presets.map((p) => p.name));
		const newName = generateDuplicateName(preset.name, existingNames);
		busyPresetId = preset.id;
		try {
			await presetsStore.createPreset({
				name: newName,
				systemPrompt: preset.systemPrompt,
				enabledTools: [...preset.enabledTools],
				commonPrompts: [...preset.commonPrompts]
			});
			toast.success(`Preset duplicated as "${newName}"`);
		} catch (err) {
			toast.error(`Failed to duplicate: ${(err as Error).message}`);
		} finally {
			busyPresetId = null;
		}
	}

	// ─── Common prompts helpers ────────────────────────────────────────

	function addCommonPrompt() {
		formCommonPrompts = [...formCommonPrompts, ''];
	}

	function removeCommonPrompt(index: number) {
		formCommonPrompts = formCommonPrompts.filter((_, i) => i !== index);
	}

	function updateCommonPrompt(index: number, value: string) {
		formCommonPrompts = formCommonPrompts.map((p, i) => (i === index ? value : p));
	}

	// ─── Activation ────────────────────────────────────────────────────

	function handleActivate(preset: PresetView) {
		presetsStore.applyPreset(preset.id);
		toast.success(`Preset "${preset.name}" activated`);
	}

	function handleDeactivate() {
		presetsStore.clearActivePreset();
		toast.success('Preset deactivated');
	}
</script>

<div class="flex h-full flex-col gap-0">
	<!-- Header -->
	<div class="grid gap-2 border-b border-border/30 p-4 md:p-6">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-2">
				<Sparkles class="h-5 w-5" />
				<h2 class="text-lg font-semibold">Presets</h2>
			</div>

			<div class="flex items-center gap-2">
				<Badge variant="tertiary">{presetsStore.presets.length} total</Badge>
			</div>
		</div>

		<p class="text-sm text-muted-foreground">
			Create and manage persona presets with system prompts, tools, and reusable common prompts.
		</p>
	</div>

	<!-- Toolbar -->
	<div
		class="flex min-h-[3.25rem] items-center gap-3 overflow-x-auto overflow-y-hidden border-b border-border/30 p-3 md:px-6"
	>
		<!-- Search (collapsible on mobile) -->
		<div class="relative flex h-9 shrink-0 items-center">
			<div class="flex items-center gap-2 {searchExpanded ? 'flex' : 'hidden'} md:flex">
				<div class="relative w-[200px] shrink-0 sm:w-[250px]">
					<Search class="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
					<Input bind:value={searchQuery} placeholder="Search presets..." class="pl-8" />
					{#if searchQuery}
						<button
							type="button"
							class="absolute top-2.5 right-2.5 rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
							aria-label="Clear search"
							onclick={() => (searchQuery = '')}
						>
							<X class="h-4 w-4" />
						</button>
					{/if}
				</div>
				<button
					type="button"
					class="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:text-foreground md:hidden"
					aria-label="Close search"
					onclick={() => (searchExpanded = false)}
				>
					<X class="h-4 w-4" />
				</button>
			</div>
			<button
				type="button"
				class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:text-foreground md:hidden {searchExpanded
					? 'hidden'
					: 'flex'}"
				aria-label="Toggle search"
				onclick={() => (searchExpanded = true)}
			>
				<Search class="h-4 w-4" />
			</button>
		</div>

		<!-- Sort controls -->
		<Select
			type="single"
			value={sortMode}
			onValueChange={(v) => {
				if (v) sortMode = v as SortMode;
			}}
		>
			<SelectTrigger class="w-[160px]" aria-label="Sort presets">
				<ArrowUpDown class="mr-2 h-4 w-4" />
				<span>{sortLabels[sortMode]}</span>
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="default">Default</SelectItem>
				<SelectItem value="nameAsc">Name (A-Z)</SelectItem>
			</SelectContent>
		</Select>

		<Button
			size="sm"
			onclick={() => {
				openNewModal();
			}}
		>
			<Plus class="mr-1.5 h-4 w-4" />
			New
		</Button>

		<Button
			size="sm"
			class="hover:text-foreground"
			variant="ghost"
			onclick={() => void presetsStore.loadPresets()}
			title="Refresh presets"
		>
			<RefreshCw class="h-4 w-4" />
		</Button>
	</div>

	<!-- Content Area -->
	<ScrollArea class="flex-1">
		<div class="p-4 md:p-6">
			{#if isLoading}
				<div class="flex flex-col items-center justify-center py-8 text-muted-foreground">
					<Loader2 class="mb-3 h-6 w-6 animate-spin" />
					<p class="mb-4 text-sm">Fetching presets from server…</p>
					<!-- Skeleton cards -->
					<div class="grid w-full grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
						{#each Array.from({ length: 6 }, (_, i) => i) as i (i)}
							<div
								class="flex animate-pulse flex-col rounded-lg border border-border/40 bg-card/60 p-4"
							>
								<div class="mb-3 h-4 w-2/3 rounded bg-muted"></div>
								<div class="mb-4 h-3 w-full rounded bg-muted"></div>
								<div class="mt-auto flex items-center gap-1.5">
									<div class="h-4 w-16 rounded-full bg-muted"></div>
									<div class="h-4 w-12 rounded-full bg-muted"></div>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{:else if presetsStore.error}
				<!-- Error State -->
				<div class="flex flex-col items-center justify-center py-12">
					<div
						class="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-center"
					>
						<p class="mb-2 text-sm font-medium text-destructive">Failed to load presets</p>
						<p class="text-xs text-muted-foreground">Last fetch failed — try again</p>
						<p class="mt-1 text-xs text-muted-foreground">{presetsStore.error}</p>
					</div>
					<Button
						size="sm"
						onclick={() => {
							void presetsStore.loadPresets();
						}}
					>
						<Loader2 class="mr-1.5 h-4 w-4" />
						Retry
					</Button>
				</div>
			{:else if filteredPresets.length === 0}
				<!-- Empty State -->
				<div
					in:fade={{ duration: 120 }}
					class="flex flex-col items-center justify-center py-12 text-muted-foreground"
				>
					<FileText class="mb-3 h-10 w-10 opacity-50" />
					<p class="mb-1 text-sm font-medium">
						{searchQuery ? 'No presets match your search' : 'No presets yet'}
					</p>
					<p class="mb-4 text-xs">
						{searchQuery
							? 'Try a different search term'
							: 'Create a preset to bundle a system prompt, tools, and reusable prompts'}
					</p>
					<Button size="sm" onclick={() => openNewModal()}>
						<Plus class="mr-1.5 h-4 w-4" />
						Create your first preset
					</Button>
				</div>
			{:else}
				<!-- Preset Cards Grid -->
				<div
					in:fade={{ duration: 150 }}
					class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
				>
					{#each filteredPresets as preset (preset.id)}
						<PresetCard
							{preset}
							isActive={presetsStore.activePresetId === preset.id}
							isOperating={busyPresetId === preset.id}
							onEdit={() => openEditModal(preset)}
							onDelete={() => confirmDelete(preset)}
							onDuplicate={() => handleDuplicate(preset)}
							onActivate={() => handleActivate(preset)}
							onDeactivate={handleDeactivate}
						/>
					{/each}
				</div>
			{/if}
		</div>
	</ScrollArea>
</div>

<!-- Delete Confirmation Dialog -->
<AlertDialog.Root
	open={deletingPreset !== null}
	onOpenChange={(open) => {
		if (!open) deletingPreset = null;
	}}
>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete Preset</AlertDialog.Title>
			<AlertDialog.Description>
				Are you sure you want to delete "{deletingPreset?.name}"? This action cannot be undone.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action
				onclick={handleDelete}
				class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
			>
				Delete
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<!-- New/Edit Preset Modal -->
{#if showNewModal}
	<Dialog.Root open={showNewModal} onOpenChange={(open) => !open && closeModal()}>
		<Dialog.Content class="max-w-2xl" showCloseButton={false}>
			<h2 class="text-lg font-semibold">
				{editingPreset ? 'Edit Preset' : 'New Preset'}
			</h2>

			<div class="mt-4 space-y-4">
				<div>
					<Label for="preset-name" class="mb-1 block text-sm font-medium">Name</Label>
					<Input id="preset-name" bind:value={formName} placeholder="e.g., Code Reviewer" />
				</div>

				<div>
					<Label for="preset-system-prompt" class="mb-1 block text-sm font-medium">
						System Prompt
					</Label>
					<Textarea
						id="preset-system-prompt"
						bind:value={formSystemPrompt}
						placeholder="Enter the system prompt for this persona..."
						class="min-h-[8rem]"
					/>
				</div>

				<!-- Tools Section -->
				<div class="space-y-3">
					<h4 class="text-sm font-semibold">Assigned Tools</h4>
					<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
						{#each builtinToolFields as tool (tool.key)}
							<div class="flex items-start space-x-3">
								<Checkbox
									id={`tool-${tool.key}`}
									checked={formEnabledTools.has(tool.key)}
									onCheckedChange={(checked) => {
										if (checked) {
											formEnabledTools.add(tool.key);
										} else {
											formEnabledTools.delete(tool.key);
										}
									}}
									class="mt-1"
								/>
								<div class="space-y-1">
									<Label
										for={`tool-${tool.key}`}
										class="flex cursor-pointer items-center gap-1.5 pt-1 pb-0.5 text-sm leading-none font-medium"
									>
										{tool.label}
									</Label>
									{#if tool.description}
										<p class="text-xs text-muted-foreground">{tool.description}</p>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>

				<!-- Common Prompts Section -->
				<div class="space-y-3">
					<div class="flex items-center justify-between">
						<h4 class="text-sm font-semibold">Common Prompts</h4>
						<Button size="sm" variant="outline" onclick={addCommonPrompt}>
							<Plus class="mr-1.5 h-3.5 w-3.5" />
							Add
						</Button>
					</div>
					{#if formCommonPrompts.length === 0}
						<p class="text-xs text-muted-foreground">
							No common prompts yet. Click "Add" to create one.
						</p>
					{:else}
						<div class="space-y-2">
							{#each formCommonPrompts as prompt, i (i)}
								<div class="flex items-center gap-2">
									<Input
										value={prompt}
										oninput={(e) => updateCommonPrompt(i, e.currentTarget.value)}
										placeholder="Enter a reusable prompt..."
									/>
									<button
										type="button"
										class="rounded p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
										onclick={() => removeCommonPrompt(i)}
										aria-label="Remove prompt"
									>
										<X class="h-4 w-4" />
									</button>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>

			<div class="mt-6 flex justify-end gap-2">
				<Button variant="ghost" onclick={closeModal}>Cancel</Button>
				<Button onclick={handleSave} disabled={isSaving || !formName.trim()}>
					{#if isSaving}
						<Loader2 class="mr-1.5 h-4 w-4 animate-spin" />
					{/if}
					{editingPreset ? 'Save Changes' : 'Create Preset'}
				</Button>
			</div>
		</Dialog.Content>
	</Dialog.Root>
{/if}
