import { setMode, setTheme } from 'mode-watcher';
import { ColorMode } from '$lib/enums/ui';
import { browser } from '$app/environment';
import { createModuleLogger } from './logger';

const CUSTOM_THEMES = new Set<string>([ColorMode.TOKYO_NIGHT, ColorMode.EVERFOREST]);

/** Track the last theme we applied to avoid redundant work. */
let lastAppliedTheme: string | undefined;

const logger = createModuleLogger('Theme');

/**
 * Apply a theme to the document.
 *
 * For built-in themes (light, dark, system) this delegates to mode-watcher.
 * For custom themes (tokyo-night, everforest) it forces dark mode via
 * mode-watcher and sets a data-theme attribute via mode-watcher's setTheme(),
 * which persists the value to localStorage['mode-watcher-theme'] so that
 * mode-watcher's own reactive system restores it correctly on page reload
 * (preventing mode-watcher's derivedTheme from overwriting data-theme with "").
 *
 * This function is idempotent — calling it with the same theme repeatedly
 * is a no-op. This prevents infinite reactive loops caused by
 * mode-watcher's PersistedState bumping its version on every write.
 */
export function applyTheme(theme: string): void {
	if (!browser) return;
	if (theme === lastAppliedTheme) return;
	lastAppliedTheme = theme;

	if (CUSTOM_THEMES.has(theme)) {
		const desired = 'dark';
		const currentMode = localStorage.getItem('mode-watcher-mode');
		if (currentMode !== desired) {
			logger.debug(`Mode set ${currentMode}`);
			setMode(desired);
		}
		const currentTheme = localStorage.getItem('mode-watcher-theme');
		if (currentTheme !== theme) {
			logger.debug(`Theme set ${currentTheme}`);
			setTheme(theme);
		}
	} else {
		const desired = theme as 'light' | 'dark' | 'system';
		const currentMode = localStorage.getItem('mode-watcher-mode');
		if (currentMode !== desired) {
			logger.debug(`(No custom) Mode set ${currentMode}`);
			setMode(desired);
		}
		const currentTheme = localStorage.getItem('mode-watcher-theme');
		if (currentTheme !== '') {
			logger.debug(`(No custom) Mode set ${currentMode}`);
			setTheme('');
		}
	}
}
