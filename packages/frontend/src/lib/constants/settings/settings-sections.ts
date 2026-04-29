/**
 * Settings section titles constants for ChatSettings component.
 *
 * These titles define the navigation sections in the settings dialog.
 * Used for both sidebar navigation and mobile horizontal scroll menu.
 */
export const SETTINGS_SECTION_TITLES = {
	GENERAL: 'General',
	DISPLAY: 'Display',
	SAMPLING: 'Sampling',
	PENALTIES: 'Penalties',
	IMPORT_EXPORT: 'Import/Export',
	CONNECTION: 'Connection',
	MCP: 'MCP',
	FILTERS: 'Filters',
	TOOLS: 'Tools',
	DEVELOPER: 'Developer'
} as const;

/** Type for settings section titles */
export type SettingsSectionTitle =
	(typeof SETTINGS_SECTION_TITLES)[keyof typeof SETTINGS_SECTION_TITLES];

/** URL slug → section title mapping for routing */
export const SETTINGS_SECTION_SLUGS: Record<string, SettingsSectionTitle> = {
	general: SETTINGS_SECTION_TITLES.GENERAL,
	display: SETTINGS_SECTION_TITLES.DISPLAY,
	sampling: SETTINGS_SECTION_TITLES.SAMPLING,
	penalties: SETTINGS_SECTION_TITLES.PENALTIES,
	'import-export': SETTINGS_SECTION_TITLES.IMPORT_EXPORT,
	connection: SETTINGS_SECTION_TITLES.CONNECTION,
	mcp: SETTINGS_SECTION_TITLES.MCP,
	filter: SETTINGS_SECTION_TITLES.FILTERS,
	tools: SETTINGS_SECTION_TITLES.TOOLS,
	developer: SETTINGS_SECTION_TITLES.DEVELOPER
};

/** Section title → URL slug mapping for routing */
export const SETTINGS_SECTION_TITLE_TO_SLUG = Object.fromEntries(
	Object.entries(SETTINGS_SECTION_SLUGS).map(([slug, title]) => [title, slug])
) as Record<SettingsSectionTitle, string>;
