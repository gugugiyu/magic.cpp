<script lang="ts">
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Button } from '$lib/components/ui/button';
	import { builtinToolFields } from '$lib/enums/builtin-tools';
	import { BUILTIN_TOOL_SETTING_KEY_TARGET } from '$lib/enums/builtin-tools';
	import { runCommandSessionStore } from '$lib/stores/run-command-session.svelte';
	import { Terminal, Trash2, Loader2, X } from '@lucide/svelte';

	interface Props {
		localConfig: SettingsConfigType;
		onConfigChange: (key: string, value: string | boolean) => void;
	}

	let { localConfig, onConfigChange }: Props = $props();

	const frontendTools = builtinToolFields.filter(
		(tool) => BUILTIN_TOOL_SETTING_KEY_TARGET[tool.key] === 'frontend'
	);
	const backendTools = builtinToolFields.filter(
		(tool) => BUILTIN_TOOL_SETTING_KEY_TARGET[tool.key] === 'backend'
	);
</script>

<div class="space-y-6">
	<div class="space-y-4">
		<h3 class="text-sm font-semibold">Frontend Tools</h3>
		<p class="text-xs text-muted-foreground">
			Processed entirely in the browser — no server round-trip required.
		</p>
		{#each frontendTools as tool (tool.key)}
			<div class="flex flex-col gap-1">
				<div class="flex items-start space-x-3">
					<Checkbox
						id={tool.key}
						checked={!!localConfig[tool.key]}
						onCheckedChange={(checked) => onConfigChange(tool.key, checked)}
						class="mt-1"
					/>
					<div class="space-y-1">
						<label
							for={tool.key}
							class="flex cursor-pointer items-center gap-1.5 pt-1 pb-0.5 text-sm leading-none font-medium"
						>
							{tool.label}
						</label>

						{#if tool.description}
							<p class="text-xs text-muted-foreground">{tool.description}</p>
						{/if}
					</div>
				</div>
			</div>
		{/each}
	</div>

	{#if backendTools.length > 0}
		<div class="space-y-4 border-t border-border/30 pt-6">
			<h3 class="text-sm font-semibold">Backend Tools</h3>
			<p class="text-xs text-muted-foreground">
				Routed through the server via <code class="rounded bg-muted px-1 py-0.5 text-[10px]"
					>POST /api/tools/execute</code
				>.
			</p>
			{#each backendTools as tool (tool.key)}
				<div class="flex flex-col gap-1">
					<div class="flex items-start space-x-3">
						<Checkbox
							id={tool.key}
							checked={!!localConfig[tool.key]}
							onCheckedChange={(checked) => onConfigChange(tool.key, checked)}
							class="mt-1"
						/>
						<div class="space-y-1">
							<label
								for={tool.key}
								class="flex cursor-pointer items-center gap-1.5 pt-1 pb-0.5 text-sm leading-none font-medium"
							>
								{tool.label}
							</label>

							{#if tool.description}
								<p class="text-xs text-muted-foreground">{tool.description}</p>
							{/if}
						</div>
					</div>
				</div>
			{/each}

			{#if runCommandSessionStore.backendAllowedListLoading}
				<div class="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
					<Loader2 class="h-3 w-3 animate-spin" />
					Loading server allow-list…
				</div>
			{:else if runCommandSessionStore.backendAllowedListError}
				<div class="mt-4 text-xs text-destructive">
					Failed to load server allow-list: {runCommandSessionStore.backendAllowedListError}
				</div>
			{/if}

			{#if runCommandSessionStore.count > 0}
				<div class="mt-4 rounded-md border border-cyan-500/20 bg-cyan-500/5 p-3">
					<div class="mb-2 flex items-center justify-between gap-3">
						<div class="flex items-center gap-2">
							<Terminal class="h-3.5 w-3.5 text-cyan-500" />
							<span class="text-xs text-cyan-700 dark:text-cyan-300">
								{runCommandSessionStore.count} command{runCommandSessionStore.count === 1
									? ''
									: 's'} approved this session
							</span>
						</div>
						<Button
							variant="outline"
							size="sm"
							class="h-7 gap-1.5 border-cyan-500/30 text-xs text-cyan-700 hover:bg-cyan-500/10 hover:text-cyan-800 dark:text-cyan-300 dark:hover:text-cyan-200"
							onclick={() => runCommandSessionStore.revokeAll()}
						>
							<Trash2 class="h-3 w-3" />
							Revoke all
						</Button>
					</div>
					<div class="flex flex-wrap gap-1.5">
						{#each runCommandSessionStore.getApprovedCommands() as cmd (cmd)}
							<div
								class="inline-flex items-center gap-1 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-700 dark:text-cyan-300"
							>
								<span class="font-mono">{cmd}</span>
								<button
									type="button"
									class="inline-flex items-center justify-center rounded-full hover:bg-cyan-500/20"
									onclick={() => runCommandSessionStore.revoke(cmd)}
									title="Revoke {cmd}"
								>
									<X class="h-2.5 w-2.5" />
								</button>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>
