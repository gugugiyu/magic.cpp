<script lang="ts">
	import { Search, SquarePen, X, Plug, Wrench, UserCog } from '@lucide/svelte';
	import { KeyboardShortcutInfo } from '$lib/components/app';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { McpLogo } from '$lib/components/app';
	import { goto } from '$app/navigation';
	import type { Component } from 'svelte';

	interface Props {
		handleMobileSidebarItemClick: () => void;
		isSearchModeActive: boolean;
		searchQuery: string;
	}

	interface ActionButton {
		icon: Component;
		label: string;
		keys: string[];
		onClick: () => void;
	}

	let {
		handleMobileSidebarItemClick,
		isSearchModeActive = $bindable(),
		searchQuery = $bindable()
	}: Props = $props();

	let searchInput: HTMLInputElement | null = $state(null);

	function handleSearchModeDeactivate() {
		isSearchModeActive = false;
		searchQuery = '';
	}

	const actionButtons: ActionButton[] = [
		{
			icon: SquarePen,
			label: 'New chat',
			keys: ['shift', 'cmd', 'o'],
			onClick: () => handleMobileSidebarItemClick()
		},
		{
			icon: Search,
			label: 'Search',
			keys: ['cmd', 'k'],
			onClick: () => {
				isSearchModeActive = true;
			}
		},
		{
			icon: McpLogo,
			label: 'MCP Servers',
			keys: ['cmd', 'm'],
			onClick: () => goto('#/settings/mcp')
		},
		{
			icon: Plug,
			label: 'Connections',
			keys: ['cmd', 'c'],
			onClick: () => goto('#/settings/connection')
		},
		{
			icon: UserCog,
			label: 'Presets',
			keys: ['cmd', 'u'],
			onClick: () => goto('#/presets')
		},
		{
			icon: Wrench,
			label: 'Skills',
			keys: ['cmd', 's'],
			onClick: () => goto('#/skills')
		}
	];

	$effect(() => {
		if (isSearchModeActive) {
			searchInput?.focus();
		}
	});
</script>

<div class="my-1 space-y-1">
	{#if isSearchModeActive}
		<div class="relative">
			<Search class="absolute top-2.5 left-2 h-4 w-4 text-muted-foreground" />

			<Input
				bind:ref={searchInput}
				bind:value={searchQuery}
				onkeydown={(e) => e.key === 'Escape' && handleSearchModeDeactivate()}
				placeholder="Search conversations..."
				class="pl-8"
			/>

			<X
				class="absolute top-2.5 right-2 h-4 w-4 cursor-pointer text-muted-foreground"
				onclick={handleSearchModeDeactivate}
			/>
		</div>
	{:else}
		{#each actionButtons as action (action.label)}
			{@const Icon = action.icon}

			<Button
				class="w-full justify-between backdrop-blur-none! hover:[&>kbd]:opacity-100"
				href={action.label === 'New chat' ? '?new_chat=true#/' : undefined}
				onclick={action.onClick}
				variant="ghost"
			>
				<div class="flex items-center gap-2" style="color: var(--foreground)">
					<Icon />
					{action.label}
				</div>

				{#if action.keys.length > 0}
					<KeyboardShortcutInfo keys={action.keys} />
				{/if}
			</Button>
		{/each}
	{/if}
</div>
