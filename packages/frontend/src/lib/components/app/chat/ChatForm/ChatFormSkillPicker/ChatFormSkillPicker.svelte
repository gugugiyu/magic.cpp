<script lang="ts">
	import { KeyboardKey } from '$lib/enums';
	import { skillsStore } from '$lib/stores/skills.svelte';
	import { isSkillUserInvocable } from '$lib/utils';
	import { Badge } from '$lib/components/ui/badge';
	import { Loader2, Wrench } from '@lucide/svelte';
	import type { SkillDefinition } from '@shared/types/skills';

	interface Props {
		class?: string;
		isOpen?: boolean;
		searchQuery?: string;
		onSkillSelect?: (skill: SkillDefinition) => void;
		onClose?: () => void;
	}

	let {
		class: className = '',
		isOpen = false,
		searchQuery = '',
		onSkillSelect,
		onClose
	}: Props = $props();

	let selectedIndex = $state(0);
	let hasTriggeredLoad = $state(false);

	// Trigger load if skills are empty or stale (30s TTL)
	$effect(() => {
		if (isOpen && !hasTriggeredLoad && !skillsStore.isLoading) {
			hasTriggeredLoad = true;
			void skillsStore.loadSkillsIfStale(30_000);
		}
	});

	// Reset load flag when picker closes so next open can re-check
	$effect(() => {
		if (!isOpen) {
			hasTriggeredLoad = false;
		}
	});

	// Available skills: enabled and user-invocable
	const availableSkills = $derived(
		skillsStore.skills.filter((s) => skillsStore.isSkillEnabled(s.name) && isSkillUserInvocable(s))
	);

	// Filtered skills based on search query
	const filteredSkills = $derived.by(() => {
		const query = searchQuery.toLowerCase().trim();
		if (!query) return availableSkills;

		return availableSkills
			.map((skill) => {
				// Score for fuzzy matching
				let score = 0;
				const nameLower = skill.name.toLowerCase();
				const titleLower = skill.title.toLowerCase();
				const descLower = skill.description.toLowerCase();

				// Exact name match gets highest score
				if (nameLower === query) score += 100;
				else if (nameLower.startsWith(query)) score += 50;
				else if (nameLower.includes(query)) score += 25;

				// Title match
				if (titleLower === query) score += 80;
				else if (titleLower.startsWith(query)) score += 40;
				else if (titleLower.includes(query)) score += 20;

				// Description match (lower priority)
				if (descLower.includes(query)) score += 10;

				return { skill, score };
			})
			.filter((item) => item.score > 0)
			.sort((a, b) => b.score - a.score)
			.map((item) => item.skill);
	});

	// Reset selection when search query or skills change
	$effect(() => {
		if (isOpen) {
			selectedIndex = 0;
		}
	});

	// Ensure selectedIndex is within bounds
	$effect(() => {
		if (filteredSkills.length > 0 && selectedIndex >= filteredSkills.length) {
			selectedIndex = 0;
		}
	});

	export function handleKeydown(event: KeyboardEvent): boolean {
		if (!isOpen) return false;

		const skills = filteredSkills;
		if (skills.length === 0) return false;

		if (event.key === KeyboardKey.ARROW_DOWN) {
			event.preventDefault();
			selectedIndex = (selectedIndex + 1) % skills.length;
			return true;
		}

		if (event.key === KeyboardKey.ARROW_UP) {
			event.preventDefault();
			selectedIndex = (selectedIndex - 1 + skills.length) % skills.length;
			return true;
		}

		if (event.key === KeyboardKey.ENTER) {
			event.preventDefault();
			selectSkill(skills[selectedIndex]);
			return true;
		}

		if (event.key === KeyboardKey.ESCAPE) {
			event.preventDefault();
			onClose?.();
			return true;
		}

		return false;
	}

	function selectSkill(skill: SkillDefinition) {
		onSkillSelect?.(skill);
		onClose?.();
	}

	function hasArguments(skill: SkillDefinition): boolean {
		return /\$ARGUMENTS\[\d+\]/.test(skill.content);
	}
</script>

{#if isOpen}
	<div
		class="absolute bottom-full left-0 z-50 mb-2 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-lg {className}"
		role="listbox"
		tabindex="0"
		aria-label="Select a skill"
		aria-activedescendant={selectedIndex >= 0 && filteredSkills[selectedIndex]
			? `skill-option-${filteredSkills[selectedIndex].name}`
			: undefined}
	>
		{#if skillsStore.isLoading}
			<div class="flex items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
				<Loader2 class="h-4 w-4 animate-spin" />
				Loading skills...
			</div>
		{:else if filteredSkills.length === 0}
			<div class="p-4 text-center text-sm text-muted-foreground">
				{searchQuery.trim() ? 'No matching skills' : 'No enabled skills'}
			</div>
		{:else}
			<div class="max-h-64 overflow-y-auto py-1">
				<!-- Header -->
				<div class="flex items-center gap-2 border-b border-border/50 px-3 py-2">
					<Wrench class="h-3.5 w-3.5 text-muted-foreground" />
					<span class="text-xs font-medium text-muted-foreground"> Select a skill to inject </span>
				</div>

				{#each filteredSkills as skill, index (skill.name)}
					<button
						type="button"
						id="skill-option-{skill.name}"
						class="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-accent {index ===
						selectedIndex
							? 'bg-accent'
							: ''}"
						role="option"
						aria-selected={index === selectedIndex}
						onclick={() => selectSkill(skill)}
						onmouseenter={() => (selectedIndex = index)}
					>
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<span class="text-sm font-medium">{skill.title}</span>
								{#if hasArguments(skill)}
									<Badge variant="secondary" class="text-[10px]">args</Badge>
								{/if}
							</div>
							<p class="truncate text-xs text-muted-foreground">
								{skill.description.replace(/\n/g, ' ')}
							</p>
						</div>
					</button>
				{/each}
			</div>
		{/if}

		<!-- Footer hint -->
		<div class="border-t border-border/50 px-3 py-1.5 text-[10px] text-muted-foreground">
			<span class="mr-2">↑↓ navigate</span>
			<span class="mr-2">↵ select</span>
			<span>esc close</span>
		</div>
	</div>
{/if}
