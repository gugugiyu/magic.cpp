import { setMode } from 'mode-watcher';
import { ColorMode } from '$lib/enums/ui';
import { browser } from '$app/environment';

const CUSTOM_THEMES = new Set<string>([ColorMode.TOKYO_NIGHT, ColorMode.EVERFOREST]);

/** Track the last theme we applied to avoid redundant work. */
let lastAppliedTheme: string | undefined;

/**
 * Apply a theme to the document.
 *
 * For built-in themes (light, dark, system) this delegates to mode-watcher.
 * For custom themes (tokyo-night, everforest) it forces dark mode via
 * mode-watcher and sets a data-theme attribute for CSS overrides.
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
		const current = localStorage.getItem('mode-watcher-mode');
		if (current !== desired) {
			setMode(desired);
		}
		if (document.documentElement.dataset.theme !== theme) {
			document.documentElement.dataset.theme = theme;
		}
	} else {
		const desired = theme as 'light' | 'dark' | 'system';
		const current = localStorage.getItem('mode-watcher-mode');
		if (current !== desired) {
			setMode(desired);
		}
		if (document.documentElement.dataset.theme !== undefined) {
			delete document.documentElement.dataset.theme;
		}
	}
}
