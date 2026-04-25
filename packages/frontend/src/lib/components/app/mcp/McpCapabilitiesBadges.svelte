<script lang="ts">
	import { Wrench, Database, MessageSquare, FileText, Sparkles, ListChecks } from '@lucide/svelte';
	import type { MCPCapabilitiesInfo } from '$lib/types';
	import { Badge } from '$lib/components/ui/badge';

	interface Props {
		capabilities?: MCPCapabilitiesInfo;
	}

	let { capabilities }: Props = $props();
</script>

{#if capabilities}
	{#if capabilities.server.tools}
		<Badge variant="outline" class="h-5 gap-1 bg-success-bg px-1.5 text-2xs">
			<Wrench class="h-3 w-3 text-success" />

			Tools
		</Badge>
	{/if}

	{#if capabilities.server.resources}
		<Badge variant="outline" class="h-5 gap-1 bg-info-bg px-1.5 text-2xs">
			<Database class="h-3 w-3 text-info" />

			Resources
		</Badge>
	{/if}

	{#if capabilities.server.prompts}
		<Badge variant="outline" class="h-5 gap-1 bg-purple-bg px-1.5 text-2xs">
			<MessageSquare class="h-3 w-3 text-purple" />

			Prompts
		</Badge>
	{/if}

	{#if capabilities.server.logging}
		<Badge variant="outline" class="h-5 gap-1 bg-warning-bg px-1.5 text-2xs">
			<FileText class="h-3 w-3 text-warning" />

			Logging
		</Badge>
	{/if}

	{#if capabilities.server.completions}
		<Badge variant="outline" class="h-5 gap-1 bg-cyan-bg px-1.5 text-2xs">
			<Sparkles class="h-3 w-3 text-cyan" />

			Completions
		</Badge>
	{/if}

	{#if capabilities.server.tasks}
		<Badge variant="outline" class="h-5 gap-1 bg-pink-bg px-1.5 text-2xs">
			<ListChecks class="h-3 w-3 text-pink" />

			Tasks
		</Badge>
	{/if}
{/if}
