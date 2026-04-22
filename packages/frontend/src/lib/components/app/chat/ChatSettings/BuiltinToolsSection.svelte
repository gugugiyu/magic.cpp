<script lang="ts">
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { builtinToolFields } from '$lib/enums/builtin-tools';
	import { BUILTIN_TOOL_SETTING_KEY_TARGET } from '$lib/enums/builtin-tools';

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
		</div>
	{/if}
</div>
