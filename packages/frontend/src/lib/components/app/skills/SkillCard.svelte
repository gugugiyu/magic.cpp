<script lang="ts">
	import { Pencil, Trash2, Copy, Eye } from '@lucide/svelte';
	import { Badge } from '$lib/components/ui/badge';
	import type { SkillDefinition, SkillSource } from '@shared/types/skills';
	import { SKILL_DESCRIPTION_TRIM_LENGTH } from '@shared/constants/skills';

	const sourceLabels: Record<SkillSource, string> = {
		local: 'local',
		claude: 'Claude',
		gemini: 'Gemini',
		qwen: 'Qwen',
		codex: 'Codex'
	};

	function getSourceBadgeVariant(
		source?: SkillSource
	): 'claude' | 'gemini' | 'qwen' | 'codex' | 'global' | undefined {
		if (!source || source === 'local') return undefined;
		// Map each provider to its corresponding badge variant
		if (source === 'claude') return 'claude';
		if (source === 'gemini') return 'gemini';
		if (source === 'qwen') return 'qwen';
		if (source === 'codex') return 'codex';
		return 'global'; // fallback for any new providers
	}

	interface Props {
		skill: SkillDefinition;
		enabled?: boolean;
		isOperating?: boolean;
		onEdit?: () => void;
		onDelete?: () => void;
		onDuplicate?: () => void;
		onPreview?: () => void;
		onToggle?: (enabled: boolean) => void;
	}

	let {
		skill,
		enabled = true,
		isOperating = false,
		onEdit,
		onDelete,
		onDuplicate,
		onPreview,
		onToggle
	}: Props = $props();

	const trimmedDescription = $derived(
		skill.description.length > SKILL_DESCRIPTION_TRIM_LENGTH
			? skill.description.slice(0, SKILL_DESCRIPTION_TRIM_LENGTH) + '...'
			: skill.description
	);

	const byteCount = $derived(new TextEncoder().encode(skill.content).length);

	const hasFrontmatter = $derived(
		skill.frontmatter.context !== undefined ||
			skill.frontmatter.userInvocable !== undefined ||
			skill.frontmatter.disableModelInvocation !== undefined
	);
</script>

<div
	class="group relative flex flex-col rounded-lg border border-border/40 bg-card/60 p-4 backdrop-blur-sm transition-all hover:border-border hover:bg-card/80 {isOperating
		? 'pointer-events-none opacity-50'
		: ''}"
	aria-busy={isOperating}
>
	<!-- Header: Title + Actions -->
	<div class="mb-2 flex items-start justify-between gap-2">
		<h3 class="text-sm leading-tight font-semibold">{skill.title}</h3>

		<!-- Action buttons: always visible, compact on mobile, full on desktop -->
		<div class="flex shrink-0 items-center gap-0.5 sm:gap-1">
			{#if onPreview}
				<button
					type="button"
					class="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:p-1"
					onclick={onPreview}
					disabled={isOperating}
					title="Preview skill"
					aria-label="Preview skill"
				>
					<Eye class="h-3.5 w-3.5" />
				</button>
			{/if}
			{#if onDuplicate}
				<button
					type="button"
					class="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:p-1"
					onclick={onDuplicate}
					disabled={isOperating}
					title="Duplicate skill"
					aria-label="Duplicate skill"
				>
					<Copy class="h-3.5 w-3.5" />
				</button>
			{/if}
			{#if onEdit}
				<button
					type="button"
					class="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:p-1"
					onclick={onEdit}
					disabled={isOperating}
					title="Edit skill"
					aria-label="Edit skill"
				>
					<Pencil class="h-3.5 w-3.5" />
				</button>
			{/if}
			{#if onDelete}
				<button
					type="button"
					class="rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:p-1"
					onclick={onDelete}
					disabled={isOperating}
					title="Delete skill"
					aria-label="Delete skill"
				>
					<Trash2 class="h-3.5 w-3.5" />
				</button>
			{/if}
		</div>
	</div>

	<!-- Description -->
	<p class="mb-3 text-xs leading-relaxed text-muted-foreground">
		{trimmedDescription.replace(/\n/g, ' ')}
	</p>

	<!-- Badges -->
	<div class="mt-auto flex flex-wrap items-center gap-1.5">
		{#if skill.source && skill.source !== 'local'}
			<Badge variant={getSourceBadgeVariant(skill.source)} class="text-[10px]">
				{sourceLabels[skill.source]}
			</Badge>
		{/if}

		<Badge variant="tertiary" class="text-[10px]">
			{(byteCount / 1024).toFixed(1)} KB
		</Badge>

		{#if hasFrontmatter}
			{#if skill.frontmatter.context === 'fork'}
				<Badge variant="outline" class="text-[10px]">fork</Badge>
			{/if}

			{#if skill.frontmatter.disableModelInvocation}
				<Badge variant="outline" class="bg-warning-bg text-[10px] text-warning">user-only</Badge>
			{/if}
		{/if}

		<!-- Enable/disable toggle -->
		{#if onToggle}
			<button
				type="button"
				class="ml-auto inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none {enabled
					? 'bg-primary'
					: 'bg-muted'}"
				role="switch"
				aria-checked={enabled}
				aria-label="{enabled ? 'Disable' : 'Enable'} skill {skill.title}"
				onclick={() => onToggle(!enabled)}
			>
				<span
					class="pointer-events-none block h-4 w-4 translate-x-0 rounded-full bg-background shadow-sm transition-transform {enabled
						? 'translate-x-4'
						: 'translate-x-0.5'}"
				></span>
			</button>
		{/if}
	</div>
</div>
