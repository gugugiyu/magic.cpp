<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
	import { SkillCard } from '$lib/components/app';
	import { MarkdownContent } from '$lib/components/app';
	import { skillsStore } from '$lib/stores/skills.svelte';
	import { skillHasArguments } from '$lib/services/skill-utils';
	import { Wrench, Plus, Upload, Search, Loader2, X, FileText, Eye, ArrowUpDown } from '@lucide/svelte';
	import { fade, slide } from 'svelte/transition';
	import { toast } from 'svelte-sonner';
	import type { SkillDefinition } from '@shared/types/skills';
	import { sanitizeSkillName } from '@shared/constants/skills';

	interface Props {
		onOpenChange?: (open: boolean) => void;
		open?: boolean;
	}

	let { onOpenChange, open = $bindable(false) }: Props = $props();

	// View modes
	let searchQuery = $state('');
	let showImportModal = $state(false);
	let showNewModal = $state(false);
	let importContent = $state('');
	let importName = $state('');
	let isImporting = $state(false);
	let importFileInput: HTMLInputElement | null = $state(null);

	// Edit mode
	let editingSkill = $state<SkillDefinition | null>(null);
	let editContent = $state('');

	// Preview mode
	let previewingSkill = $state<SkillDefinition | null>(null);

	// Delete confirmation
	let deletingSkill = $state<SkillDefinition | null>(null);

	// Sort mode
	type SortMode = 'recentlyModified' | 'nameAsc' | 'enabledName';
	let sortMode = $state<SortMode>('recentlyModified');

	const sortLabels: Record<SortMode, string> = {
		recentlyModified: 'Recently Modified',
		nameAsc: 'Name (A-Z)',
		enabledName: 'Enabled, then Name'
	};

	// TTL caching for skill loads
	const SKILL_CACHE_TTL_MS = 30_000; // 30 seconds
	let lastLoadTime = $state<number>(0);

	// Loading state
	let isLoading = $derived(skillsStore.isLoading);

	// Load skills when dialog opens (with TTL caching)
	// Uses a flag to avoid reactive re-triggers from skillsStore.skills changes
	let hasLoadedForSession = $state(false);
	$effect(() => {
		if (!open) {
			hasLoadedForSession = false;
			return;
		}
		if (hasLoadedForSession) return;

		const now = Date.now();
		const isStale = now - lastLoadTime > SKILL_CACHE_TTL_MS;
		const isEmpty = skillsStore.skills.length === 0;

		if (isStale || isEmpty) {
			void skillsStore.loadSkills().then(() => {
				lastLoadTime = Date.now();
				hasLoadedForSession = true;
			});
		} else {
			hasLoadedForSession = true;
		}
	});

	function handleClose() {
		onOpenChange?.(false);
		// Reset state on close
		searchQuery = '';
		showImportModal = false;
		showNewModal = false;
		editingSkill = null;
		previewingSkill = null;
		importContent = '';
		importName = '';
	}

	// Filtered and sorted skills
	const filteredSkills = $derived(() => {
		let result = skillsStore.skills.filter(
			(s) =>
				s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
				s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
				s.description.toLowerCase().includes(searchQuery.toLowerCase())
		);

		// Get lastModified from the store's internal data (sorted by backend as recently modified)
		if (sortMode === 'nameAsc') {
			result.sort((a, b) => a.title.localeCompare(b.title));
		} else if (sortMode === 'enabledName') {
			result.sort((a, b) => {
				const aEnabled = skillsStore.isSkillEnabled(a.name);
				const bEnabled = skillsStore.isSkillEnabled(b.name);
				if (aEnabled !== bEnabled) return aEnabled ? -1 : 1;
				return a.title.localeCompare(b.title);
			});
		}
		// 'recentlyModified' uses backend order (already sorted newest first)

		return result;
	});

	// ─── Import ────────────────────────────────────────────────────────

	let isDragOver = $state(false);

	// Helper to extract skill name from frontmatter content
	function extractNameFromContent(content: string): string | null {
		const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
		if (!frontmatterMatch) return null;

		const frontmatterContent = frontmatterMatch[1];
		const lines = frontmatterContent.split('\n');

		// Priority 1: Look for 'name:' field
		const nameLine = lines.find((l) => /^name\s*:/.test(l));
		if (nameLine) {
			return sanitizeSkillName(
				nameLine
					.slice(nameLine.indexOf(':') + 1)
					.trim()
					.replace(/^["']|["']$/g, '')
			);
		}

		// Priority 2: Fall back to 'title:' field
		const titleLine = lines.find((l) => /^title\s*:/.test(l));
		if (titleLine) {
			return sanitizeSkillName(
				titleLine
					.slice(titleLine.indexOf(':') + 1)
					.trim()
					.replace(/^["']|["']$/g, '')
			);
		}

		return null;
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		isDragOver = true;
	}

	function handleDragLeave(event: DragEvent) {
		event.preventDefault();
		isDragOver = false;
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		isDragOver = false;

		const file = event.dataTransfer?.files[0];
		if (!file) return;

		if (!file.name.endsWith('.md')) {
			toast.error('Only .md files are supported');
			return;
		}

		const reader = new FileReader();
		reader.onload = (e) => {
			const content = e.target?.result as string;
			importContent = content;

			// Auto-derive name from frontmatter or filename
			if (!importName.trim()) {
				const extractedName = extractNameFromContent(content);
				importName = extractedName ?? sanitizeSkillName(file.name.replace(/\.md$/, ''));
			}
		};
		reader.onerror = () => {
			toast.error('Failed to read file');
		};
		reader.readAsText(file);
	}

	function handleFileSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		if (!file.name.endsWith('.md')) {
			toast.error('Only .md files are supported');
			return;
		}

		const reader = new FileReader();
		reader.onload = (e) => {
			const content = e.target?.result as string;
			importContent = content;

			// Auto-derive name from frontmatter or filename
			if (!importName.trim()) {
				const extractedName = extractNameFromContent(content);
				importName = extractedName ?? sanitizeSkillName(file.name.replace(/\.md$/, ''));
			}
		};
		reader.onerror = () => {
			toast.error('Failed to read file');
		};
		reader.readAsText(file);

		// Reset input so same file can be selected again
		input.value = '';
	}

	async function handleImport() {
		if (!importContent.trim()) {
			toast.error('Content is required');
			return;
		}

		// Auto-derive name from frontmatter or use provided name
		let name: string | null = importName.trim();
		if (!name) {
			name = extractNameFromContent(importContent);
		}

		if (!name) {
			toast.error('Please provide a skill name');
			return;
		}

		isImporting = true;
		try {
			await skillsStore.createSkill(name, importContent);
			toast.success(`Skill "${name}" imported`);
			closeImportModal();
		} catch (err) {
			const errorMessage = (err as Error).message;
			// Check if it's a conflict error (skill already exists)
			if (errorMessage.includes('Conflict') || errorMessage.includes('already exists')) {
				toast.error(`Skill "${name}" already exists. Try a different name or update the existing skill.`);
			} else {
				toast.error(`Failed to import: ${errorMessage}`);
			}
		} finally {
			isImporting = false;
		}
	}

	function closeImportModal() {
		showImportModal = false;
		importContent = '';
		importName = '';
	}

	// ─── Edit ──────────────────────────────────────────────────────────

	function startEdit(skill: SkillDefinition) {
		editingSkill = skill;
		editContent = skill.content;
	}

	async function saveEdit() {
		if (!editingSkill || !editContent.trim()) return;

		try {
			await skillsStore.updateSkill(editingSkill.name, editContent);
			toast.success(`Skill "${editingSkill.title}" updated`);
			editingSkill = null;
		} catch (err) {
			toast.error(`Failed to update: ${(err as Error).message}`);
		}
	}

	function cancelEdit() {
		editingSkill = null;
	}

	// ─── Preview ───────────────────────────────────────────────────────

	function startPreview(skill: SkillDefinition) {
		previewingSkill = skill;
	}

	function cancelPreview() {
		previewingSkill = null;
	}

	// ─── Delete ────────────────────────────────────────────────────────

	function confirmDelete(skill: SkillDefinition) {
		deletingSkill = skill;
	}

	async function handleDelete() {
		if (!deletingSkill) return;

		try {
			await skillsStore.deleteSkill(deletingSkill.name);
			toast.success(`Skill "${deletingSkill.title}" deleted`);
		} catch (err) {
			toast.error(`Failed to delete: ${(err as Error).message}`);
		} finally {
			deletingSkill = null;
		}
	}

	// ─── Duplicate ─────────────────────────────────────────────────────

	async function handleDuplicate(skill: SkillDefinition) {
		const newName = sanitizeSkillName(`${skill.name}-copy`);
		try {
			await skillsStore.createSkill(newName, skill.content);
			toast.success(`Skill duplicated as "${newName}"`);
		} catch (err) {
			toast.error(`Failed to duplicate: ${(err as Error).message}`);
		}
	}
</script>

<Dialog.Root {open} onOpenChange={handleClose}>
	<Dialog.Content
		class="z-[var(--z-dialog)] flex h-[100dvh] min-h-[100dvh] max-h-[100dvh] flex-col gap-0 rounded-none p-0
			md:h-auto md:max-h-[85dvh] md:min-h-0 md:max-w-5xl md:rounded-lg"
	>
		<!-- Header -->
		<div class="grid gap-2 border-b border-border/30 p-4 md:p-6">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-2">
					<Wrench class="h-5 w-5" />
					<Dialog.Title class="text-lg font-semibold">Skills Manager</Dialog.Title>
				</div>

				<div class="flex items-center gap-2">
					<Badge variant="tertiary">{skillsStore.skills.length} total</Badge>
					<Badge variant="outline">{skillsStore.enabledSkills.length} enabled</Badge>
					<Badge variant="secondary" class="text-[10px]">Max 1 MB per skill</Badge>
				</div>
			</div>

			<Dialog.Description class="text-sm text-muted-foreground">
				Import, create, and manage skill files that extend model capabilities.
			</Dialog.Description>
		</div>

		<!-- Toolbar -->
		<div class="flex items-center gap-3 border-b border-border/30 p-3 md:px-6">
			<div class="relative flex-1">
				<Search class="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
				<Input bind:value={searchQuery} placeholder="Search skills..." class="pl-8" />
				{#if searchQuery}
					<button
						type="button"
						class="absolute top-2.5 right-2.5 rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						onclick={() => (searchQuery = '')}
					>
						<X class="h-4 w-4" />
					</button>
				{/if}
			</div>

			<!-- Sort controls -->
			<Select type="single" value={sortMode} onValueChange={(v) => { if (v) sortMode = v as SortMode; }}>
				<SelectTrigger class="w-[180px]" aria-label="Sort skills">
					<ArrowUpDown class="mr-2 h-4 w-4" />
					<span>{sortLabels[sortMode]}</span>
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="recentlyModified">Recently Modified</SelectItem>
					<SelectItem value="nameAsc">Name (A-Z)</SelectItem>
					<SelectItem value="enabledName">Enabled, then Name</SelectItem>
				</SelectContent>
			</Select>

			<Button size="sm" variant="outline" onclick={() => (showImportModal = true)}>
				<Upload class="mr-1.5 h-4 w-4" />
				Import
			</Button>

			<Button
				size="sm"
				onclick={() => {
					importName = '';
					importContent = '';
					showNewModal = true;
				}}
			>
				<Plus class="mr-1.5 h-4 w-4" />
				New
			</Button>
		</div>

		<!-- Content Area -->
		<ScrollArea class="flex-1">
			<div class="p-4 md:p-6">
				{#if isLoading}
					<div class="flex flex-col items-center justify-center py-8 text-muted-foreground">
						<Loader2 class="mb-3 h-6 w-6 animate-spin" />
						<p class="mb-4 text-sm">Fetching skills from server…</p>
						<!-- Skeleton cards -->
						<div class="grid w-full grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
							{#each Array(6) as _}
								<div class="flex animate-pulse flex-col rounded-lg border border-border/40 bg-card/60 p-4">
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
				{:else if skillsStore.error}
					<!-- Error State -->
					<div class="flex flex-col items-center justify-center py-12">
						<div class="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-center">
							<p class="mb-2 text-sm font-medium text-destructive">Failed to load skills</p>
							<p class="text-xs text-muted-foreground">Last fetch failed — try again</p>
							<p class="mt-1 text-xs text-muted-foreground">{skillsStore.error}</p>
						</div>
						<Button size="sm" onclick={() => {
							lastLoadTime = 0;
							void skillsStore.loadSkills().then(() => {
								lastLoadTime = Date.now();
							});
						}}>
							<Upload class="mr-1.5 h-4 w-4" />
							Retry
						</Button>
					</div>
				{:else if editingSkill}
					<!-- Edit Mode -->
					<div in:slide={{ duration: 120 }} out:fade={{ duration: 80 }} class="space-y-4">
						<div class="flex items-center justify-between">
							<h3 class="text-sm font-semibold">
								Editing: {editingSkill.title}
							</h3>
							<div class="flex items-center gap-2">
								<Button size="sm" variant="ghost" onclick={cancelEdit}>Cancel</Button>
								<Button size="sm" onclick={saveEdit}>Save</Button>
							</div>
						</div>
						<textarea
							bind:value={editContent}
							class="h-96 w-full rounded-md border border-border bg-background p-3 font-mono text-sm transition-shadow focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
							placeholder="Skill markdown content..."
						></textarea>
					</div>
				{:else if previewingSkill}
					<!-- Preview Mode -->
					<div in:slide={{ duration: 120 }} out:fade={{ duration: 80 }} class="space-y-4">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<h3 class="text-sm font-semibold">
									Preview: {previewingSkill.title}
								</h3>
								{#if skillHasArguments(previewingSkill.content)}
									<Badge variant="secondary" class="text-[10px]">$ARGUMENTS</Badge>
								{/if}
							</div>
							<Button size="sm" variant="ghost" onclick={cancelPreview}>Back</Button>
						</div>
						<div class="rounded-md border bg-background p-4">
							<MarkdownContent content={previewingSkill.content} />
						</div>
					</div>
				{:else if filteredSkills().length === 0}
					<!-- Empty State -->
					<div in:fade={{ duration: 120 }} class="flex flex-col items-center justify-center py-12 text-muted-foreground">
						<FileText class="mb-3 h-10 w-10 opacity-50" />
						<p class="mb-1 text-sm font-medium">
							{searchQuery ? 'No skills match your search' : 'No skills yet'}
						</p>
						<p class="mb-4 text-xs">
							{searchQuery
								? 'Try a different search term'
								: 'Import a Claude skill or create a new one'}
						</p>
						<Button size="sm" onclick={() => (showImportModal = true)}>
							<Upload class="mr-1.5 h-4 w-4" />
							Import your first skill
						</Button>
					</div>
				{:else}
					<!-- Skill Cards Grid -->
					<div in:fade={{ duration: 150 }} class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
						{#each filteredSkills() as skill (skill.name)}
							<SkillCard
								{skill}
								enabled={skillsStore.isSkillEnabled(skill.name)}
								onEdit={() => startEdit(skill)}
								onDelete={() => confirmDelete(skill)}
								onDuplicate={() => handleDuplicate(skill)}
								onPreview={() => startPreview(skill)}
								onToggle={(enabled) => skillsStore.toggleSkill(skill.name, enabled)}
							/>
						{/each}
					</div>
				{/if}
			</div>
		</ScrollArea>
	</Dialog.Content>
</Dialog.Root>

<!-- Delete Confirmation Dialog -->
<AlertDialog.Root open={deletingSkill !== null} onOpenChange={(open) => { if (!open) deletingSkill = null; }}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete Skill</AlertDialog.Title>
			<AlertDialog.Description>
				Are you sure you want to delete "{deletingSkill?.title}"? This action cannot be undone.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action onclick={handleDelete} class="bg-destructive text-destructive-foreground hover:bg-destructive/90">
				Delete
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<!-- Import Modal (separate dialog to escape stacking context) -->
{#if showImportModal}
	<Dialog.Root open={showImportModal} onOpenChange={closeImportModal}>
		<Dialog.Portal>
			<Dialog.Overlay class="fixed inset-0 z-[var(--z-modal-backdrop)] bg-black/50" />
			<Dialog.Content
				class="fixed top-[50%] left-[50%] z-[var(--z-modal)] mx-4 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-background p-6 shadow-xl"
				onclick={(e) => e.stopPropagation()}
			>
				<h2 class="text-lg font-semibold">Import Skill</h2>

				<div class="space-y-4">
					<!-- File Upload -->
					<div
						class="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-colors {isDragOver
							? 'border-primary bg-primary/5'
							: 'border-border/50 hover:border-primary/50 hover:bg-muted/30'}"
						role="button"
						tabindex="0"
						aria-label="Upload a .md skill file. Click or drag and drop."
						ondragover={handleDragOver}
						ondragleave={handleDragLeave}
						ondrop={handleDrop}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								importFileInput?.click();
							}
						}}
					>
						<Upload class="mb-3 h-10 w-10 text-muted-foreground" />
						<p class="mb-2 text-sm font-medium">Upload a .md skill file</p>
						<p class="mb-4 text-xs text-muted-foreground">Drag and drop or click to browse</p>
						<input
							type="file"
							accept=".md"
							class="sr-only"
							bind:this={importFileInput}
							onchange={handleFileSelect}
							aria-label="Choose a .md skill file"
						/>
						<Button variant="outline" onclick={() => importFileInput?.click()}>
							<Upload class="mr-1.5 h-4 w-4" />
							Choose File
						</Button>
					</div>

					<!-- Loaded skill info -->
					{#if importContent}
						<div class="rounded-md border bg-muted/50 p-3">
							<div class="mb-2 flex items-center justify-between">
								<div class="flex items-center gap-2">
									<FileText class="h-4 w-4" />
									<span class="text-sm font-medium">
										{importName || 'Untitled Skill'}
									</span>
								</div>
								<Button
									size="sm"
									variant="ghost"
									class="h-6 px-2 text-xs"
									onclick={() => {
										importContent = '';
										importName = '';
									}}
								>
									Remove
								</Button>
							</div>
							<p class="line-clamp-3 text-xs text-muted-foreground">
								{importContent.slice(0, 200)}...
							</p>
						</div>
					{/if}

					<!-- Skill name (auto-filled from file or manual) -->
					<div>
						<label class="mb-1 block text-sm font-medium" for="import-skill-name">Skill Name</label>
						<Input
							id="import-skill-name"
							bind:value={importName}
							placeholder="my-cool-skill (or auto-detected from filename)"
						/>
					</div>

					<div class="flex justify-end gap-2">
						<Button variant="ghost" onclick={closeImportModal}>Cancel</Button>
						<Button onclick={handleImport} disabled={isImporting || !importContent.trim()}>
							{#if isImporting}
								<Loader2 class="mr-1.5 h-4 w-4 animate-spin" />
							{/if}
							Import
						</Button>
					</div>
				</div>
			</Dialog.Content>
		</Dialog.Portal>
	</Dialog.Root>
{/if}

<!-- New Skill Modal (separate dialog to escape stacking context) -->
{#if showNewModal}
	<Dialog.Root open={showNewModal} onOpenChange={() => (showNewModal = false)}>
		<Dialog.Portal>
			<Dialog.Overlay class="fixed inset-0 z-[var(--z-modal-backdrop)] bg-black/50" />
			<Dialog.Content
				class="fixed top-[50%] left-[50%] z-[var(--z-modal)] mx-4 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-background p-6 shadow-xl"
				onclick={(e) => e.stopPropagation()}
			>
				<h2 class="text-lg font-semibold">New Skill</h2>

				<div class="space-y-4">
					<div>
						<label class="mb-1 block text-sm font-medium" for="new-skill-name">Skill Name</label>
						<Input
							id="new-skill-name"
							bind:value={importName}
							placeholder="my-cool-skill"
						/>
					</div>

					<div>
						<label class="mb-1 block text-sm font-medium" for="new-skill-content">
							Skill Content
							<span class="ml-2 text-xs text-muted-foreground"
								>(markdown with optional YAML frontmatter)</span
							>
						</label>
						<textarea
							id="new-skill-content"
							bind:value={importContent}
							class="h-64 w-full rounded-md border border-border bg-background p-3 font-mono text-sm transition-shadow focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
							placeholder={"---\ntitle: My Skill\ndescription: Does something cool\ncontext: fork\n---\n\n# My Skill\n\nInstructions here with $ARGUMENTS[0] support..."}
						></textarea>
					</div>

					<div class="flex justify-end gap-2">
						<Button variant="ghost" onclick={() => (showNewModal = false)}>Cancel</Button>
						<Button
							onclick={handleImport}
							disabled={isImporting || !importContent.trim() || !importName.trim()}
						>
							{#if isImporting}
								<Loader2 class="mr-1.5 h-4 w-4 animate-spin" />
							{/if}
							Create Skill
						</Button>
					</div>
				</div>
			</Dialog.Content>
		</Dialog.Portal>
	</Dialog.Root>
{/if}
