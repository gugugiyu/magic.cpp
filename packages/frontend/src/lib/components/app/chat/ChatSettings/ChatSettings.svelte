<script lang="ts">
	import {
		Settings,
		Funnel,
		AlertTriangle,
		Code,
		Monitor,
		ChevronLeft,
		ChevronRight,
		Database,
		Plug,
		ListFilter,
		Wrench
	} from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import {
		ChatSettingsFooter,
		ChatSettingsImportExportTab,
		ChatSettingsConnectionTab,
		ChatSettingsFields,
		McpLogo,
		McpServersSettings,
		BuiltinToolsSection,
		SettingsSectionDivider
	} from '$lib/components/app';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { config, settingsStore } from '$lib/stores/settings.svelte';
	import { skillsStore } from '$lib/stores/skills.svelte';
	import {
		SETTINGS_SECTION_TITLES,
		SETTINGS_SECTION_SLUGS,
		SETTINGS_SECTION_TITLE_TO_SLUG,
		type SettingsSectionTitle,
		NUMERIC_FIELDS,
		POSITIVE_INTEGER_FIELDS,
		SETTINGS_COLOR_MODES_CONFIG,
		SETTINGS_ANIMATION_SPEED_CONFIG,
		SETTINGS_KEYS
	} from '$lib/constants';
	import { applyTheme } from '$lib/utils/theme';
	import { SettingsFieldType } from '$lib/enums/settings';
	import type { Component } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { useUnsavedChanges } from '$lib/hooks/use-unsaved-changes.svelte';
	import { useScrollController } from '$lib/hooks/use-scroll-controller.svelte';
	import { fade } from 'svelte/transition';
	import { tick } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { presetsStore } from '$lib/stores/presets.svelte';

	const SCROLL_CENTER_DELAY_MS = 50;
	const SCROLL_UPDATE_DELAY_MS = 100;

	const settingSections: Array<{
		fields: SettingsFieldConfig[];
		icon: Component;
		title: SettingsSectionTitle;
	}> = [
		{
			title: SETTINGS_SECTION_TITLES.GENERAL,
			icon: Settings,
			fields: [
				{
					key: SETTINGS_KEYS.THEME,
					label: 'Theme',
					type: SettingsFieldType.SELECT,
					options: SETTINGS_COLOR_MODES_CONFIG
				},
				// API Key removed - backend handles API key centrally
				{
					key: SETTINGS_KEYS.SYSTEM_MESSAGE,
					label: 'System Message',
					type: SettingsFieldType.TEXTAREA
				},
				{
					key: SETTINGS_KEYS.PASTE_LONG_TEXT_TO_FILE_LEN,
					label: 'Paste long text to file length',
					type: SettingsFieldType.INPUT
				},
				{
					key: SETTINGS_KEYS.COPY_TEXT_ATTACHMENTS_AS_PLAIN_TEXT,
					label: 'Copy text attachments as plain text',
					type: SettingsFieldType.CHECKBOX
				},
				{
					key: SETTINGS_KEYS.ENABLE_CONTINUE_GENERATION,
					label: 'Enable "Continue" button',
					type: SettingsFieldType.CHECKBOX,
					isExperimental: true
				},
				{
					key: SETTINGS_KEYS.PDF_AS_IMAGE,
					label: 'Parse PDF as image',
					type: SettingsFieldType.CHECKBOX
				},
				{
					key: SETTINGS_KEYS.ASK_FOR_TITLE_CONFIRMATION,
					label: 'Ask for confirmation before changing conversation title',
					type: SettingsFieldType.CHECKBOX
				},
				{
					key: SETTINGS_KEYS.TITLE_GENERATION_USE_FIRST_LINE,
					label: 'Use first non-empty line for conversation title',
					type: SettingsFieldType.CHECKBOX
				}
			]
		},
		{
			title: SETTINGS_SECTION_TITLES.DISPLAY,
			icon: Monitor,
			fields: [
				{
					key: SETTINGS_KEYS.ANIMATION_SPEED,
					label: 'Animation speed',
					type: SettingsFieldType.SELECT,
					options: SETTINGS_ANIMATION_SPEED_CONFIG
				},
				{
					key: SETTINGS_KEYS.SHOW_MESSAGE_STATS,
					label: 'Show message generation statistics',
					type: SettingsFieldType.CHECKBOX
				},
				{
					key: SETTINGS_KEYS.SHOW_THOUGHT_IN_PROGRESS,
					label: 'Show thought in progress',
					type: SettingsFieldType.CHECKBOX
				},
				{
					key: SETTINGS_KEYS.KEEP_STATS_VISIBLE,
					label: 'Keep stats visible after generation',
					type: SettingsFieldType.CHECKBOX
				},
				{
					key: SETTINGS_KEYS.AUTO_MIC_ON_EMPTY,
					label: 'Show microphone on empty input',
					type: SettingsFieldType.CHECKBOX,
					isExperimental: true
				},
				{
					key: SETTINGS_KEYS.RENDER_USER_CONTENT_AS_MARKDOWN,
					label: 'Render user content as Markdown',
					type: SettingsFieldType.CHECKBOX
				},
				{
					key: SETTINGS_KEYS.FULL_HEIGHT_CODE_BLOCKS,
					label: 'Use full height code blocks',
					type: SettingsFieldType.CHECKBOX
				},
				{
					key: SETTINGS_KEYS.DISABLE_AUTO_SCROLL,
					label: 'Disable automatic scroll',
					type: SettingsFieldType.CHECKBOX
				},
				{
					key: SETTINGS_KEYS.ALWAYS_SHOW_SIDEBAR_ON_DESKTOP,
					label: 'Always show sidebar on desktop',
					type: SettingsFieldType.CHECKBOX
				},
				{
					key: SETTINGS_KEYS.AUTO_SHOW_SIDEBAR_ON_NEW_CHAT,
					label: 'Auto-show sidebar on new chat',
					type: SettingsFieldType.CHECKBOX
				},
				{
					key: SETTINGS_KEYS.SHOW_RAW_MODEL_NAMES,
					label: 'Show raw model names',
					type: SettingsFieldType.CHECKBOX
				}
			]
		},
		{
			title: SETTINGS_SECTION_TITLES.SAMPLING,
			icon: Funnel,
			fields: [
				{
					key: SETTINGS_KEYS.TEMPERATURE,
					label: 'Temperature',
					type: SettingsFieldType.INPUT
				},
				{
					key: SETTINGS_KEYS.DYNATEMP_RANGE,
					label: 'Dynamic temperature range',
					type: SettingsFieldType.INPUT
				},
				{
					key: SETTINGS_KEYS.DYNATEMP_EXPONENT,
					label: 'Dynamic temperature exponent',
					type: SettingsFieldType.INPUT
				},
				{
					key: SETTINGS_KEYS.TOP_K,
					label: 'Top K',
					type: SettingsFieldType.INPUT
				},
				{
					key: SETTINGS_KEYS.TOP_P,
					label: 'Top P',
					type: SettingsFieldType.INPUT
				},
				{
					key: SETTINGS_KEYS.MIN_P,
					label: 'Min P',
					type: SettingsFieldType.INPUT
				},
				{
					key: SETTINGS_KEYS.XTC_PROBABILITY,
					label: 'XTC probability',
					type: SettingsFieldType.INPUT
				},
				{
					key: SETTINGS_KEYS.XTC_THRESHOLD,
					label: 'XTC threshold',
					type: SettingsFieldType.INPUT
				},
				{
					key: SETTINGS_KEYS.TYP_P,
					label: 'Typical P',
					type: SettingsFieldType.INPUT
				},
				{
					key: SETTINGS_KEYS.MAX_TOKENS,
					label: 'Max tokens',
					type: SettingsFieldType.INPUT
				},
				{
					key: SETTINGS_KEYS.SAMPLERS,
					label: 'Samplers',
					type: SettingsFieldType.INPUT
				},
				{
					key: SETTINGS_KEYS.BACKEND_SAMPLING,
					label: 'Backend sampling',
					type: SettingsFieldType.CHECKBOX
				}
			]
		},
		{
			title: SETTINGS_SECTION_TITLES.PENALTIES,
			icon: AlertTriangle,
			fields: [
				{
					key: SETTINGS_KEYS.REPEAT_LAST_N,
					label: 'Repeat last N',
					type: SettingsFieldType.INPUT
				},
				{
					key: SETTINGS_KEYS.REPEAT_PENALTY,
					label: 'Repeat penalty',
					type: SettingsFieldType.INPUT
				},
				{
					key: SETTINGS_KEYS.PRESENCE_PENALTY,
					label: 'Presence penalty',
					type: SettingsFieldType.INPUT
				},
				{
					key: SETTINGS_KEYS.FREQUENCY_PENALTY,
					label: 'Frequency penalty',
					type: SettingsFieldType.INPUT
				},
				{
					key: SETTINGS_KEYS.DRY_MULTIPLIER,
					label: 'DRY multiplier',
					type: SettingsFieldType.INPUT
				},
				{
					key: SETTINGS_KEYS.DRY_BASE,
					label: 'DRY base',
					type: SettingsFieldType.INPUT
				},
				{
					key: SETTINGS_KEYS.DRY_ALLOWED_LENGTH,
					label: 'DRY allowed length',
					type: SettingsFieldType.INPUT
				},
				{
					key: SETTINGS_KEYS.DRY_PENALTY_LAST_N,
					label: 'DRY penalty last N',
					type: SettingsFieldType.INPUT
				}
			]
		},
		{
			title: SETTINGS_SECTION_TITLES.IMPORT_EXPORT,
			icon: Database,
			fields: []
		},
		{
			title: SETTINGS_SECTION_TITLES.CONNECTION,
			icon: Plug,
			fields: []
		},
		{
			title: SETTINGS_SECTION_TITLES.MCP,
			icon: McpLogo,
			fields: [
				{
					key: SETTINGS_KEYS.AGENTIC_MAX_TURNS,
					label: 'Agentic loop max turns',
					type: SettingsFieldType.INPUT
				},
				{
					key: SETTINGS_KEYS.ALWAYS_SHOW_AGENTIC_TURNS,
					label: 'Always show agentic turns in conversation',
					type: SettingsFieldType.CHECKBOX
				},
				{
					key: SETTINGS_KEYS.AGENTIC_MAX_TOOL_PREVIEW_LINES,
					label: 'Max lines per tool preview',
					type: SettingsFieldType.INPUT
				},
				{
					key: SETTINGS_KEYS.SHOW_TOOL_CALL_IN_PROGRESS,
					label: 'Show tool call in progress',
					type: SettingsFieldType.CHECKBOX
				},
				{
					key: SETTINGS_KEYS.MCP_SUMMARIZE_OUTPUTS,
					label: 'Auto-summarize long tool outputs',
					type: SettingsFieldType.CHECKBOX
				}
			]
		},
		{
			title: SETTINGS_SECTION_TITLES.FILTER,
			icon: ListFilter,
			fields: [
				{
					key: SETTINGS_KEYS.FILTER_NORMALIZE_MARKDOWN,
					label: 'Markdown normalizer',
					type: SettingsFieldType.CHECKBOX
				},
				{
					key: SETTINGS_KEYS.FILTER_EMOJI_REMOVAL,
					label: 'Emoji removal',
					type: SettingsFieldType.CHECKBOX
				},
				{
					key: SETTINGS_KEYS.FILTER_CODEBLOCK_ONLY,
					label: 'Code block only',
					type: SettingsFieldType.CHECKBOX
				},
				{
					key: SETTINGS_KEYS.FILTER_LANGUAGE_PINNER,
					label: 'Language pinner',
					type: SettingsFieldType.CHECKBOX
				}
			]
		},
		{
			title: SETTINGS_SECTION_TITLES.DEVELOPER,
			icon: Code,
			fields: [
				{
					key: SETTINGS_KEYS.DISABLE_REASONING_PARSING,
					label: 'Disable reasoning content parsing',
					type: SettingsFieldType.CHECKBOX
				},
				{
					key: SETTINGS_KEYS.EXCLUDE_REASONING_FROM_CONTEXT,
					label: 'Exclude reasoning from context',
					type: SettingsFieldType.CHECKBOX
				},
				{
					key: SETTINGS_KEYS.SHOW_RAW_OUTPUT_SWITCH,
					label: 'Enable raw output toggle',
					type: SettingsFieldType.CHECKBOX
				},
				{
					key: SETTINGS_KEYS.CUSTOM,
					label: 'Custom JSON',
					type: SettingsFieldType.TEXTAREA
				}
			]
		}
		// TODO: Experimental features section will be implemented after initial release
		// This includes Python interpreter (Pyodide integration) and other experimental features
		// {
		// 	title: 'Experimental',
		// 	icon: Beaker,
		// 	fields: [
		// 		{
		// 			key: 'pyInterpreterEnabled',
		// 			label: 'Enable Python interpreter',
		// 			type: 'checkbox'
		// 		}
		// 	]
		// }
	];

	let activeSection = $derived.by<SettingsSectionTitle>(() => {
		const sectionParam = page.params.section?.toLowerCase() ?? '';
		return SETTINGS_SECTION_SLUGS[sectionParam] ?? SETTINGS_SECTION_TITLES.GENERAL;
	});
	let currentSection = $derived(
		settingSections.find((section) => section.title === activeSection) || settingSections[0]
	);
	let localConfig: SettingsConfigType = $state({ ...config() });

	const unsaved = useUnsavedChanges(
		() => localConfig,
		() => config()
	);
	const scroll = useScrollController();

	function navigateToSection(section: SettingsSectionTitle) {
		const slug = SETTINGS_SECTION_TITLE_TO_SLUG[section];
		goto(`#/settings/${slug}`);
		tick().then(() => {
			document.getElementById('settings-heading')?.focus();
		});
	}

	// Scroll mobile menu to active section on route change
	$effect(() => {
		const section = activeSection;
		const container = scroll.container;
		if (!container) return;
		setTimeout(() => {
			const buttons = container.querySelectorAll('button');
			for (const btn of buttons) {
				const span = btn.querySelector('span');
				if (span && span.textContent?.trim() === section) {
					scroll.scrollToCenter(btn as HTMLElement);
					break;
				}
			}
		}, SCROLL_CENTER_DELAY_MS);
	});

	function handleThemeChange(newTheme: string) {
		localConfig.theme = newTheme;
		// Theme is a display preference — persist immediately so config().theme
		// stays authoritative and survives reload without needing an explicit Save.
		settingsStore.updateConfig('theme', newTheme as SettingsConfigType['theme']);
		applyTheme(newTheme);
	}

	function handleConfigChange(key: string, value: string | boolean) {
		if (key === SETTINGS_KEYS.FILTER_NORMALIZE_MARKDOWN && value === true) {
			localConfig[SETTINGS_KEYS.FILTER_CODEBLOCK_ONLY] = false;
		} else if (key === SETTINGS_KEYS.SYSTEM_MESSAGE) {
			// If system message, tool calls changed, reset presets entirely
			presetsStore.clearActivePreset(false);
			const toastMsg = `Preset is no longer active because ${SETTINGS_KEYS.SYSTEM_MESSAGE ? 'system prompt' : 'built in tools list'} has changed`;
			toast.info(toastMsg);
		}

		localConfig[key] = value;
	}

	function handleReset() {
		localConfig = { ...config() };

		applyTheme(localConfig.theme as string);
	}

	function handleSave() {
		if (localConfig.custom && typeof localConfig.custom === 'string' && localConfig.custom.trim()) {
			try {
				JSON.parse(localConfig.custom);
			} catch (error) {
				toast.error('Invalid JSON in custom parameters. Please check the format and try again.');
				console.error(error);
				return;
			}
		}

		// Convert numeric strings to numbers for numeric fields
		const processedConfig = { ...localConfig };

		for (const field of NUMERIC_FIELDS) {
			if (processedConfig[field] !== undefined && processedConfig[field] !== '') {
				const numValue = Number(processedConfig[field]);
				if (!isNaN(numValue)) {
					if ((POSITIVE_INTEGER_FIELDS as readonly string[]).includes(field)) {
						processedConfig[field] = Math.max(1, Math.round(numValue));
					} else {
						processedConfig[field] = numValue;
					}
				} else {
					toast.error(`Invalid numeric value for ${field}. Please enter a valid number.`);
					return;
				}
			}
		}

		settingsStore.updateMultipleConfig(processedConfig);
	}

	export function reset() {
		localConfig = { ...config() };

		setTimeout(scroll.update, SCROLL_UPDATE_DELAY_MS);
	}

	function handleOpenSkillsPage() {
		goto('#/skills');
	}
