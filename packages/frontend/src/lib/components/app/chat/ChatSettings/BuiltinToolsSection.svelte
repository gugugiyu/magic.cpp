<script lang="ts">
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Button } from '$lib/components/ui/button';
	import { SettingsSectionDivider } from '$lib/components/app';
	import { builtinToolFields } from '$lib/enums/builtin-tools';
	import { BUILTIN_TOOL_SETTING_KEY_TARGET } from '$lib/enums/builtin-tools';
	import { runCommandSessionStore } from '$lib/stores/run-command-session.svelte';
	import { getBuiltinToolPayloadApproxChars } from '$lib/stores/settings.svelte';
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
							<span class="text-xs text-muted-foreground tabular-nums">
								~{getBuiltinToolPayloadApproxChars(tool.key)} chars
							</span>
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
		<SettingsSectionDivider class="space-y-4">
			<h3 class="text-sm font-semibold">Backend Tools</h3>
			<p class="text-xs text-muted-foreground">
				Routed through the server via <code class="rounded bg-muted px-1 py-0.5 text-xs"
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
								<span class="text-xs text-muted-foreground tabular-nums">
									~{getBuiltinToolPayloadApproxChars(tool.key)} chars
								</span>
							</label>

							{#if tool.description}
								<p class="text-xs text-muted-foreground">{tool.description}</p>
							{/if}
						</div>
					</div>
				</div>
			{/each}

			{#if runCommandSessionStore.backendAllowedListLoading}
				<div class="flex items-center gap-2 text-xs text-muted-foreground">
					<Loader2 class="h-3 w-3 animate-spin" />
					Loading server allow-list…
				</div>
			{:else if runCommandSessionStore.backendAllowedListError}
				<div class="text-xs text-destructive">
					Failed to load server allow-list: {runCommandSessionStore.backendAllowedListError}
				</div>
			{:else if runCommandSessionStore.backendAllowedList.length > 0}
				<div class="rounded-md border border-border bg-muted/30 p-3">
					<div class="mb-1.5 flex items-center gap-2">
						<Terminal class="h-3.5 w-3.5 text-success" />
						<span class="text-xs font-medium text-success">Server allowed commands</span>
					</div>
					<div class="flex flex-wrap gap-1.5">
						{#each runCommandSessionStore.backendAllowedList as cmd (cmd)}
							<span
								class="inline-flex items-center gap-1 rounded-full border border-border bg-success-bg px-2 py-0.5 text-xs text-success"
							>
								<span class="font-mono">{cmd}</span>
							</span>
						{/each}
					</div>
				</div>
			{/if}

			{#if runCommandSessionStore.count > 0}
				<div class="rounded-md border border-primary/20 bg-primary/5 p-3">
					<div class="mb-2 flex items-center justify-between gap-3">
						<div class="flex items-center gap-2">
							<Terminal class="h-3.5 w-3.5 text-primary" />
							<span class="text-xs text-primary">
								{runCommandSessionStore.count} command{runCommandSessionStore.count === 1
									? ''
									: 's'} approved this session
							</span>
						</div>
						<Button
							variant="outline"
							size="sm"
							class="h-7 gap-1.5 border-primary/30 text-xs text-primary hover:bg-primary/10 hover:text-primary"
							onclick={() => runCommandSessionStore.revokeAll()}
						>
							<Trash2 class="h-3 w-3" />
							Revoke all
						</Button>
					</div>
					<div class="flex flex-wrap gap-1.5">
						{#each runCommandSessionStore.getApprovedCommands() as cmd (cmd)}
							<div
								class="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs text-primary"
							>
								<span class="font-mono">{cmd}</span>
							<button
								type="button"
								class="inline-flex min-h-[1.5rem] min-w-[1.5rem] items-center justify-center rounded-full hover:bg-primary/20"
								onclick={() => runCommandSessionStore.revoke(cmd)}
								title="Revoke {cmd}"
							>
								<X class="h-3 w-3" />
							</button>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</SettingsSectionDivider>
	{/if}
</div>
