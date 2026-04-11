/**
 * Singleton manager for the shared highlight.js theme <style> element.
 *
 * Multiple components (MarkdownContent, SyntaxHighlightedCode) all need the
 * same hljs theme injected into <head>. Without a singleton each instance
 * would inject its own copy — or worse, race to remove all copies and re-add
 * one, leaving the page temporarily un-highlighted.
 *
 * Usage:
 *   // on mount
 *   acquireHighlightTheme();
 *   // when color mode changes
 *   applyHighlightTheme(isDark);
 *   // on destroy
 *   releaseHighlightTheme();
 */

import githubDarkCss from 'highlight.js/styles/github-dark.css?inline';
import githubLightCss from 'highlight.js/styles/github.css?inline';
import { browser } from '$app/environment';

const STYLE_ID = 'hljs-shared-theme';
let refCount = 0;

/** Register a new consumer. Call once per component instance, on mount. */
export function acquireHighlightTheme(): void {
	refCount++;
}

/**
 * Deregister a consumer. When the last consumer unmounts the injected
 * <style> element is removed from <head>.
 */
export function releaseHighlightTheme(): void {
	refCount = Math.max(0, refCount - 1);
	if (refCount === 0 && browser) {
		document.getElementById(STYLE_ID)?.remove();
	}
}

/**
 * Inject or update the single shared hljs theme style element.
 * Safe to call from multiple components — they all write the same content.
 */
export function applyHighlightTheme(isDark: boolean): void {
	if (!browser) return;
	let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
	if (!style) {
		style = document.createElement('style');
		style.id = STYLE_ID;
		document.head.appendChild(style);
	}
	style.textContent = isDark ? githubDarkCss : githubLightCss;
}