</script>

<div class="flex h-full flex-col overflow-hidden md:flex-row">
	<!-- Desktop Sidebar -->
	<div class="hidden w-64 border-r border-border/30 p-6 md:block">
		<nav class="space-y-1 py-2">
			{#each settingSections as section (section.title)}
				<button
					aria-current={activeSection === section.title ? 'page' : undefined}
					class="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors transition-transform duration-75 hover:bg-accent active:scale-[0.98] {activeSection ===
					section.title
						? 'bg-accent text-accent-foreground'
						: 'text-muted-foreground hover:bg-muted'}"
					onclick={() => navigateToSection(section.title)}
				>
					<section.icon class="h-4 w-4" />

					<span class="ml-2">{section.title}</span>
				</button>
			{/each}
		</nav>
	</div>

	<!-- Mobile Header with Horizontal Scrollable Menu -->
	<div class="flex flex-col pt-6 md:hidden">
		<div class="border-b border-border/30 pt-4 md:py-4">
			<!-- Horizontal Scrollable Category Menu with Navigation -->
			<div class="relative flex scroll-p-4 items-center">
				<button
					class="absolute left-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-muted shadow-md backdrop-blur-sm hover:bg-accent motion-safe:transition-opacity {scroll.canScrollLeft
						? 'opacity-100'
						: 'pointer-events-none opacity-0'}"
					onclick={scroll.scrollLeft}
					aria-label="Scroll left"
				>
					<ChevronLeft class="h-4 w-4" />
				</button>

				<div
					class="scrollbar-hide overflow-x-auto py-2"
					bind:this={scroll.container}
					onscroll={scroll.update}
				>
					<div class="flex min-w-max gap-2">
						{#each settingSections as section (section.title)}
							<button
								aria-current={activeSection === section.title ? 'page' : undefined}
								class="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors first:ml-4 last:mr-4 hover:bg-accent {activeSection ===
								section.title
									? 'bg-accent text-accent-foreground'
									: 'text-muted-foreground'}"
								onclick={(e: MouseEvent) => {
									navigateToSection(section.title);
									scroll.scrollToCenter(e.currentTarget as HTMLElement);
								}}
							>
								<section.icon class="h-4 w-4 flex-shrink-0" />
								<span>{section.title}</span>
							</button>
						{/each}
					</div>
				</div>

				<button
					class="absolute right-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-muted shadow-md backdrop-blur-sm hover:bg-accent motion-safe:transition-opacity {scroll.canScrollRight
						? 'opacity-100'
						: 'pointer-events-none opacity-0'}"
					onclick={scroll.scrollRight}
					aria-label="Scroll right"
				>
					<ChevronRight class="h-4 w-4" />
				</button>
			</div>
		</div>
	</div>

	<ScrollArea class="flex-1">
		{#key activeSection}
			<div class="flex h-full flex-col p-4 md:p-6" in:fade={{ duration: 100 }}>
				<div
					class="sticky top-0 z-10 -mx-4 -mt-4 mb-6 hidden items-center gap-2 border-b border-border/30 bg-background px-4 pt-4 pb-6 md:-mx-6 md:-mt-6 md:flex md:px-6 md:pt-6"
				>
					<currentSection.icon class="h-5 w-5" />

					<h3 id="settings-heading" class="text-lg font-semibold" tabindex="-1">
						{currentSection.title}
					</h3>
				</div>

				<div class="min-h-0 flex-1">
					{#if currentSection.title === SETTINGS_SECTION_TITLES.IMPORT_EXPORT}
						<ChatSettingsImportExportTab />
					{:else if currentSection.title === SETTINGS_SECTION_TITLES.CONNECTION}
						<ChatSettingsConnectionTab
							subagentEnabled={!!localConfig[SETTINGS_KEYS.BUILTIN_TOOL_CALL_SUBAGENT]}
						/>
					{:else if currentSection.title === SETTINGS_SECTION_TITLES.MCP}
						<div class="space-y-6">
							<ChatSettingsFields
								fields={currentSection.fields}
								{localConfig}
								onConfigChange={handleConfigChange}
								onThemeChange={handleThemeChange}
							/>

							{#if localConfig.mcpSummarizeOutputs}
								<div class="ml-1 space-y-4 border-l-2 border-border/40 pl-4">
									<ChatSettingsFields
										fields={[
											{
												key: SETTINGS_KEYS.MCP_SUMMARIZE_LINE_THRESHOLD,
												label: 'Soft line threshold',
												type: SettingsFieldType.INPUT
											},
											{
												key: SETTINGS_KEYS.MCP_SUMMARIZE_HARD_CAP,
												label: 'Hard line cap (-1 to disable)',
												type: SettingsFieldType.INPUT
											},
											{
												key: SETTINGS_KEYS.MCP_SUMMARIZE_ALL_TOOLS,
												label: 'Apply to all tools (including built-in)',
												type: SettingsFieldType.CHECKBOX
											},
											{
												key: SETTINGS_KEYS.MCP_SUMMARIZE_AUTO_TIMEOUT,
												label: 'Auto-keep-raw timeout (s, 0 = off)',
												type: SettingsFieldType.INPUT
											}
										]}
										{localConfig}
										onConfigChange={handleConfigChange}
										onThemeChange={handleThemeChange}
									/>
								</div>
							{/if}

							<SettingsSectionDivider>
								<McpServersSettings />
							</SettingsSectionDivider>

							<SettingsSectionDivider>
								<BuiltinToolsSection {localConfig} onConfigChange={handleConfigChange} />
							</SettingsSectionDivider>

							<!-- Skills Section -->
							<SettingsSectionDivider>
								<h4 class="mb-2 text-sm font-semibold">Skills</h4>
								<p class="mb-3 text-xs text-muted-foreground">
									Enabled skills are available for model discovery via <code
										class="rounded bg-muted px-1 py-0.5 text-[10px]">list_skill()</code
									>.
								</p>
								<div class="flex items-center gap-2">
									<Button size="sm" variant="outline" onclick={handleOpenSkillsPage}>
										<Wrench class="mr-1.5 h-3.5 w-3.5" />
										Manage Skills
									</Button>
									<span class="text-xs text-muted-foreground">
										{skillsStore.skills.length} skill{skillsStore.skills.length !== 1 ? 's' : ''} available,
										{skillsStore.enabledSkills.length} enabled
									</span>
								</div>
							</SettingsSectionDivider>
						</div>
					{:else}
						<div class="space-y-6">
							<ChatSettingsFields
								fields={currentSection.fields}
								{localConfig}
								onConfigChange={handleConfigChange}
								onThemeChange={handleThemeChange}
							/>
						</div>
					{/if}
				</div>

				<div class="mt-8 border-t pt-6">
					<p class="text-xs text-muted-foreground">Settings are saved in browser's localStorage</p>
				</div>
			</div>
		{/key}
		<ChatSettingsFooter onReset={handleReset} onSave={handleSave} isDirty={unsaved.isDirty} />
	</ScrollArea>
</div>
